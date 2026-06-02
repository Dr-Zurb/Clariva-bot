/**
 * Auto-no-show + wrap-up sweep worker (Patient seeing flow · pf-17).
 *
 * In-process interval worker (mirrors `webhook-worker`'s lifecycle pattern,
 * not the Render-Cron HTTP pattern) that, every `intervalMs` (default 5 min),
 * scans for two distinct mass-mutation candidates:
 *
 *   1. **Auto-no-show.** `pending`/`confirmed` appointments whose
 *      `appointment_date` is more than `doctor_settings.auto_no_show_after_min`
 *      minutes in the past AND have **no** `consultation_sessions` row →
 *      flipped to `status = 'no_show'`. Per-doctor opt-in (NULL = off,
 *      P-D7 default).
 *
 *   2. **Wrap-up sweep (P-Q2, dark-shipped).** When
 *      `AUTO_WRAP_UP_SWEEP_ENABLED === 'true'`, also flips
 *      `pending`/`confirmed` appointments whose linked
 *      `consultation_sessions.status = 'ended'` more than 24h ago to
 *      `status = 'completed'`. Closes P-Q2 — the doctor saw the patient,
 *      then never opened the wrap-up dialog. Marked with a distinct
 *      audit action so a forensic trail distinguishes auto-completes
 *      from doctor-completes.
 *
 * --- Predicate design (Opus pass) --------------------------------------------
 *
 * The "mass-mutation silently rewrites history" risk class (per
 * AGENT-EXECUTION-EFFICIENCY-GUIDE.md § When to escalate to Opus) demands
 * three airtight invariants that the implementation enforces:
 *
 *   I1. **NULL-handling on `auto_no_show_after_min`.** A doctor who hasn't
 *       opted in MUST be invisible to the worker. We achieve this by
 *       scanning `doctor_settings` rows with `auto_no_show_after_min IS
 *       NOT NULL` first, then issuing per-doctor candidate queries —
 *       there is no global query that could collapse NULL into a
 *       cutoff and accidentally include opt-out doctors.
 *
 *   I2. **Status guard on every UPDATE.** Both the no-show flip and the
 *       wrap-up auto-complete UPDATE re-assert
 *       `status IN ('pending','confirmed')` as a predicate so an
 *       overlapping tick (or a doctor who just saved wrap-up between
 *       scan and UPDATE) returns 0 rows and the UPDATE no-ops. We
 *       count those as `raced` (informational, not an error).
 *
 *   I3. **No JOIN-driven mass UPDATE.** We deliberately scan-then-update
 *       per-row instead of a single CTE-driven UPDATE-FROM. The supabase-js
 *       query builder cannot express the predicate
 *       `a.appointment_date < NOW() - (ds.auto_no_show_after_min *
 *       INTERVAL '1 minute')` without a custom RPC — and a custom RPC
 *       would be a separate migration this task explicitly forbids
 *       ("Backend / migrations: none"). Per-row UPDATE is also strictly
 *       safer for I2 (each UPDATE re-asserts the guard).
 *
 * Hard cap of `BATCH_SIZE_CAP` candidates per tick across both buckets,
 * with no-show prioritised over wrap-up sweep — wrap-up is dark-shipped
 * and ops-driven, no-show is the user-visible path that must keep up
 * with steady-state load.
 *
 * --- Lifecycle / safety ------------------------------------------------------
 *
 * `startAutoNoShowWorker(opts?)` returns `{ stop }`. `stop()` clears
 * the interval immediately AND flips a `running` flag so any in-flight
 * tick exits before the next DB call. Re-entrancy is prevented by a
 * `tickInFlight` flag — if a tick is still running when the next interval
 * fires, the new tick is skipped (NOT queued; queueing under DB lag would
 * silently grow a backlog of overlapping scans).
 *
 * Errors inside a tick (DB scan failures, audit log failures) are logged
 * and counted but never thrown — the next tick should always run.
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-17-auto-noshow-worker.md
 * @see backend/migrations/098_doctor_patient_flow_advance.sql
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { logAuditEvent } from '../utils/audit-logger';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default interval between ticks. 5 min matches pf-17 Notes #1: tighter
 * doesn't help (clinic ops happen on minute-scale); looser feels stale.
 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Hard cap on candidates processed per tick across both buckets. Keeps
 * the per-tick cost bounded and prevents a single tick from holding
 * row-level locks long enough to interfere with online traffic. A
 * backlog (post-outage) drains across multiple ticks at this rate.
 */
const BATCH_SIZE_CAP = 100;

/** Wrap-up sweep cutoff — fixed by source plan P-Q2. */
const WRAP_UP_STUCK_HOURS = 24;

// ============================================================================
// Public types
// ============================================================================

export interface AutoNoShowTickResult {
  /** Doctors checked for the no-show predicate (i.e. opted in). */
  doctorsScanned: number;
  /** Appointments flipped to `no_show` this tick. */
  noShowFlipped: number;
  /** Appointments flipped to `completed` via wrap-up sweep this tick. */
  wrapUpFlipped: number;
  /** UPDATEs that returned 0 rows (raced with manual action / overlapping tick). */
  raced: number;
  /** Per-row errors that didn't abort the tick. Aggregated for ops alerts. */
  errors: string[];
  /** IDs flipped to `no_show` (non-PHI; used by callers + tests). */
  noShowIds: string[];
  /** IDs flipped to `completed` via wrap-up sweep (non-PHI). */
  wrapUpIds: string[];
}

export interface StartAutoNoShowWorkerOptions {
  /** Override the tick interval. Default: 5 min. */
  intervalMs?: number;
  /**
   * Test hook: invoked after every tick with the number of rows flipped
   * (no-show + wrap-up combined). Lets unit tests await a tick without
   * polling timers.
   */
  onTick?: (totalFlipped: number, result: AutoNoShowTickResult) => void;
  /**
   * Override the wrap-up sweep flag (defaults to `env.AUTO_WRAP_UP_SWEEP_ENABLED`).
   * Useful for tests + a hypothetical admin-driven dynamic toggle.
   */
  wrapUpSweepEnabled?: boolean;
  /**
   * Inject the admin client (for tests). Defaults to
   * `getSupabaseAdminClient()` per tick so the worker recovers if the
   * client is initialised after worker start.
   */
  getAdminClient?: () => SupabaseClient | null;
}

export interface AutoNoShowWorkerHandle {
  /** Stop the interval and prevent any in-flight tick from continuing past its current DB call. */
  stop: () => void;
  /**
   * Trigger a tick immediately (returns the result). Useful for the
   * QA one-shot script (`scripts/run-auto-no-show-once.ts`-style) and
   * for unit tests that don't want to await `setInterval`.
   */
  runOnce: (correlationId?: string) => Promise<AutoNoShowTickResult>;
}

// ============================================================================
// Public: startAutoNoShowWorker
// ============================================================================

/**
 * Start the in-process auto-no-show + wrap-up sweep worker. Honours
 * `AUTO_NO_SHOW_WORKER_ENABLED` — when explicitly disabled (or unset
 * outside production), logs a single line and returns a no-op handle.
 *
 * Safe to call once per process at startup (after `app.listen`).
 * Idempotency is the caller's responsibility — calling twice will
 * double-schedule.
 */
export function startAutoNoShowWorker(
  opts: StartAutoNoShowWorkerOptions = {},
): AutoNoShowWorkerHandle {
  const intervalMs        = Math.max(1_000, opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  const wrapUpSweep       = opts.wrapUpSweepEnabled ?? env.AUTO_WRAP_UP_SWEEP_ENABLED;
  const adminClientGetter = opts.getAdminClient ?? getSupabaseAdminClient;

  if (!isWorkerEnabled()) {
    logger.info(
      { intervalMs, wrapUpSweep },
      'auto-no-show-worker: disabled by env',
    );
    return {
      stop:    () => undefined,
      runOnce: async () => emptyResult(),
    };
  }

  let stopped       = false;
  let tickInFlight  = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runTick = async (correlationId: string): Promise<AutoNoShowTickResult> => {
    if (stopped) return emptyResult();
    if (tickInFlight) {
      logger.warn(
        { correlationId },
        'auto-no-show-worker: prior tick still in flight — skipping this tick',
      );
      return emptyResult();
    }
    tickInFlight = true;
    try {
      return await runAutoNoShowTick({
        correlationId,
        wrapUpSweep,
        getAdminClient: adminClientGetter,
        shouldAbort:    () => stopped,
      });
    } finally {
      tickInFlight = false;
    }
  };

  const scheduledTick = (): void => {
    const correlationId = `auto-no-show-tick-${Date.now()}`;
    runTick(correlationId)
      .then((result) => {
        const total = result.noShowFlipped + result.wrapUpFlipped;
        opts.onTick?.(total, result);
      })
      .catch((err) => {
        // runAutoNoShowTick swallows its own errors into `result.errors`,
        // so this catch only fires on truly unexpected programmer errors.
        logger.error(
          {
            correlationId,
            error: err instanceof Error ? err.message : String(err),
          },
          'auto-no-show-worker: tick threw unexpectedly (programmer error — investigate)',
        );
      });
  };

  logger.info(
    { intervalMs, wrapUpSweep },
    'auto-no-show-worker: started',
  );

  timer = setInterval(scheduledTick, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logger.info('auto-no-show-worker: stopped');
    },
    runOnce: (correlationId = `auto-no-show-runonce-${Date.now()}`): Promise<AutoNoShowTickResult> =>
      runTick(correlationId),
  };
}

// ============================================================================
// Public (and exported for tests): runAutoNoShowTick
// ============================================================================

/**
 * Single tick — exposed so tests can drive the worker without setInterval
 * (and so a future cron HTTP route can mount it the same way the
 * other workers in this codebase mount their `runXxxJob` exports).
 *
 * Never throws; failures are swallowed into `errors`.
 */
export async function runAutoNoShowTick(args: {
  correlationId:    string;
  wrapUpSweep:      boolean;
  getAdminClient?:  () => SupabaseClient | null;
  shouldAbort?:     () => boolean;
}): Promise<AutoNoShowTickResult> {
  const result      = emptyResult();
  const adminGetter = args.getAdminClient ?? getSupabaseAdminClient;
  const shouldAbort = args.shouldAbort    ?? ((): boolean => false);

  const admin = adminGetter();
  if (!admin) {
    logger.error(
      { correlationId: args.correlationId },
      'auto-no-show-worker: no admin client — tick skipped',
    );
    return result;
  }

  // ── 1. Auto-no-show pass ────────────────────────────────────────────────
  await runNoShowPass({
    admin,
    correlationId: args.correlationId,
    result,
    shouldAbort,
  });

  // ── 2. Wrap-up sweep (gated, dark-ship) ─────────────────────────────────
  if (args.wrapUpSweep && !shouldAbort()) {
    const remaining = BATCH_SIZE_CAP - result.noShowFlipped;
    if (remaining > 0) {
      await runWrapUpSweepPass({
        admin,
        correlationId: args.correlationId,
        result,
        cap:           remaining,
        shouldAbort,
      });
    }
  }

  logger.info(
    {
      correlationId:  args.correlationId,
      doctorsScanned: result.doctorsScanned,
      noShowFlipped:  result.noShowFlipped,
      wrapUpFlipped:  result.wrapUpFlipped,
      raced:          result.raced,
      errors:         result.errors.length,
      noShowIds:      result.noShowIds,
      wrapUpIds:      result.wrapUpIds,
    },
    'auto-no-show-worker: tick complete',
  );

  return result;
}

// ============================================================================
// Internal: no-show pass
// ============================================================================

async function runNoShowPass(args: {
  admin:         SupabaseClient;
  correlationId: string;
  result:        AutoNoShowTickResult;
  shouldAbort:   () => boolean;
}): Promise<void> {
  // 1a. Pull doctors who have opted in. NULL → excluded by `.not('...', 'is', null)`,
  //     so doctors who never visited Settings stay invisible (P-D7 default).
  const { data: optedInDoctors, error: dsErr } = await args.admin
    .from('doctor_settings')
    .select('doctor_id, auto_no_show_after_min')
    .not('auto_no_show_after_min', 'is', null);

  if (dsErr) {
    logger.error(
      { correlationId: args.correlationId, error: dsErr.message },
      'auto-no-show-worker: doctor_settings scan failed',
    );
    args.result.errors.push(`doctor_settings_scan: ${dsErr.message}`);
    return;
  }

  const doctors = (optedInDoctors ?? []) as Array<{
    doctor_id:               string;
    auto_no_show_after_min:  number;
  }>;
  args.result.doctorsScanned = doctors.length;
  if (doctors.length === 0) return;

  // 1b. Per-doctor candidate scan, accumulating into a global candidate pool
  //     capped at BATCH_SIZE_CAP. Each candidate carries its doctor's
  //     opted-in minute window so the audit row records *why* it was flipped.
  type Candidate = { id: string; doctorId: string; minutes: number };
  const candidates: Candidate[] = [];

  for (const ds of doctors) {
    if (args.shouldAbort()) return;
    if (candidates.length >= BATCH_SIZE_CAP) break;

    const minutes = ds.auto_no_show_after_min;
    // CHECK constraint in migration 098 enforces [5, 240] OR NULL — this
    // is belt-and-braces in case a manual UPDATE bypasses the constraint.
    if (!Number.isInteger(minutes) || minutes <= 0) {
      logger.warn(
        {
          correlationId: args.correlationId,
          doctorId:      ds.doctor_id,
          minutes,
        },
        'auto-no-show-worker: ignoring doctor with non-positive auto_no_show_after_min',
      );
      continue;
    }

    const cutoffIso = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const remaining = BATCH_SIZE_CAP - candidates.length;

    const { data: rows, error: scanErr } = await args.admin
      .from('appointments')
      .select('id, doctor_id, appointment_date')
      .eq('doctor_id', ds.doctor_id)
      .in('status', ['pending', 'confirmed'])
      .lt('appointment_date', cutoffIso)
      .order('appointment_date', { ascending: true })
      .limit(remaining);

    if (scanErr) {
      logger.error(
        {
          correlationId: args.correlationId,
          doctorId:      ds.doctor_id,
          error:         scanErr.message,
        },
        'auto-no-show-worker: per-doctor scan failed (continuing other doctors)',
      );
      args.result.errors.push(`appointment_scan(${ds.doctor_id}): ${scanErr.message}`);
      continue;
    }

    if (!rows || rows.length === 0) continue;

    // 1c. Filter out appointments that already have any consultation_sessions
    //     row (consult started → not a no-show, doctor handles it). Done in
    //     a second batched IN-query rather than a join because supabase-js's
    //     embedded resource expansion would force a left join with
    //     side-effects on RLS / column selection.
    const ids = rows.map((r) => r.id as string);
    const { data: sessions, error: sessErr } = await args.admin
      .from('consultation_sessions')
      .select('appointment_id')
      .in('appointment_id', ids);

    if (sessErr) {
      logger.error(
        {
          correlationId: args.correlationId,
          doctorId:      ds.doctor_id,
          error:         sessErr.message,
        },
        'auto-no-show-worker: consultation_sessions exclusion-scan failed (skipping doctor for safety)',
      );
      args.result.errors.push(
        `consultation_sessions_scan(${ds.doctor_id}): ${sessErr.message}`,
      );
      // SAFETY: skip this doctor entirely on this tick rather than
      // potentially flipping appointments that DID have a session — the
      // exclusion is the difference between "patient never showed" and
      // "doctor saw the patient and forgot to wrap up". Better to defer
      // a tick than to mis-flip.
      continue;
    }

    const excludedIds = new Set(
      (sessions ?? []).map((s) => s.appointment_id as string),
    );

    for (const r of rows) {
      const id = r.id as string;
      if (excludedIds.has(id)) continue;
      candidates.push({ id, doctorId: r.doctor_id as string, minutes });
      if (candidates.length >= BATCH_SIZE_CAP) break;
    }
  }

  // 1d. Per-row atomic UPDATE with status guard.
  for (const c of candidates) {
    if (args.shouldAbort()) return;
    await flipToNoShow({
      admin:         args.admin,
      correlationId: args.correlationId,
      candidate:     c,
      result:        args.result,
    });
  }
}

async function flipToNoShow(args: {
  admin:         SupabaseClient;
  correlationId: string;
  candidate:     { id: string; doctorId: string; minutes: number };
  result:        AutoNoShowTickResult;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await args.admin
    .from('appointments')
    .update({ status: 'no_show', updated_at: nowIso })
    .eq('id', args.candidate.id)
    .in('status', ['pending', 'confirmed'])
    .select('id')
    .maybeSingle();

  if (updErr) {
    logger.error(
      {
        correlationId: args.correlationId,
        appointmentId: args.candidate.id,
        doctorId:      args.candidate.doctorId,
        error:         updErr.message,
      },
      'auto-no-show-worker: no-show UPDATE failed (continuing batch)',
    );
    args.result.errors.push(`no_show_update(${args.candidate.id}): ${updErr.message}`);
    return;
  }

  if (!updated) {
    args.result.raced += 1;
    logger.debug(
      {
        correlationId: args.correlationId,
        appointmentId: args.candidate.id,
        doctorId:      args.candidate.doctorId,
      },
      'auto-no-show-worker: UPDATE raced — appointment already moved out of pending/confirmed',
    );
    return;
  }

  args.result.noShowFlipped += 1;
  args.result.noShowIds.push(args.candidate.id);

  await safeAudit({
    correlationId: args.correlationId,
    action:        'appointment.auto_no_show',
    resourceId:    args.candidate.id,
    metadata: {
      source:           'worker',
      reason:           'no_consultation_started_after_threshold',
      doctorId:         args.candidate.doctorId,
      thresholdMinutes: args.candidate.minutes,
    },
  });

  logger.info(
    {
      correlationId:    args.correlationId,
      appointmentId:    args.candidate.id,
      doctorId:         args.candidate.doctorId,
      thresholdMinutes: args.candidate.minutes,
    },
    'auto-no-show-worker: appointment flipped to no_show',
  );
}

// ============================================================================
// Internal: wrap-up sweep pass (P-Q2, dark-shipped)
// ============================================================================

async function runWrapUpSweepPass(args: {
  admin:         SupabaseClient;
  correlationId: string;
  result:        AutoNoShowTickResult;
  cap:           number;
  shouldAbort:   () => boolean;
}): Promise<void> {
  const cutoffIso = new Date(Date.now() - WRAP_UP_STUCK_HOURS * 60 * 60 * 1000).toISOString();

  // 2a. Pull `consultation_sessions.status='ended'` rows whose
  //     `actual_ended_at` is older than the wrap-up cutoff. We then check
  //     the linked appointment in the per-row UPDATE — its status guard
  //     does the heavy lifting.
  const { data: sessions, error: sessErr } = await args.admin
    .from('consultation_sessions')
    .select('appointment_id, actual_ended_at')
    .eq('status', 'ended')
    .lt('actual_ended_at', cutoffIso)
    .order('actual_ended_at', { ascending: true })
    .limit(args.cap);

  if (sessErr) {
    logger.error(
      { correlationId: args.correlationId, error: sessErr.message },
      'auto-no-show-worker: wrap-up sweep scan failed',
    );
    args.result.errors.push(`wrap_up_scan: ${sessErr.message}`);
    return;
  }

  const rows = (sessions ?? []) as Array<{
    appointment_id:    string;
    actual_ended_at:   string;
  }>;
  if (rows.length === 0) return;

  // De-duplicate: a single appointment can have at most one
  // consultation_session in steady state, but defend in depth anyway.
  const seen = new Set<string>();
  for (const row of rows) {
    if (args.shouldAbort()) return;
    const appointmentId = row.appointment_id;
    if (!appointmentId || seen.has(appointmentId)) continue;
    seen.add(appointmentId);

    await flipToCompletedFromWrapUp({
      admin:         args.admin,
      correlationId: args.correlationId,
      appointmentId,
      sessionEndedAt: row.actual_ended_at,
      result:        args.result,
    });
  }
}

async function flipToCompletedFromWrapUp(args: {
  admin:           SupabaseClient;
  correlationId:   string;
  appointmentId:   string;
  sessionEndedAt:  string;
  result:          AutoNoShowTickResult;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await args.admin
    .from('appointments')
    .update({ status: 'completed', updated_at: nowIso })
    .eq('id', args.appointmentId)
    .in('status', ['pending', 'confirmed'])
    .select('id, doctor_id')
    .maybeSingle();

  if (updErr) {
    logger.error(
      {
        correlationId: args.correlationId,
        appointmentId: args.appointmentId,
        error:         updErr.message,
      },
      'auto-no-show-worker: wrap-up auto-complete UPDATE failed (continuing batch)',
    );
    args.result.errors.push(
      `wrap_up_update(${args.appointmentId}): ${updErr.message}`,
    );
    return;
  }

  if (!updated) {
    args.result.raced += 1;
    logger.debug(
      { correlationId: args.correlationId, appointmentId: args.appointmentId },
      'auto-no-show-worker: wrap-up UPDATE raced — appointment already not pending/confirmed',
    );
    return;
  }

  args.result.wrapUpFlipped += 1;
  args.result.wrapUpIds.push(args.appointmentId);

  const doctorId = (updated as { id: string; doctor_id?: string }).doctor_id;

  await safeAudit({
    correlationId: args.correlationId,
    action:        'appointment.auto_completed_wrap_up_stuck',
    resourceId:    args.appointmentId,
    metadata: {
      source:          'worker',
      reason:          'consultation_ended_without_wrap_up',
      stuckHours:      WRAP_UP_STUCK_HOURS,
      sessionEndedAt:  args.sessionEndedAt,
      ...(doctorId ? { doctorId } : {}),
    },
  });

  logger.info(
    {
      correlationId:  args.correlationId,
      appointmentId:  args.appointmentId,
      doctorId,
      stuckHours:     WRAP_UP_STUCK_HOURS,
    },
    'auto-no-show-worker: appointment auto-completed (wrap-up sweep)',
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the worker-enabled flag with the production default.
 *   - explicit `true`  → enabled
 *   - explicit `false` → disabled
 *   - unset            → enabled iff `NODE_ENV === 'production'`
 */
function isWorkerEnabled(): boolean {
  if (env.AUTO_NO_SHOW_WORKER_ENABLED === true)  return true;
  if (env.AUTO_NO_SHOW_WORKER_ENABLED === false) return false;
  return env.NODE_ENV === 'production';
}

/**
 * Audit-log wrapper that swallows failures into the per-tick error
 * channel. We never let a failed audit insert prevent a successful
 * status flip — the row is already flipped at this point.
 */
async function safeAudit(args: {
  correlationId: string;
  action:        string;
  resourceId:    string;
  metadata:      Record<string, unknown>;
}): Promise<void> {
  try {
    await logAuditEvent({
      correlationId: args.correlationId,
      action:        args.action,
      resourceType:  'appointment',
      resourceId:    args.resourceId,
      status:        'success',
      metadata:      args.metadata,
    });
  } catch (err) {
    logger.error(
      {
        correlationId: args.correlationId,
        appointmentId: args.resourceId,
        action:        args.action,
        error:         err instanceof Error ? err.message : String(err),
      },
      'auto-no-show-worker: audit log insert threw (status flip already persisted)',
    );
  }
}

function emptyResult(): AutoNoShowTickResult {
  return {
    doctorsScanned: 0,
    noShowFlipped:  0,
    wrapUpFlipped:  0,
    raced:          0,
    errors:         [],
    noShowIds:      [],
    wrapUpIds:      [],
  };
}

// ============================================================================
// Test-only exports
// ============================================================================

/** @internal — tests only. */
export const __testInternals = {
  DEFAULT_INTERVAL_MS,
  BATCH_SIZE_CAP,
  WRAP_UP_STUCK_HOURS,
  isWorkerEnabled,
};
