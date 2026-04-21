/**
 * Consultation Message Service (Plan 04 · Task 18)
 *
 * Backend-side helpers for `consultation_messages`:
 *
 *   - `listMessagesForSession`: fetch messages for a session (used by
 *     reconnect catch-up paths and any backend that needs the transcript;
 *     the frontend `<TextConsultRoom>` reads via Supabase Realtime
 *     directly, RLS-scoped, and doesn't need this).
 *
 *   - `rateLimitInsertCheck`: per-(session, sender) sliding-window limiter.
 *     **In-memory per backend pod** — the limit is effectively
 *     `MAX × pod_count`. Acceptable for v1; promote to Redis when
 *     traffic warrants. The limiter is consulted by the patient
 *     token-exchange endpoint as a defense-in-depth guard against a
 *     compromised JWT being used to flood the channel.
 *
 * The backend `sendMessage` helper lives in `text-session-supabase.ts` —
 * it bypasses RLS via the service-role client and does its own session
 * status check. This file is for code paths that need RLS-respecting
 * reads or rate-limit checks without owning the insert.
 *
 * @see services/text-session-supabase.ts (the insert path)
 * @see migrations/051_consultation_messages.sql (the table)
 * @see migrations/052_consultation_messages_patient_jwt_rls.sql (the RLS)
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Canonical row-kind union for `consultation_messages`. Post-Task 39, the
 * DB ENUM carries these three values and the row-shape CHECK pins which
 * sibling columns must be populated per kind.
 */
export type ConsultationMessageKind = 'text' | 'attachment' | 'system';

export interface MessageRow {
  id: string;
  sessionId: string;
  senderId: string;
  senderRole: 'doctor' | 'patient' | 'system';
  kind: ConsultationMessageKind;
  /**
   * Present for `text` + `system` rows (load-bearing); optional caption for
   * `attachment` rows; Migration 062's row-shape CHECK pins these rules.
   */
  body: string | null;
  /**
   * Present (non-null) only for `kind === 'attachment'` rows.
   */
  attachmentUrl: string | null;
  /**
   * Present (non-null) only for `kind === 'attachment'` rows.
   */
  attachmentMimeType: string | null;
  /**
   * Present (non-null) only for `kind === 'attachment'` rows; non-negative.
   * See Migration 062 note re: INTEGER vs BIGINT sizing decision.
   */
  attachmentByteSize: number | null;
  /**
   * Present (non-null) only for `kind === 'system'` rows. Plain string — the
   * canonical `SystemEvent` TypeScript union is the source of truth
   * (defined in Task 37's emitter module when it lands). DB-side is
   * deliberately TEXT so Plans 07/08/09 can add event tags additively
   * without coordinating an `ALTER TYPE`.
   */
  systemEvent: string | null;
  createdAt: string;
}

export interface ListMessagesInput {
  sessionId: string;
  /** ISO timestamp — return only messages strictly after this. Used for reconnect catch-up. */
  afterCreatedAt?: string;
  /** Hard cap on returned rows (default 500). */
  limit?: number;
}

export interface RateLimitCheckInput {
  sessionId: string;
  senderId: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remainingInWindow: number;
  /** Seconds until the oldest in-window event ages out (when blocked). */
  retryAfterSeconds: number;
}

// ============================================================================
// listMessagesForSession
// ============================================================================

/**
 * Fetch messages for a session via the service-role client. Caller must
 * have already authorized the requester (the patient token-exchange
 * controller does this via the booking-token verify step).
 *
 * Returns messages ordered oldest → newest so the frontend can append
 * directly without re-sorting.
 */
export async function listMessagesForSession(
  input: ListMessagesInput,
): Promise<MessageRow[]> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    return [];
  }
  const limit = Math.max(1, Math.min(2000, input.limit ?? 500));

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ sessionId }, 'listMessagesForSession: admin client unavailable');
    return [];
  }

  let query = admin
    .from('consultation_messages')
    .select(
      'id, session_id, sender_id, sender_role, kind, body, attachment_url, attachment_mime_type, attachment_byte_size, system_event, created_at',
    )
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (input.afterCreatedAt) {
    query = query.gt('created_at', input.afterCreatedAt);
  }

  const { data, error } = await query;

  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'listMessagesForSession: query failed',
    );
    return [];
  }
  if (!data) return [];

  return data.map((row) => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    senderId: row.sender_id as string,
    senderRole: row.sender_role as 'doctor' | 'patient' | 'system',
    kind: row.kind as ConsultationMessageKind,
    body: (row.body as string | null) ?? null,
    attachmentUrl: (row.attachment_url as string | null) ?? null,
    attachmentMimeType: (row.attachment_mime_type as string | null) ?? null,
    attachmentByteSize:
      typeof row.attachment_byte_size === 'number'
        ? row.attachment_byte_size
        : row.attachment_byte_size == null
          ? null
          : Number(row.attachment_byte_size),
    systemEvent: (row.system_event as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

// ============================================================================
// rateLimitInsertCheck — in-memory sliding window
// ============================================================================

/**
 * In-memory event log per (sessionId, senderId). Each entry is a unix-ms
 * timestamp. We trim entries older than the configured window on every
 * check, so memory stays bounded by `MAX × active_keys`.
 *
 * NOT pod-shared. Promote to Redis when scale warrants.
 */
const rateLimitLog = new Map<string, number[]>();

function rateLimitKey(sessionId: string, senderId: string): string {
  return `${sessionId}:${senderId}`;
}

/**
 * Check (and consume on success) one rate-limit token.
 *
 * - When `allowed`, the helper records the current timestamp in the log.
 * - When blocked, the log is unchanged (so the limiter is honest about
 *   what it counted).
 *
 * Defaults: 60 events per 60-second sliding window. Tunable via env
 * (`CONSULTATION_MESSAGE_RATE_LIMIT_*`).
 */
export function rateLimitInsertCheck(
  input: RateLimitCheckInput,
): RateLimitCheckResult {
  const sessionId = input.sessionId?.trim();
  const senderId = input.senderId?.trim();
  if (!sessionId || !senderId) {
    return { allowed: false, remainingInWindow: 0, retryAfterSeconds: 0 };
  }

  const key = rateLimitKey(sessionId, senderId);
  const max = env.CONSULTATION_MESSAGE_RATE_LIMIT_MAX;
  const windowMs = env.CONSULTATION_MESSAGE_RATE_LIMIT_WINDOW_SECONDS * 1000;
  const now = Date.now();
  const cutoff = now - windowMs;

  const events = rateLimitLog.get(key) ?? [];
  // Trim out-of-window entries from the head (events are append-only so
  // the array is always ascending).
  let firstInWindowIdx = 0;
  while (firstInWindowIdx < events.length && events[firstInWindowIdx]! < cutoff) {
    firstInWindowIdx += 1;
  }
  const inWindow = firstInWindowIdx === 0 ? events : events.slice(firstInWindowIdx);

  if (inWindow.length >= max) {
    // Block. Compute when the oldest in-window entry ages out.
    const oldest = inWindow[0]!;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    // Persist the trimmed log so we don't keep stale entries forever.
    if (inWindow.length !== events.length) rateLimitLog.set(key, inWindow);
    return {
      allowed: false,
      remainingInWindow: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  inWindow.push(now);
  rateLimitLog.set(key, inWindow);
  return {
    allowed: true,
    remainingInWindow: max - inWindow.length,
    retryAfterSeconds: 0,
  };
}

/**
 * **Test-only** — clear the in-memory rate-limit state. Exported so unit
 * tests can isolate window behavior between cases. Not safe to call in
 * production (would let already-rate-limited senders flood again).
 */
export function __resetRateLimitForTests(): void {
  rateLimitLog.clear();
}

// ============================================================================
// System-message emitter (Plan 06 · Task 37)
// ============================================================================

/**
 * Canonical set of system-event tags written into
 * `consultation_messages.system_event`. The DB column is plain TEXT (Task
 * 39 Notes #4) so additions here do NOT require a migration — adding a
 * new value is a single-PR change in this file.
 *
 * Ownership per plan:
 *   · 'consult_started', 'party_joined', 'consult_ended' — Plan 06 / Task 37
 *   · 'recording_paused', 'recording_resumed', 'recording_stopped_by_doctor'
 *       — Plan 07 (helpers land alongside the recording-control surface).
 *   · 'video_recording_started', 'video_recording_stopped' — Plan 08.
 *   · 'modality_switched' — Plan 09.
 *
 * Helpers for the not-yet-shipped tags live in future PRs; the union
 * owns the type shape so cross-plan changes are additive.
 */
export type SystemEvent =
  | 'consult_started'
  | 'party_joined'
  | 'consult_ended'
  | 'recording_paused'
  | 'recording_resumed'
  | 'recording_stopped_by_doctor'
  | 'modality_switched'
  | 'video_recording_started'
  | 'video_recording_stopped'
  // Plan 08 · Task 41 additive events.
  //   - `video_recording_failed_to_start` — surfaced to BOTH parties; after
  //     patient's consent landed but the Twilio rule-flip failed twice. The
  //     call continues audio-only; we tell the room why.
  //   - `video_escalation_declined` / `video_escalation_timed_out` — hidden
  //     from chat by v1 product decision (see task-41 Notes #3). The union
  //     carries the tags so the emitter could shift to "visible" additively
  //     later via a UI-side filter; v1 never calls the helpers.
  | 'video_recording_failed_to_start'
  | 'video_escalation_declined'
  | 'video_escalation_timed_out'
  // Plan 09 · Task 49 refund-status events (written by the refund
  // retry worker). Visible chat banners per Decision 11 resilience
  // copy — patient sees a "refund processing / failed" note once.
  | 'modality_refund_processing'
  | 'modality_refund_failed';

/**
 * Synthetic sender UUID used as `sender_id` for every system row.
 * `sender_id` is NOT NULL on `consultation_messages` (Migration 051) and
 * system rows have no real sender; the all-zeros UUID is unambiguous,
 * easy to spot in psql, and cannot collide with any real `auth.users.id`.
 *
 * Callers writing system rows MUST use this constant. A unit test pins
 * the value so future refactors break loudly rather than silently
 * drifting (e.g. to `randomUUID()` — which would kill the "exclude
 * system rows by `sender_role`" query path).
 *
 * Re-exported from `text-session-supabase.ts` for backward compatibility
 * with pre-Task-37 callers; this file is the canonical source.
 */
export const SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Dedup TTL for `emitSystemMessage`. Duplicate writes with the same
 * `(sessionId, event, correlationId)` triple within this window are
 * skipped in-process. Cross-process dedup is NOT guaranteed (v1
 * limitation — see task doc Out of scope for the follow-up trigger).
 */
const SYSTEM_EMITTER_DEDUP_TTL_MS = 60 * 1000;

/**
 * In-memory dedup set. Keyed on `${sessionId}::${event}::${correlationId}`.
 * Value is the expiry unix-ms. Entries are lazily pruned on every emit.
 *
 * NOT pod-shared (like `rateLimitLog` above). The dominant duplicate
 * pattern in v1 is a single request's retry loop re-firing the same
 * lifecycle hook — always in-process. If cross-pod dedup becomes a real
 * issue, promote to a Postgres partial unique index (`(session_id,
 * system_event)` for at-most-once events like `consult_started`).
 */
const systemEmitterDedupLog = new Map<string, number>();

function pruneSystemEmitterDedupLog(nowMs: number): void {
  for (const [key, expiresAt] of systemEmitterDedupLog.entries()) {
    if (expiresAt <= nowMs) systemEmitterDedupLog.delete(key);
  }
}

/**
 * Format a `Date` to `HH:MM` (24-hour, zero-padded) in the given IANA
 * timezone. Falls back to `'Asia/Kolkata'` if `timezone` is missing or
 * invalid — matches the rest of the codebase's TZ fallback convention
 * (`appointment-service.ts`, `notification-service.ts`). Rationale
 * captured in task-37 Notes #5.
 *
 * Exported for unit-test fixture setup; the central writer's callers
 * should use `emitConsultStarted` / `emitConsultEnded` directly.
 */
export function formatTimeInDoctorTz(date: Date, timezone: string | undefined | null): string {
  const tz = timezone?.trim() || 'Asia/Kolkata';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hh}:${mm}`;
  } catch {
    // Bad IANA id — retry with default.
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hh}:${mm}`;
  }
}

/**
 * Load the doctor's timezone for a given session id via a two-hop admin
 * query (`consultation_sessions` → `doctor_settings`). Defaults to
 * `Asia/Kolkata` on any miss (admin unavailable, session not found,
 * doctor_settings row missing, timezone blank). The fallback keeps the
 * banner honest rather than failing loudly — mid-consult lifecycle
 * writes must not be blocked by a cosmetic TZ lookup.
 */
async function loadDoctorTzForSession(sessionId: string): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 'Asia/Kolkata';

  const { data: session } = await admin
    .from('consultation_sessions')
    .select('doctor_id')
    .eq('id', sessionId)
    .maybeSingle();
  const doctorId = (session?.doctor_id as string | undefined)?.trim();
  if (!doctorId) return 'Asia/Kolkata';

  const { data: settings } = await admin
    .from('doctor_settings')
    .select('timezone')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  const tz = (settings?.timezone as string | undefined)?.trim();
  return tz || 'Asia/Kolkata';
}

/**
 * Result shape returned by `emitSystemMessage`. Callers (mostly the
 * per-event helpers below) can log the outcome; helpers themselves are
 * fire-and-forget so they discard the return value.
 */
export type EmitSystemMessageResult =
  | { id: string; createdAt: string }
  | { skipped: true; reason: 'duplicate_correlation_id' | 'row_shape_check_failed' | 'admin_unavailable' };

export interface EmitSystemMessageInput {
  sessionId: string;
  event: SystemEvent;
  /** Localized banner text rendered verbatim by <TextConsultRoom>. */
  body: string;
  /**
   * Optional; enables in-process dedup. Two calls with the same
   * `(sessionId, event, correlationId)` triple within 60 s collapse to
   * one write. Callers that want "at most one per session" (e.g.
   * `consult_started`) pass the event tag itself; callers that want "at
   * most one per session per role" (`party_joined`) pass
   * `"party_joined:doctor"` / `"party_joined:patient"`.
   */
  correlationId?: string;
  /**
   * Free-form per-event context (e.g. `{ reason: '...', byRole: 'doctor' }`).
   * **NOT persisted in v1** — the signature accepts it so Plans 07/08/09
   * can start passing context now, and the follow-up `system_meta JSONB`
   * column ships additively when a real consumer needs it. Stripped
   * before insert.
   */
  meta?: Record<string, unknown>;
}

/**
 * Central writer for companion-chat system banners. All event-specific
 * helpers funnel through here so the row-shape, RLS bypass, and
 * telemetry live in exactly one place.
 *
 * Contract:
 *   - Always uses the service-role Supabase client (Migration 062 /
 *     Task 39 RLS: system rows bypass the INSERT door via service-role).
 *   - Best-effort idempotent via `correlationId` + in-process 60s LRU.
 *   - On Postgres row-shape CHECK violation (`23514`) logs at `error`
 *     and returns `{ skipped: true, reason: 'row_shape_check_failed' }`
 *     rather than throwing — a thrown error mid-consult would be more
 *     disruptive than a missing banner.
 *   - Returns the persisted row id + createdAt on success, or a
 *     `{ skipped, reason }` shape otherwise; never throws.
 */
export async function emitSystemMessage(
  input: EmitSystemMessageInput,
): Promise<EmitSystemMessageResult> {
  const sessionId = input.sessionId?.trim();
  const event = input.event;
  const body = input.body?.trim();
  const correlationId = input.correlationId?.trim();

  // Defensive normalisation — the helpers below always supply valid
  // inputs, but the central writer is public so guard anyway. Missing
  // bits get logged at warn (not error) because a bad-input call is a
  // programmer error but must not crash the consult.
  if (!sessionId || !event || !body) {
    logger.warn(
      { sessionId, event, hasBody: !!body },
      'emitSystemMessage: missing required input (sessionId/event/body); skipping',
    );
    return { skipped: true, reason: 'row_shape_check_failed' };
  }

  // Dedup: prune stale entries, then check + record.
  if (correlationId) {
    const nowMs = Date.now();
    pruneSystemEmitterDedupLog(nowMs);
    const dedupKey = `${sessionId}::${event}::${correlationId}`;
    const existingExpiry = systemEmitterDedupLog.get(dedupKey);
    if (existingExpiry && existingExpiry > nowMs) {
      logger.info(
        { sessionId, event, correlationId },
        'emitSystemMessage: duplicate within dedup window — skipping',
      );
      return { skipped: true, reason: 'duplicate_correlation_id' };
    }
    systemEmitterDedupLog.set(dedupKey, nowMs + SYSTEM_EMITTER_DEDUP_TTL_MS);
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { sessionId, event },
      'emitSystemMessage: admin client unavailable; skipping',
    );
    return { skipped: true, reason: 'admin_unavailable' };
  }

  const insertRow: Record<string, unknown> = {
    session_id: sessionId,
    sender_id: SYSTEM_SENDER_ID,
    sender_role: 'system',
    kind: 'system',
    system_event: event,
    body,
  };

  const { data, error } = await admin
    .from('consultation_messages')
    .insert(insertRow)
    .select('id, created_at')
    .single();

  if (error) {
    // Postgres CHECK_VIOLATION — the row-shape CHECK rejected us. This
    // means the helper was called with a bad combination (probably
    // senderRole/kind drift after a schema change). Log loudly, never
    // throw — a missing banner is strictly less disruptive than a
    // session-end route 500-ing on a defensive CHECK.
    const code = (error as { code?: string }).code;
    if (code === '23514') {
      logger.error(
        { sessionId, event, body, error: error.message },
        'emitSystemMessage: row-shape CHECK violation (Migration 062) — row not written',
      );
      return { skipped: true, reason: 'row_shape_check_failed' };
    }
    // Any other error — log at warn, do not throw. The helpers below
    // rely on this contract to keep their Promise<void> always-resolve.
    logger.warn(
      { sessionId, event, error: error.message },
      'emitSystemMessage: insert failed (non-fatal, banner dropped)',
    );
    return { skipped: true, reason: 'row_shape_check_failed' };
  }

  if (!data) {
    logger.warn(
      { sessionId, event },
      'emitSystemMessage: insert returned no row (non-fatal, banner dropped)',
    );
    return { skipped: true, reason: 'row_shape_check_failed' };
  }

  logger.info(
    {
      sessionId,
      event,
      system_event_id: data.id,
    },
    'emitSystemMessage: system row inserted',
  );

  return {
    id: data.id as string,
    createdAt: data.created_at as string,
  };
}

/**
 * **Test-only** — clear the in-memory dedup log. Exposed so unit tests
 * can isolate dedup behavior between cases.
 */
export function __resetSystemEmitterDedupForTests(): void {
  systemEmitterDedupLog.clear();
}

// ----------------------------------------------------------------------------
// Per-event helpers — Plan 06 / Task 37 ships these three.
// Plans 07, 08, 09 will each add helpers below when their respective
// lifecycle flows land.
// ----------------------------------------------------------------------------

/**
 * Emit "Consultation started at HH:MM." banner. Fired by Task 36's
 * `createSession` lifecycle hook (this task ships the helper; the wire-
 * up to `consultation-session-service.ts#createSession` lands in Task
 * 36). Time is formatted in the doctor's timezone.
 *
 * Fire-and-forget — errors are swallowed + logged; the caller's
 * lifecycle is never blocked by a banner write.
 */
export async function emitConsultStarted(sessionId: string): Promise<void> {
  try {
    const tz = await loadDoctorTzForSession(sessionId);
    const hhmm = formatTimeInDoctorTz(new Date(), tz);
    await emitSystemMessage({
      sessionId,
      event: 'consult_started',
      body: `Consultation started at ${hhmm}.`,
      correlationId: 'consult_started',
    });
  } catch (err) {
    logger.warn(
      {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'emitConsultStarted: swallowed error (best-effort; banner dropped)',
    );
  }
}

/**
 * Emit "Consultation ended at HH:MM." banner (or a caller-supplied
 * summary override — Plan 07's post-consult flow may want to enrich
 * this with "Recording available" / "Prescription delivered" copy).
 * Fired by this task's `consultation-session-service.ts#endSession`
 * extension.
 *
 * Fire-and-forget — errors swallowed + logged.
 */
export async function emitConsultEnded(
  sessionId: string,
  summary?: string,
): Promise<void> {
  try {
    let body = summary?.trim();
    if (!body) {
      const tz = await loadDoctorTzForSession(sessionId);
      const hhmm = formatTimeInDoctorTz(new Date(), tz);
      body = `Consultation ended at ${hhmm}.`;
    }
    await emitSystemMessage({
      sessionId,
      event: 'consult_ended',
      body,
      correlationId: 'consult_ended',
    });
  } catch (err) {
    logger.warn(
      {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'emitConsultEnded: swallowed error (best-effort; banner dropped)',
    );
  }
}

/**
 * Emit "Doctor joined the consult." / "Patient joined the consult."
 * Fired from each adapter's `getJoinToken`. Trade-off accepted in v1
 * (task-37 Acceptance bullet): "joined" means "fetched the join token"
 * rather than "Twilio's `participantConnected` webhook fired" — token-
 * mint is close-enough and avoids coupling Plan 06 to Plan 01's webhook
 * lifecycle. Plan 07 follow-up may promote to webhook-driven.
 *
 * The voice adapter's `getJoinToken` delegates to the video adapter's
 * (`voice-session-twilio.ts`); to avoid double-banners the voice
 * adapter does NOT call this helper itself — the video adapter's call
 * covers both modalities (see `voice-session-twilio.ts` JSDoc and
 * task-37 Notes #7 for the design rationale).
 *
 * Fire-and-forget — errors swallowed + logged.
 */
export async function emitPartyJoined(
  sessionId: string,
  role: 'doctor' | 'patient',
): Promise<void> {
  try {
    const who = role === 'doctor' ? 'Doctor' : 'Patient';
    await emitSystemMessage({
      sessionId,
      event: 'party_joined',
      body: `${who} joined the consult.`,
      correlationId: `party_joined:${role}`,
    });
  } catch (err) {
    logger.warn(
      {
        sessionId,
        role,
        error: err instanceof Error ? err.message : String(err),
      },
      'emitPartyJoined: swallowed error (best-effort; banner dropped)',
    );
  }
}

// ----------------------------------------------------------------------------
// Plan 08 · Task 41 — escalation-flow lifecycle helpers.
//
// `video_recording_started` fires from Plan 08 Task 41's
// `patientResponseToEscalation` ALLOW branch after `escalateToFullVideoRecording`
// returns success.
//
// `video_recording_failed_to_start` fires after the one-retry Twilio flip
// fails a second time — transparency to both parties about what happened to
// the patient's allow action.
//
// `video_recording_stopped` fires from Task 42 (patient revoke) or from the
// pause-path when a currently-video-recording call is paused.
//
// The `video_escalation_declined` / `video_escalation_timed_out` helpers are
// intentionally NOT added in v1 — product decision in task-41 Notes #3 hides
// these from the chat feed to avoid implicit consent pressure. The union
// carries the tags so a future v1.1 can light them up additively without a
// migration.
// ----------------------------------------------------------------------------

/**
 * Emit "Video recording started at HH:MM." banner. Fired from Task 41's
 * allow-branch after the Twilio rule-flip lands. Correlation id threads the
 * doctor-request → consent → rule-flip → banner path for log tracing.
 *
 * Fire-and-forget — errors swallowed + logged.
 */
export async function emitVideoRecordingStarted(
  sessionId: string,
  correlationId?: string,
): Promise<void> {
  try {
    const tz = await loadDoctorTzForSession(sessionId);
    const hhmm = formatTimeInDoctorTz(new Date(), tz);
    await emitSystemMessage({
      sessionId,
      event: 'video_recording_started',
      body: `Video recording started at ${hhmm}.`,
      correlationId: `video_recording_started:${correlationId ?? 'unknown'}`,
      meta: { byRole: 'doctor' },
    });
  } catch (err) {
    logger.warn(
      {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'emitVideoRecordingStarted: swallowed error (best-effort; banner dropped)',
    );
  }
}

/**
 * Emit "Video recording couldn't start due to a technical error. The call
 * continues audio-only." banner. Fired from Task 41's allow-branch when the
 * Twilio retry fails. Visible to BOTH parties (task-41 Notes #4) because the
 * patient already consented — transparency about what happened is a trust
 * signal, not a legal risk.
 *
 * Fire-and-forget — errors swallowed + logged.
 */
export async function emitVideoRecordingFailedToStart(
  sessionId: string,
  correlationId?: string,
  twilioErrorCode?: string,
): Promise<void> {
  try {
    await emitSystemMessage({
      sessionId,
      event: 'video_recording_failed_to_start',
      body:
        "Video recording couldn't start due to a technical error. The call continues audio-only.",
      correlationId: `video_recording_failed_to_start:${correlationId ?? 'unknown'}`,
      meta: { twilioErrorCode },
    });
  } catch (err) {
    logger.warn(
      {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'emitVideoRecordingFailedToStart: swallowed error (best-effort; banner dropped)',
    );
  }
}

/**
 * Emit "Video recording stopped at HH:MM. Audio recording continues."
 * banner. Fired from Plan 08 Task 42's `patientRevokeVideoMidCall` after
 * the Twilio rule-flip returns to audio_only (and — forward-compat — any
 * doctor-revert or system-fallback path that lands in a future plan).
 *
 * Visible to BOTH parties. The copy deliberately reinforces "audio
 * continues" so the patient knows the consult isn't ending and the
 * doctor sees the same wording the patient saw in their revoke
 * confirmation tooltip. Decision 10 LOCKED transparency.
 *
 * `byRole` / `reason` are carried on `meta` — the row-shape CHECK
 * (Migration 062) strips unknown JSONB paths in v1; the signature
 * accepts them so a future `system_meta` JSONB column can surface them
 * in the UI without a second migration (see task-41 emitter doctrine).
 *
 * Fire-and-forget — errors swallowed + logged.
 */
export async function emitVideoRecordingStopped(
  sessionId: string,
  correlationId?: string,
  byRole: 'patient' | 'doctor' | 'system' = 'patient',
  reason: 'patient_revoked' | 'doctor_revert' | 'system_error_fallback' = 'patient_revoked',
): Promise<void> {
  try {
    const tz = await loadDoctorTzForSession(sessionId);
    const hhmm = formatTimeInDoctorTz(new Date(), tz);
    await emitSystemMessage({
      sessionId,
      event: 'video_recording_stopped',
      body: `Video recording stopped at ${hhmm}. Audio recording continues.`,
      correlationId: `video_recording_stopped:${correlationId ?? 'unknown'}`,
      meta: { byRole, reason },
    });
  } catch (err) {
    logger.warn(
      {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
      'emitVideoRecordingStopped: swallowed error (best-effort; banner dropped)',
    );
  }
}
