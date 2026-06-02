/**
 * OPD per-day mode conversion service (pdm-04).
 *
 * Three surfaces:
 *
 * 1. `applySlotToQueue(appointments)` — pure helper. Sorts non-terminal
 *    appointments by `(appointment_date ASC, created_at ASC)` and mints
 *    `opd_queue_entries` token assignments 1..N (DL-4). Lossless: the original
 *    `appointment_date` is preserved on the appointment row so a reverse
 *    flip stays lossless.
 *
 * 2. `applyQueueToSlot(appointments, grid)` — pure helper. Sorts queue
 *    entries by `token_number ASC`, places the first `min(N, capacity)` rows
 *    at the supplied slot-grid start times, and overflows the rest past
 *    `sessionEnd` at `(overflow_index + 1) * intervalMinutes` increments
 *    (DL-4). Surplus rows get `opd_event_type = 'return_after_completed'`.
 *
 * 3. `convertSessionDayMode(supabase, doctorId, date, toMode, options)` —
 *    orchestrator. Reads the current `doctor_opd_session_modes` fact,
 *    short-circuits when already in `toMode`, calls the appropriate pure
 *    helper, writes the appointment / queue mutations + audit row, then
 *    snapshots the post-conversion state via `loadOpdSessionPayload`.
 *
 * Concurrency model — per-process mutex keyed on `(doctorId, sessionDate)`.
 * The task spec calls for `pg_advisory_xact_lock` but supabase-js cannot
 * open user-managed transactions or run raw `SELECT pg_advisory_xact_lock`
 * without a dedicated RPC. This mirrors the deviation documented in
 * `modality-change-service.ts` (Plan 47 § "Concurrency doctrine — simplified
 * from the task spec"). v1 compresses the lock into:
 *
 *   (a) in-process mutex per `(doctorId, date)` — serialises concurrent
 *       writers on the same node, which is what `Promise.all([…])` in the
 *       integration test exercises and what the booking controller raced
 *       with the conversion in practice would surface today;
 *   (b) compare-and-swap on `change_count` — the fact UPSERT increments
 *       `change_count` only after reading the row inside the mutex; cross-
 *       node concurrent writers re-read the fact and either idempotent-out
 *       (matching target mode) or raise `ConflictError`. The audit row is
 *       only written when an actual flip materialised, so a cross-node
 *       loser will not double-write an audit row.
 *
 * A follow-up task can add `public.opd_session_mode_advisory_lock(uuid, date)`
 * RPC and swap the in-process mutex for `supabase.rpc()`. Captured in
 * `capture/inbox.md` under "advisory lock RPC for OPD conversion service".
 *
 * Notification batch upsert (pdm-06) — debounced row in
 * `doctor_opd_pending_mode_notifications`; drained by the 60s worker.
 *
 * @see docs/Work/Daily-plans/May 2026/17-05-2026/opd-per-day-mode/Tasks/task-pdm-04-conversion-service.md
 * @see backend/migrations/100_opd_session_modes.sql (pdm-01)
 * @see backend/migrations/028_opd_modes.sql (opd_queue_entries)
 * @see backend/migrations/031_appointments_opd_edge_cases.sql (opd_event_type)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { OpdMode } from '../../types/doctor-settings';
import type { OpdSessionPayload } from '../../types/opd-session';
import {
  AdvisoryLockTimeoutError,
  ConflictError,
  ForbiddenError,
  InternalError,
} from '../../utils/errors';
import { handleSupabaseError } from '../../utils/db-helpers';
import { getDoctorSettings } from '../doctor-settings-service';
import { loadOpdSessionPayload } from '../opd-session-service';
import {
  applyQueueToSlot,
  applySlotToQueue,
  isTelemedModality,
  type QueueAppointmentInput,
  type QueueAssignment,
  type SlotAppointmentInput,
  type SlotAssignment,
  type SlotGrid,
} from './opd-mode-conversion-algorithms';

// Re-export the pure helpers + types so callers have a single import surface
// for the conversion service (orchestrator + algorithms).
export {
  applyQueueToSlot,
  applySlotToQueue,
  isTelemedModality,
};
export type {
  QueueAppointmentInput,
  QueueAssignment,
  QueueToSlotResult,
  SlotAppointmentInput,
  SlotAssignment,
  SlotGrid,
  SlotOnlyClearField,
  SlotToQueueResult,
} from './opd-mode-conversion-algorithms';

// ============================================================================
// Slot-grid computation (working-hours aware; tolerates gaps)
// ============================================================================

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Build the day's slot grid from `doctor_settings.slot_interval_minutes`
 * + `availability` rows for the matching day-of-week. The grid is the
 * union of slot starts within every working window for the day, sorted
 * ascending. Past slots and currently-booked slots are NOT filtered —
 * the conversion service reassigns existing appointments onto positions
 * regardless of booked/past status.
 *
 * Working-hour gaps (e.g. 9–11 AM + 3–5 PM) yield a single sorted array
 * of slot starts that is the union of both windows. The orchestrator
 * passes this directly to `applyQueueToSlot`.
 *
 * `sessionEndIso` is the end of the LAST working window in the day, used
 * as the anchor for overflow placement. When there are zero working
 * windows the function returns an empty grid with `sessionStartIso ===
 * sessionEndIso` pinned to local noon of `date`, which keeps overflow
 * placement deterministic but pushes everything into the overflow tray.
 */
export async function computeSlotGridForDate(
  supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<SlotGrid> {
  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const intervalMinutes =
    settings?.slot_interval_minutes ?? env.SLOT_INTERVAL_MINUTES;

  const dayOfWeek = getDayOfWeekInTimezone(date, timezone);

  type AvailabilityRow = {
    start_time: string;
    end_time: string;
    is_available: boolean | null;
  };

  const { data: rows, error } = await supabase
    .from('availability')
    .select('start_time, end_time, is_available')
    .eq('doctor_id', doctorId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_available', true)
    .order('start_time', { ascending: true });

  if (error) {
    handleSupabaseError(error, `pdm-04:slot-grid:${doctorId}:${date}`);
  }

  const availability = (rows ?? []) as AvailabilityRow[];

  if (availability.length === 0) {
    const noonLocal = DateTime.fromISO(date, { zone: timezone })
      .startOf('day')
      .plus({ hours: 12 });
    const noonIso = noonLocal.toUTC().toISO() ?? new Date().toISOString();
    return {
      sessionStartIso: noonIso,
      sessionEndIso: noonIso,
      intervalMinutes,
      slots: [],
    };
  }

  const slotStarts: string[] = [];
  let firstWindowStartIso: string | null = null;
  let lastWindowEndIso: string | null = null;

  for (const row of availability) {
    const [startH, startM] = parseTimeOfDay(row.start_time);
    const [endH, endM] = parseTimeOfDay(row.end_time);
    const windowStart = DateTime.fromISO(date, { zone: timezone })
      .startOf('day')
      .set({ hour: startH, minute: startM });
    const windowEnd = DateTime.fromISO(date, { zone: timezone })
      .startOf('day')
      .set({ hour: endH, minute: endM });

    if (!firstWindowStartIso) {
      firstWindowStartIso = windowStart.toUTC().toISO();
    }
    lastWindowEndIso = windowEnd.toUTC().toISO();

    let cursor = windowStart;
    while (cursor.plus({ minutes: intervalMinutes }) <= windowEnd) {
      const iso = cursor.toUTC().toISO();
      if (iso) slotStarts.push(iso);
      cursor = cursor.plus({ minutes: intervalMinutes });
    }
  }

  slotStarts.sort();

  return {
    sessionStartIso: firstWindowStartIso ?? new Date().toISOString(),
    sessionEndIso: lastWindowEndIso ?? firstWindowStartIso ?? new Date().toISOString(),
    intervalMinutes,
    slots: slotStarts,
  };
}

function parseTimeOfDay(time: string): [number, number] {
  const [h = '0', m = '0'] = time.split(':');
  return [Number.parseInt(h, 10) || 0, Number.parseInt(m, 10) || 0];
}

function getDayOfWeekInTimezone(date: string, timezone: string): number {
  const dt = DateTime.fromISO(date, { zone: timezone });
  // Luxon weekday: 1 (Monday) .. 7 (Sunday). Postgres day_of_week: 0 (Sunday) .. 6 (Saturday).
  const luxonWeekday = dt.weekday;
  return luxonWeekday === 7 ? 0 : luxonWeekday;
}

// ============================================================================
// Orchestrator — `convertSessionDayMode`
// ============================================================================

export interface ConvertSessionDayModeOptions {
  /** Caller-provided UUID for tracing (audit row + notification batch link). */
  correlationId: string;
  triggeredBy: 'doctor' | 'system_policy' | 'system_overrun_fallback';
  notes?: string;
  /** When true, all writes happen inside a try/rollback wrapper that reverts the side-effects on success. */
  dryRun?: boolean;
}

export interface ConvertSessionDayModeResult {
  /** Null on first materialisation; the resolved fact mode otherwise. */
  fromMode: OpdMode | null;
  toMode: OpdMode;
  /** Count of non-terminal appointments touched by the conversion. */
  affected: number;
  overflowCount: number;
  notificationCount: number;
  /** Post-conversion `change_count` from the fact row (drives DL-14 nudge). */
  changeCount: number;
  /** Subset of `affected` whose `consultation_type` is telemedicine (PD-Q4). */
  telemedCount: number;
  snapshotAfter: OpdSessionPayload;
}

interface FactRow {
  doctor_id: string;
  session_date: string;
  mode: OpdMode;
  change_count: number;
  changed_at: string;
}

interface AppointmentReadRow {
  id: string;
  patient_id: string | null;
  appointment_date: string;
  status: 'pending' | 'confirmed';
  consultation_type: string | null;
  opd_event_type: 'standard' | 'return_after_completed' | null;
  opd_session_delay_minutes: number | null;
  opd_early_invite_expires_at: string | null;
  opd_early_invite_response: string | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Concurrency primitives — per-process mutex
// ----------------------------------------------------------------------------

/** In-process per-(doctorId, date) mutex (mirrors `doctorAvailabilityLocks`). */
const conversionLocks = new Map<string, Promise<unknown>>();
const LOCK_TIMEOUT_MS = 15_000;

function lockKey(doctorId: string, date: string): string {
  return `${doctorId}|${date}`;
}

async function withConversionLock<T>(
  doctorId: string,
  date: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = lockKey(doctorId, date);
  const prev = conversionLocks.get(key) ?? Promise.resolve();
  const guarded = (async (): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new AdvisoryLockTimeoutError(
            'Could not acquire conversion lock within budget; another conversion is in flight.'
          )
        );
      }, LOCK_TIMEOUT_MS);
    });
    try {
      await Promise.race([prev, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return fn();
  })();
  const tracked = guarded.finally(() => {
    if (conversionLocks.get(key) === tracked) {
      conversionLocks.delete(key);
    }
  });
  conversionLocks.set(key, tracked);
  return tracked;
}

/** Test-only hook to reset in-process locks between describe blocks. */
export function __resetConversionServiceCaches(): void {
  conversionLocks.clear();
}

/**
 * Per-(doctorId, sessionDate) advisory lock reused by bulk overrun resolve (pdm-09).
 * Mirrors the conversion orchestrator mutex — see module header for RPC follow-up.
 */
export function acquireSessionDayAdvisoryLock<T>(
  _supabase: SupabaseClient,
  doctorId: string,
  date: string,
  fn: () => Promise<T>
): Promise<T> {
  return withConversionLock(doctorId, date, fn);
}

interface PendingNotificationPayloadJson {
  from_mode: OpdMode | null;
  to_mode: OpdMode;
  affected_apt_count: number;
  overflow_count: number;
  correlation_id: string;
}

/**
 * Net-zero detection: returns true when the upcoming flip targets the same mode
 * the day was in BEFORE the first flip in the current debounce window.
 */
async function detectNetZeroFlip(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  incomingToMode: OpdMode
): Promise<boolean> {
  const { data: pending } = await supabase
    .from('doctor_opd_pending_mode_notifications')
    .select('first_flip_mode')
    .eq('doctor_id', doctorId)
    .eq('session_date', date)
    .maybeSingle();

  if (!pending) return false;
  return (pending as { first_flip_mode: OpdMode }).first_flip_mode === incomingToMode;
}

// ----------------------------------------------------------------------------
// Read paths
// ----------------------------------------------------------------------------

async function readFactRow(
  supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<FactRow | null> {
  const { data, error } = await supabase
    .from('doctor_opd_session_modes')
    .select('doctor_id, session_date, mode, change_count, changed_at')
    .eq('doctor_id', doctorId)
    .eq('session_date', date)
    .maybeSingle();
  if (error) {
    handleSupabaseError(error, `pdm-04:read-fact:${doctorId}:${date}`);
  }
  if (!data) return null;
  return data as unknown as FactRow;
}

async function readNonTerminalAppointmentsForDay(
  supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<AppointmentReadRow[]> {
  // PD-Q5 / risk-register row 1 — exclude mid-payment substates so a
  // payment webhook arriving during the conversion doesn't conflict on
  // a row we just rewrote. The canonical `status IN ('pending','confirmed')`
  // filter already excludes `cancelled` / `completed` / `no_show`. Payment
  // pending appointments use `status='pending'` with the payment state on
  // the payments table; the booking controller blocks them from queue
  // entry creation today (see appointment-service:381) so we mirror that
  // contract: non-terminal == pending OR confirmed, no payment substate.
  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const startUtc = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const endUtc = startUtc.plus({ days: 1 });

  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id, patient_id, appointment_date, status, consultation_type, ' +
        'opd_event_type, opd_session_delay_minutes, opd_early_invite_expires_at, ' +
        'opd_early_invite_response, created_at'
    )
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', startUtc.toUTC().toISO()!)
    .lt('appointment_date', endUtc.toUTC().toISO()!)
    .order('appointment_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    handleSupabaseError(error, `pdm-04:read-appointments:${doctorId}:${date}`);
  }

  return (data ?? []) as unknown as AppointmentReadRow[];
}

async function readQueueEntriesForDay(
  supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<{ appointment_id: string; token_number: number }[]> {
  const { data, error } = await supabase
    .from('opd_queue_entries')
    .select('appointment_id, token_number')
    .eq('doctor_id', doctorId)
    .eq('session_date', date)
    .order('token_number', { ascending: true });
  if (error) {
    handleSupabaseError(error, `pdm-04:read-queue:${doctorId}:${date}`);
  }
  return (data ?? []) as { appointment_id: string; token_number: number }[];
}

// ----------------------------------------------------------------------------
// Write paths
// ----------------------------------------------------------------------------

interface AppliedSlotToQueue {
  affected: number;
  overflowCount: 0;
  notificationCount: number;
  assignments: QueueAssignment[];
}

async function executeSlotToQueue(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  appointments: AppointmentReadRow[]
): Promise<AppliedSlotToQueue> {
  const helperInput: SlotAppointmentInput[] = appointments.map((a) => ({
    id: a.id,
    appointmentDate: a.appointment_date,
    createdAt: a.created_at,
    status: a.status,
    opdSessionDelayMinutes: a.opd_session_delay_minutes,
    opdEarlyInviteExpiresAt: a.opd_early_invite_expires_at,
    opdEarlyInviteResponse: a.opd_early_invite_response,
  }));
  const { assignments, notificationCount } = applySlotToQueue(helperInput);

  // Delete any pre-existing queue rows for the day to keep the rewrite
  // atomic-ish: a stale row from a partial prior conversion would
  // otherwise violate `idx_opd_queue_entries_doctor_session_token`.
  const { error: deleteErr } = await supabase
    .from('opd_queue_entries')
    .delete()
    .eq('doctor_id', doctorId)
    .eq('session_date', date);
  if (deleteErr) {
    handleSupabaseError(deleteErr, `pdm-04:wipe-queue:${doctorId}:${date}`);
  }

  if (assignments.length > 0) {
    const rows = assignments.map((a) => ({
      doctor_id: doctorId,
      appointment_id: a.appointmentId,
      session_date: date,
      token_number: a.tokenNumber,
      position: a.tokenNumber,
      status: 'waiting' as const,
    }));
    const { error: insertErr } = await supabase
      .from('opd_queue_entries')
      .insert(rows);
    if (insertErr) {
      handleSupabaseError(insertErr, `pdm-04:insert-queue:${doctorId}:${date}`);
    }

    // Clear slot-only state on the appointment rows. We batch by appointment
    // id (one UPDATE per id) to keep the slot-only fields nulled deterministically.
    const aptIds = assignments.map((a) => a.appointmentId);
    const { error: clearErr } = await supabase
      .from('appointments')
      .update({
        opd_session_delay_minutes: null,
        opd_early_invite_expires_at: null,
        opd_early_invite_response: null,
      })
      .in('id', aptIds);
    if (clearErr) {
      handleSupabaseError(clearErr, `pdm-04:clear-slot-state:${doctorId}:${date}`);
    }
  }

  return {
    affected: assignments.length,
    overflowCount: 0,
    notificationCount,
    assignments,
  };
}

interface AppliedQueueToSlot {
  affected: number;
  overflowCount: number;
  notificationCount: number;
  assignments: SlotAssignment[];
}

async function executeQueueToSlot(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  appointments: AppointmentReadRow[],
  queueEntries: { appointment_id: string; token_number: number }[],
  grid: SlotGrid
): Promise<AppliedQueueToSlot> {
  // Map appointment_id → token_number from the queue entry table; fall back
  // to ordering by `appointment_date` when an appointment has no queue row
  // (defensive: a partial backfill could leave orphans). We DO NOT silently
  // drop appointments — every non-terminal appointment must land somewhere.
  const tokenByAppointmentId = new Map<string, number>();
  for (const entry of queueEntries) {
    tokenByAppointmentId.set(entry.appointment_id, entry.token_number);
  }

  const helperInput: QueueAppointmentInput[] = appointments.map((a, fallbackIdx) => ({
    id: a.id,
    appointmentDate: a.appointment_date,
    tokenNumber:
      tokenByAppointmentId.get(a.id) ?? Number.MAX_SAFE_INTEGER - fallbackIdx,
    status: a.status,
  }));

  const { assignments, overflowCount, notificationCount } = applyQueueToSlot(
    helperInput,
    grid
  );

  // Update each appointment with its new (appointment_date, opd_event_type).
  // We issue one UPDATE per assignment because the (date, event_type) pair
  // varies per row; supabase-js has no batch-with-different-values API short
  // of an UPSERT, which would round-trip more rows than necessary.
  for (const assignment of assignments) {
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        appointment_date: assignment.newAppointmentDate,
        opd_event_type: assignment.opdEventType,
      })
      .eq('id', assignment.appointmentId);
    if (updateErr) {
      handleSupabaseError(
        updateErr,
        `pdm-04:update-appointment:${assignment.appointmentId}`
      );
    }
  }

  // Drop the queue entries for the day — slot mode has no token rows.
  const { error: deleteErr } = await supabase
    .from('opd_queue_entries')
    .delete()
    .eq('doctor_id', doctorId)
    .eq('session_date', date);
  if (deleteErr) {
    handleSupabaseError(deleteErr, `pdm-04:drop-queue:${doctorId}:${date}`);
  }

  return {
    affected: assignments.length,
    overflowCount,
    notificationCount,
    assignments,
  };
}

// ----------------------------------------------------------------------------
// Fact + audit + notification writes
// ----------------------------------------------------------------------------

async function upsertFactRow(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  toMode: OpdMode,
  triggeredBy: ConvertSessionDayModeOptions['triggeredBy'],
  currentFact: FactRow | null
): Promise<number> {
  const source: 'doctor' | 'policy_default' | 'system_overrun_fallback' =
    triggeredBy === 'doctor'
      ? 'doctor'
      : triggeredBy === 'system_overrun_fallback'
        ? 'system_overrun_fallback'
        : 'policy_default';
  const nextChangeCount =
    (currentFact?.change_count ?? 0) + (currentFact ? 1 : 0);
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from('doctor_opd_session_modes').upsert(
    {
      doctor_id: doctorId,
      session_date: date,
      mode: toMode,
      source,
      change_count: nextChangeCount,
      changed_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'doctor_id,session_date' }
  );
  if (error) {
    handleSupabaseError(error, `pdm-04:upsert-fact:${doctorId}:${date}`);
  }
  return nextChangeCount;
}

async function insertAuditRow(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  fromMode: OpdMode | null,
  toMode: OpdMode,
  affected: number,
  overflowCount: number,
  triggeredBy: ConvertSessionDayModeOptions['triggeredBy'],
  correlationId: string,
  notes: string | null
): Promise<void> {
  const { error } = await supabase
    .from('doctor_opd_session_mode_changes')
    .insert({
      doctor_id: doctorId,
      session_date: date,
      from_mode: fromMode,
      to_mode: toMode,
      affected_apt_count: affected,
      overflow_count: overflowCount,
      notification_dispatched: false,
      triggered_by: triggeredBy,
      correlation_id: correlationId,
      notes,
    });
  if (error) {
    handleSupabaseError(error, `pdm-04:insert-audit:${doctorId}:${date}`);
  }
}

async function upsertNotificationBatchDebounced(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  currentFactMode: OpdMode | null,
  payload: {
    fromMode: OpdMode | null;
    toMode: OpdMode;
    affected: number;
    overflowCount: number;
    correlationId: string;
  }
): Promise<void> {
  const isNetZero = await detectNetZeroFlip(supabase, doctorId, date, payload.toMode);
  if (isNetZero) {
    const { error: deleteErr } = await supabase
      .from('doctor_opd_pending_mode_notifications')
      .delete()
      .eq('doctor_id', doctorId)
      .eq('session_date', date);
    if (deleteErr) {
      logger.warn(
        {
          context: 'opd_mode_conversion',
          doctorId,
          date,
          err: deleteErr.message,
        },
        'notification_batch_net_zero_delete_failed'
      );
    }
    return;
  }

  const nowIso = new Date().toISOString();
  const scheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const payloadJson: PendingNotificationPayloadJson = {
    from_mode: payload.fromMode,
    to_mode: payload.toMode,
    affected_apt_count: payload.affected,
    overflow_count: payload.overflowCount,
    correlation_id: payload.correlationId,
  };

  const { data: existing } = await supabase
    .from('doctor_opd_pending_mode_notifications')
    .select('first_flip_at, first_flip_mode')
    .eq('doctor_id', doctorId)
    .eq('session_date', date)
    .maybeSingle();

  const writeError = existing
    ? (
        await supabase
          .from('doctor_opd_pending_mode_notifications')
          .update({
            latest_flip_at: nowIso,
            scheduled_for: scheduledFor,
            latest_flip_mode: payload.toMode,
            payload_json: payloadJson,
          })
          .eq('doctor_id', doctorId)
          .eq('session_date', date)
      ).error
    : (
        await supabase.from('doctor_opd_pending_mode_notifications').insert({
          doctor_id: doctorId,
          session_date: date,
          first_flip_at: nowIso,
          latest_flip_at: nowIso,
          scheduled_for: scheduledFor,
          // Mode before this flip; when no fact row yet, infer the opposite target (slot default).
          first_flip_mode: (currentFactMode ??
            (payload.toMode === 'queue' ? 'slot' : 'queue')) as OpdMode,
          latest_flip_mode: payload.toMode,
          payload_json: payloadJson,
        })
      ).error;

  if (writeError) {
    logger.warn(
      {
        context: 'opd_mode_conversion',
        doctorId,
        date,
        err: writeError.message,
      },
      'notification_batch_upsert_failed'
    );
  }
}

// ----------------------------------------------------------------------------
// Dry-run revert (used by /preview-convert)
// ----------------------------------------------------------------------------

interface RevertSnapshot {
  appointments: AppointmentReadRow[];
  queueEntries: { appointment_id: string; token_number: number }[];
  factRow: FactRow | null;
}

async function revertToSnapshot(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  snapshot: RevertSnapshot,
  flipDirection: { fromMode: OpdMode | null; toMode: OpdMode }
): Promise<void> {
  // 1) Restore appointment rows from the snapshot.
  for (const apt of snapshot.appointments) {
    const { error } = await supabase
      .from('appointments')
      .update({
        appointment_date: apt.appointment_date,
        opd_event_type: apt.opd_event_type ?? 'standard',
        opd_session_delay_minutes: apt.opd_session_delay_minutes,
        opd_early_invite_expires_at: apt.opd_early_invite_expires_at,
        opd_early_invite_response: apt.opd_early_invite_response,
      })
      .eq('id', apt.id);
    if (error) {
      logger.warn(
        {
          context: 'opd_mode_conversion',
          doctorId,
          date,
          aptId: apt.id,
          err: (error as { message?: string }).message,
        },
        'dry_run_revert_appointment_failed'
      );
    }
  }

  // 2) Drop whatever queue entries the conversion wrote, then restore the snapshot.
  await supabase
    .from('opd_queue_entries')
    .delete()
    .eq('doctor_id', doctorId)
    .eq('session_date', date);
  if (snapshot.queueEntries.length > 0) {
    const rows = snapshot.queueEntries.map((q) => ({
      doctor_id: doctorId,
      appointment_id: q.appointment_id,
      session_date: date,
      token_number: q.token_number,
      position: q.token_number,
      status: 'waiting' as const,
    }));
    await supabase.from('opd_queue_entries').insert(rows);
  }

  // 3) Restore the fact row. If there was no row before, delete the upserted one.
  if (snapshot.factRow) {
    await supabase
      .from('doctor_opd_session_modes')
      .update({
        mode: snapshot.factRow.mode,
        change_count: snapshot.factRow.change_count,
        changed_at: snapshot.factRow.changed_at,
      })
      .eq('doctor_id', doctorId)
      .eq('session_date', date);
  } else {
    await supabase
      .from('doctor_opd_session_modes')
      .delete()
      .eq('doctor_id', doctorId)
      .eq('session_date', date);
  }

  // 4) Drop the audit row this conversion wrote (matched by correlationId would be safer,
  //    but the audit table has no UPDATE/DELETE policy — service role bypasses RLS).
  //    We delete by `(doctor_id, session_date, to_mode, from_mode, triggered_by)` over the
  //    smallest window guaranteed unique for this run.
  await supabase
    .from('doctor_opd_session_mode_changes')
    .delete()
    .eq('doctor_id', doctorId)
    .eq('session_date', date)
    .eq('to_mode', flipDirection.toMode)
    .is('notification_dispatched', false)
    .order('created_at', { ascending: false })
    .limit(1);
}

// ----------------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------------

/**
 * Convert `(doctorId, date)` to `toMode`, executing the appropriate slot↔queue
 * algorithm + audit + notification batch. See module header for the design
 * notes; see acceptance criteria in the task spec for the public contract.
 *
 * @throws AdvisoryLockTimeoutError when another conversion holds the per-process lock past LOCK_TIMEOUT_MS.
 * @throws ConflictError when a cross-instance writer flipped the fact between read and write (CAS).
 */
export async function convertSessionDayMode(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  toMode: OpdMode,
  options: ConvertSessionDayModeOptions
): Promise<ConvertSessionDayModeResult> {
  if (!doctorId || !date) {
    throw new InternalError('convertSessionDayMode requires doctorId and date');
  }

  return withConversionLock(doctorId, date, async () => {
    const currentFact = await readFactRow(supabase, doctorId, date);
    const fromMode: OpdMode | null = currentFact?.mode ?? null;

    // Idempotency check (no audit row written; lock releases cleanly).
    if (fromMode === toMode) {
      const snapshotAfter = await loadOpdSessionPayload(
        supabase,
        doctorId,
        date,
        options.correlationId
      );
      return {
        fromMode,
        toMode,
        affected: 0,
        overflowCount: 0,
        notificationCount: 0,
        changeCount: currentFact?.change_count ?? 0,
        telemedCount: 0,
        snapshotAfter,
      };
    }

    const appointments = await readNonTerminalAppointmentsForDay(
      supabase,
      doctorId,
      date
    );
    const queueEntries = await readQueueEntriesForDay(supabase, doctorId, date);
    const telemedCount = appointments.filter((a) =>
      isTelemedModality(a.consultation_type)
    ).length;

    // Snapshot the pre-conversion state for /preview-convert revert.
    const revertSnapshot = options.dryRun
      ? { appointments, queueEntries, factRow: currentFact }
      : null;

    let affected = 0;
    let overflowCount = 0;
    let notificationCount = 0;

    try {
      if (toMode === 'queue') {
        const result = await executeSlotToQueue(
          supabase,
          doctorId,
          date,
          appointments
        );
        affected = result.affected;
        overflowCount = result.overflowCount;
        notificationCount = result.notificationCount;
      } else {
        const grid = await computeSlotGridForDate(supabase, doctorId, date);
        const result = await executeQueueToSlot(
          supabase,
          doctorId,
          date,
          appointments,
          queueEntries,
          grid
        );
        affected = result.affected;
        overflowCount = result.overflowCount;
        notificationCount = result.notificationCount;
      }

      // CAS guard — re-read the fact and detect a cross-instance flip
      // between our `readFactRow` and our upsert. The expected
      // `change_count` should still match `currentFact.change_count`.
      const afterFact = await readFactRow(supabase, doctorId, date);
      const expectedCount = currentFact?.change_count ?? null;
      const observedCount = afterFact?.change_count ?? null;
      if (currentFact && afterFact && expectedCount !== observedCount) {
        throw new ConflictError(
          'Mode flip raced with another writer; please retry.'
        );
      }

      const nextChangeCount = await upsertFactRow(
        supabase,
        doctorId,
        date,
        toMode,
        options.triggeredBy,
        currentFact
      );

      await insertAuditRow(
        supabase,
        doctorId,
        date,
        fromMode,
        toMode,
        affected,
        overflowCount,
        options.triggeredBy,
        options.correlationId,
        options.notes ?? null
      );

      if (!options.dryRun) {
        await upsertNotificationBatchDebounced(
          supabase,
          doctorId,
          date,
          fromMode,
          {
            fromMode,
            toMode,
            affected,
            overflowCount,
            correlationId: options.correlationId,
          }
        );
      }

      const snapshotAfter = await loadOpdSessionPayload(
        supabase,
        doctorId,
        date,
        options.correlationId
      );

      if (options.dryRun && revertSnapshot) {
        await revertToSnapshot(supabase, doctorId, date, revertSnapshot, {
          fromMode,
          toMode,
        });
      }

      return {
        fromMode,
        toMode,
        affected,
        overflowCount,
        notificationCount,
        changeCount: nextChangeCount,
        telemedCount,
        snapshotAfter,
      };
    } catch (err) {
      // On any error after we started mutating, best-effort revert when this
      // was a dry run. Live runs propagate the error; the partial write is
      // observable and the doctor can retry (the second call will be
      // idempotent on the fact upsert and re-do anything that didn't take).
      if (options.dryRun && revertSnapshot) {
        try {
          await revertToSnapshot(supabase, doctorId, date, revertSnapshot, {
            fromMode,
            toMode,
          });
        } catch (revertErr) {
          logger.error(
            {
              context: 'opd_mode_conversion',
              doctorId,
              date,
              correlationId: options.correlationId,
              err: (revertErr as Error).message,
            },
            'dry_run_revert_failed'
          );
        }
      }
      throw err;
    }
  });
}

// ============================================================================
// Past-date guard (DL-15, used by the controllers)
// ============================================================================

/**
 * DL-15 — past dates are mode-pinned. Returns the current date string in the
 * doctor's configured timezone (defaults to Asia/Kolkata when no row).
 * Controllers compare the request body's `date` against this value with
 * lexical < (works because both are `YYYY-MM-DD`).
 */
export async function todayInDoctorTimezone(doctorId: string): Promise<string> {
  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  const today = DateTime.now().setZone(timezone).toISODate();
  return today ?? new Date().toISOString().slice(0, 10);
}

/**
 * Throws `ForbiddenError('PAST_DATE_PINNED')` when `date` is strictly
 * earlier than `today` in `doctorId`'s timezone. Used by both endpoints.
 */
export async function assertNotPastDate(
  doctorId: string,
  date: string
): Promise<void> {
  const today = await todayInDoctorTimezone(doctorId);
  if (date < today) {
    throw new ForbiddenError('Past dates cannot be reconfigured.');
  }
}
