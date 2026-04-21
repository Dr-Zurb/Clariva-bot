/**
 * Recording-escalation service — doctor-initiated video-recording consent
 * flow (Plan 08 · Task 41 · Decision 10 LOCKED · **highest-risk server
 * task in Plan 08**).
 *
 * Owns the state machine for the doctor → patient video-recording
 * escalation:
 *
 *     doctor clicks "Request video"
 *         │
 *         ▼
 *   requestVideoEscalation()  ──┐
 *         │                      │ atomic rate-limit check
 *         │                      │ (max 2 / consult, 5-min cooldown on
 *         │                      │  decline/timeout, no stacking pending)
 *         │                      │
 *         ▼                      │
 *   video_escalation_audit (pending row) + 60s timer  ◄── durable via
 *         │                                              DB polling worker
 *         ▼
 *   patient's consent modal opens (Realtime fan-out on `INSERT` via the
 *   `video_escalation_audit` Postgres-changes channel, which Plan 08 Task
 *   40/41 frontends subscribe to).
 *         │
 *         ├──── 'allow'    ─► patientResponseToEscalation() ─► Twilio
 *         │                                                    rule flip
 *         │                                                    (retry 1x)
 *         │                                                    ─► system
 *         │                                                    message
 *         ├──── 'decline'  ─► patientResponseToEscalation() (no Twilio)
 *         └──── 60s elapse ─► video-escalation-timeout-worker marks row
 *                             'timeout' (atomic UPDATE; idempotent if
 *                             'allow'/'decline' won the race)
 *
 * **Why the service owns no setTimeout.** A pod restart would lose an
 * in-memory timer and the row would sit `pending` forever (→ audit row
 * integrity broken + the patient's consent window ambiguous to the
 * doctor UI). The durable strategy is a 5s database-polling worker
 * (`video-escalation-timeout-worker.ts`). A `setTimeout` shadow is
 * deliberately NOT added in v1 — the 5s polling fuzz (60–65s worst-
 * case wall time) is an acceptable tradeoff against the operational
 * complexity of two redundant paths writing to the same atomic row.
 * Revisit if product complains.
 *
 * **Failure-mode mitigations (task-41 spec):**
 *   · A (consent bypass): a `setTimeout`-based flip could fire before
 *     the patient responds if clocks drift. We never call
 *     `escalateToFullVideoRecording` from the timeout path — the
 *     timeout only marks the audit row. The rule-flip lives exclusively
 *     in `patientResponseToEscalation`'s `'allow'` branch.
 *   · B (silent consent loss): the atomic UPDATE is the source of
 *     truth. Realtime broadcasts are best-effort — if the publish fails
 *     the frontend re-hydrates via `getVideoEscalationStateForSession`
 *     on reconnect.
 *   · C (rate-limit bypass): the rate-limit check reads
 *     `video_escalation_audit` — a durable Postgres table. A server
 *     restart does NOT reset the counter.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-41-patient-video-consent-modal-and-escalation-service.md
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql
 * @see backend/src/services/recording-track-service.ts (callee)
 * @see backend/src/services/consultation-message-service.ts (emitters)
 * @see backend/src/workers/video-escalation-timeout-worker.ts (timeout path)
 */

import { randomUUID } from 'crypto';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from '../utils/errors';
import { findSessionById } from './consultation-session-service';
import {
  emitVideoRecordingFailedToStart,
  emitVideoRecordingStarted,
  emitVideoRecordingStopped,
} from './consultation-message-service';
import {
  escalateToFullVideoRecording,
  revertToAudioOnlyRecording,
} from './recording-track-service';
import { getCurrentRecordingMode } from './twilio-recording-rules';
import { insertDashboardEvent } from './dashboard-events-service';

// ============================================================================
// Public types
// ============================================================================

export type VideoEscalationPresetReason =
  | 'visible_symptom'
  | 'document_procedure'
  | 'patient_request'
  | 'other';

export type PatientResponse = 'allow' | 'decline' | 'timeout';

export interface RequestVideoEscalationInput {
  sessionId:         string;
  /** Must match the session's `doctorId`. Controller enforces this against
   *  the bearer JWT separately; the service re-asserts. */
  doctorId:          string;
  /** 5..200 chars after trim. DB CHECK mirrors this. */
  reason:            string;
  presetReasonCode:  VideoEscalationPresetReason;
  correlationId?:    string;
}

export interface RequestVideoEscalationResult {
  requestId:         string;
  /** ISO timestamp 60s from the server-assigned `requested_at`. Doctor +
   *  patient UIs use this (not `Date.now()+60000`) to avoid clock skew. */
  expiresAt:         string;
  correlationId:     string;
  /** How many request slots the doctor has used AFTER this call. The
   *  frontend treats `2` as "locked; no more attempts this consult". */
  attemptsUsed:      1 | 2;
}

export interface PatientResponseToEscalationInput {
  requestId:      string;
  /** Must match `consultation_sessions.patient_id` on the session this
   *  request is pinned to. */
  patientId:      string;
  decision:       'allow' | 'decline';
  correlationId?: string;
}

export type PatientResponseToEscalationResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | 'already_responded'
        | 'already_timed_out'
        | 'not_a_participant';
    };

// ----------------------------------------------------------------------------
// Plan 08 · Task 42 — patient revoke mid-call (Decision 10 LOCKED safety valve).
// ----------------------------------------------------------------------------

export interface PatientRevokeVideoMidCallInput {
  /** `consultation_sessions.id`. */
  sessionId:      string;
  /** Must match `consultation_sessions.patient_id`. Controller enforces
   *  against the bearer JWT; the service re-asserts defensively. */
  patientId:      string;
  correlationId?: string;
}

export interface PatientRevokeVideoMidCallResult {
  correlationId: string;
  /**
   * Discriminator for the controller → frontend surface.
   *   · 'revoked'  — this call flipped an active allow row to revoked.
   *   · 'already_audio_only' — no active allow row was found; either the
   *     doctor never escalated, the recording already rolled back, or
   *     the patient double-tapped revoke. Idempotent success shape per
   *     task-42 acceptance criterion "idempotent when already audio-only".
   */
  status: 'revoked' | 'already_audio_only';
}

export interface GetVideoEscalationStateForSessionInput {
  sessionId: string;
}

/** Derived state returned by the state inspector. Mirrors the frontend
 *  `VideoEscalationStateData` wire type so the HTTP controller can return
 *  it 1:1 without a second mapping layer. */
export type VideoEscalationDerivedState =
  | { kind: 'idle';       attemptsUsed: 0 | 1 }
  | {
      kind:          'requesting';
      requestId:     string;
      expiresAt:     string;
      attemptsUsed:  1 | 2;
    }
  | {
      kind:          'cooldown';
      availableAt:   string;
      attemptsUsed:  1 | 2;
      lastOutcome:   'decline' | 'timeout';
      lastReason:    string | null;
    }
  | {
      kind:       'locked';
      reason:     'max_attempts' | 'already_recording_video';
      requestId:  string | null;
    };

export interface RecentEscalation {
  requestId:        string;
  requestedAt:      string;
  patientResponse:  PatientResponse | null;
}

export interface GetVideoEscalationStateForSessionResult {
  state:   VideoEscalationDerivedState;
  recent:  RecentEscalation[];
}

// ============================================================================
// Domain errors (surface distinct HTTP statuses via the 429/409 mapping
// in the controller). We re-export the standard AppError subclasses
// rather than invent bespoke classes so the global error handler's
// `formatError` + `statusCode` mapping works out of the box.
// ============================================================================

/** 429 — max 2 attempts hit for the consult. */
export class MaxAttemptsReachedError extends TooManyRequestsError {
  constructor() {
    super(
      "You've already asked twice this consult. Please finish the consult audio-only or ask in the next consult.",
    );
  }
}

/** 429 — patient just declined / timed out; 5-min cooldown in effect. */
export class CooldownInProgressError extends TooManyRequestsError {
  /** ISO timestamp when the cooldown window ends — surfaced to the
   *  doctor UI via the error body (`availableAt`). */
  public readonly availableAt: string;
  constructor(availableAt: string) {
    super("Cooldown in progress. Try again shortly.");
    this.availableAt = availableAt;
  }
}

/** 429 — doctor already has an in-flight request; can't stack. */
export class PendingRequestExistsError extends TooManyRequestsError {
  constructor() {
    super('A request is still pending. Wait for the patient to respond.');
  }
}

/** 409 — already in `audio_and_video` mode. Doctor UI should hide the
 *  button but belt-and-suspenders. */
export class AlreadyRecordingVideoError extends ConflictError {
  constructor() {
    super('Video recording is already active for this session.');
  }
}

/** 409 — session isn't `live`. */
export class SessionNotActiveError extends ConflictError {
  constructor(status: string) {
    super(`Cannot request video escalation when session status is '${status}'.`);
  }
}

// ============================================================================
// Constants
// ============================================================================

const REASON_MIN = 5;
const REASON_MAX = 200;
const EXPIRY_SECONDS = 60;
const COOLDOWN_MINUTES = 5;
const MAX_ATTEMPTS = 2;

// ============================================================================
// Row-level helpers
// ============================================================================

interface AuditRowSnapshot {
  id:                  string;
  session_id:          string;
  doctor_id:           string;
  reason:              string;
  preset_reason_code:  VideoEscalationPresetReason | null;
  patient_response:    PatientResponse | null;
  requested_at:        string;
  responded_at:        string | null;
  correlation_id:      string | null;
  /** Plan 08 · Task 42. Non-NULL when an accepted (`allow`) row has been
   *  rolled back mid-call. NULL on legacy rows (Migration 073 adds the
   *  column nullable) and on pending / decline / timeout rows. Pairs
   *  with `revoke_reason` via the co-presence CHECK. */
  revoked_at:          string | null;
  /** Plan 08 · Task 42. Who / why the revoke fired. v1 only emits
   *  `'patient_revoked'`; forward-compat values are in the Migration 073
   *  CHECK (`doctor_revert`, `system_error_fallback`). */
  revoke_reason:       'patient_revoked' | 'doctor_revert' | 'system_error_fallback' | null;
}

/**
 * Columns selected by both `fetchRecentRowsForSession` and
 * `fetchRowById`. Pinned as a constant so the two reads stay in sync —
 * a mismatch would silently drop the `revoked_at` field on one path,
 * breaking the state derivation without a type error (Supabase returns
 * partial shapes).
 */
const AUDIT_ROW_SELECT =
  'id, session_id, doctor_id, reason, preset_reason_code, patient_response, requested_at, responded_at, correlation_id, revoked_at, revoke_reason';

async function fetchRecentRowsForSession(
  sessionId: string,
  limit: number = 2,
): Promise<AuditRowSnapshot[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }
  const { data, error } = await admin
    .from('video_escalation_audit')
    .select(AUDIT_ROW_SELECT)
    .eq('session_id', sessionId)
    .order('requested_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new InternalError(
      `recording-escalation-service: audit read failed (${error.message})`,
    );
  }
  return (data ?? []) as AuditRowSnapshot[];
}

async function fetchRowById(requestId: string): Promise<AuditRowSnapshot | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }
  const { data, error } = await admin
    .from('video_escalation_audit')
    .select(AUDIT_ROW_SELECT)
    .eq('id', requestId)
    .maybeSingle();
  if (error) {
    throw new InternalError(
      `recording-escalation-service: audit row read failed (${error.message})`,
    );
  }
  return (data as AuditRowSnapshot | null) ?? null;
}

// ============================================================================
// Public: requestVideoEscalation
// ============================================================================

/**
 * Doctor-initiated request for the patient to consent to audio+video
 * recording. Runs the full 6-step policy (authZ, session state,
 * already-recording, rate-limit, reason length, audit insert) and
 * returns the `{ requestId, expiresAt }` the doctor UI needs for its
 * "waiting-for-consent" state.
 *
 * Realtime fan-out to the patient's `<VideoConsentModal>` happens via
 * Postgres-changes subscription to `video_escalation_audit` INSERT —
 * nothing for this service to publish explicitly. That keeps the
 * service transport-agnostic (tests don't need a Realtime mock).
 */
export async function requestVideoEscalation(
  input: RequestVideoEscalationInput,
): Promise<RequestVideoEscalationResult> {
  const sessionId = input.sessionId?.trim();
  const doctorId = input.doctorId?.trim();
  const reasonTrimmed = (input.reason ?? '').trim();
  const presetReasonCode = input.presetReasonCode;
  const correlationId = input.correlationId?.trim() || randomUUID();

  // Step 5 (reason length — fail fast before auth lookup so the public
  // surface has honest 400s).
  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!doctorId) throw new ValidationError('doctorId is required');
  if (!presetReasonCode) throw new ValidationError('presetReasonCode is required');
  if (
    presetReasonCode !== 'visible_symptom' &&
    presetReasonCode !== 'document_procedure' &&
    presetReasonCode !== 'patient_request' &&
    presetReasonCode !== 'other'
  ) {
    throw new ValidationError(`Unknown presetReasonCode: ${String(presetReasonCode)}`);
  }
  if (reasonTrimmed.length < REASON_MIN) {
    throw new ValidationError(`Reason must be at least ${REASON_MIN} characters`);
  }
  if (reasonTrimmed.length > REASON_MAX) {
    throw new ValidationError(`Reason must be at most ${REASON_MAX} characters`);
  }

  // Step 1 (authZ) + Step 2 (session state).
  const session = await findSessionById(sessionId);
  if (!session) throw new NotFoundError('Consultation session not found');
  if (session.doctorId !== doctorId) {
    throw new ForbiddenError('Only the session doctor can request video escalation');
  }
  if (session.status !== 'live') {
    throw new SessionNotActiveError(session.status);
  }
  const roomSid = session.providerSessionId?.trim();
  if (!roomSid) {
    throw new ConflictError(
      'Video escalation not available for this session (no Twilio room).',
    );
  }

  // Step 3 (already-recording-video). Best-effort: if Twilio is
  // unreachable we skip — the doctor UI already guards on the last
  // `video_recording_started` row, and the patient consent path is
  // idempotent (the adapter short-circuits on already-video mode).
  try {
    const mode = await getCurrentRecordingMode(roomSid);
    if (mode === 'audio_and_video') {
      throw new AlreadyRecordingVideoError();
    }
  } catch (err) {
    if (err instanceof AlreadyRecordingVideoError) throw err;
    // Non-AlreadyRecording → log + continue. Twilio availability is
    // not on the critical path for the rate-limit check.
    logger.warn(
      {
        correlationId,
        sessionId,
        roomSid,
        error: err instanceof Error ? err.message : String(err),
      },
      'recording-escalation-service: Twilio mode probe failed; continuing with rate-limit check',
    );
  }

  // Step 4 (rate-limit).
  const recent = await fetchRecentRowsForSession(sessionId, MAX_ATTEMPTS);
  if (recent.length >= MAX_ATTEMPTS) {
    throw new MaxAttemptsReachedError();
  }
  if (recent.length === 1) {
    const head = recent[0]!;
    const headRequestedAtMs = new Date(head.requested_at).getTime();
    const nowMs = Date.now();
    if (head.patient_response === null) {
      // Pending request in-flight. The only legal way to have 1 pending
      // row AND have passed the already-recording check is that the
      // doctor is re-submitting on top of an unresolved modal. Reject.
      if (nowMs - headRequestedAtMs < EXPIRY_SECONDS * 1000) {
        throw new PendingRequestExistsError();
      }
      // The pending row is older than 60s — the timeout worker will
      // mark it timeout on its next tick. From the doctor's POV we
      // could allow a new request; but to avoid a race with the worker
      // we reject with a 429 too. Net effect: doctor clicks again in
      // 5s, worker closes the stale row, next click succeeds. This
      // costs at most one extra tap and prevents a double-in-flight
      // audit state.
      throw new PendingRequestExistsError();
    }
    // Terminal-revoked allow rows (Plan 08 Task 42) share the cooldown
    // path with decline/timeout: the attempt still counts, and the 5-min
    // window starts from the ORIGINAL `requested_at` so a doctor can't
    // escalate → patient-revoke → immediately re-escalate. Rationale in
    // task-42 Notes #6.
    const isTerminalRevokedAllow =
      head.patient_response === 'allow' && head.revoked_at !== null;
    if (
      head.patient_response === 'decline' ||
      head.patient_response === 'timeout' ||
      isTerminalRevokedAllow
    ) {
      const cooldownEndMs = headRequestedAtMs + COOLDOWN_MINUTES * 60_000;
      if (nowMs < cooldownEndMs) {
        throw new CooldownInProgressError(new Date(cooldownEndMs).toISOString());
      }
      // Cooldown elapsed; the 1 used attempt still counts toward the
      // 2-max. Fall through.
    } else if (head.patient_response === 'allow') {
      // Still-active allow → mode should be 'audio_and_video' and we
      // should have thrown at Step 3. Defensive: treat as locked.
      throw new AlreadyRecordingVideoError();
    }
  }

  // Step 6 (insert audit row).
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }

  const insertPayload = {
    session_id:          sessionId,
    doctor_id:           doctorId,
    reason:              reasonTrimmed,
    preset_reason_code:  presetReasonCode,
    correlation_id:      correlationId,
  };

  const { data: inserted, error: insertErr } = await admin
    .from('video_escalation_audit')
    .insert(insertPayload)
    .select('id, requested_at')
    .single();

  if (insertErr) {
    logger.error(
      {
        correlationId,
        sessionId,
        doctorId,
        error: insertErr.message,
      },
      'recording-escalation-service: audit insert failed',
    );
    throw new InternalError(
      `recording-escalation-service: audit insert failed (${insertErr.message})`,
    );
  }
  if (!inserted) {
    throw new InternalError(
      'recording-escalation-service: audit insert returned no row',
    );
  }

  const requestId = inserted.id as string;
  const requestedAtMs = new Date(inserted.requested_at as string).getTime();
  const expiresAt = new Date(requestedAtMs + EXPIRY_SECONDS * 1000).toISOString();
  const attemptsUsed: 1 | 2 = (recent.length + 1) as 1 | 2;

  logger.info(
    {
      correlationId,
      sessionId,
      doctorId,
      requestId,
      presetReasonCode,
      attemptsUsed,
      expiresAt,
    },
    'recording-escalation-service: escalation requested',
  );

  return { requestId, expiresAt, correlationId, attemptsUsed };
}

// ============================================================================
// Public: patientResponseToEscalation
// ============================================================================

/**
 * Patient responds to the consent modal with `'allow'` or `'decline'`.
 * Runs the atomic UPDATE (race-guard against the timeout worker), and
 * on allow triggers the Twilio rule flip with a one-retry backoff.
 *
 * **Atomicity contract.** The UPDATE is pinned to:
 *   `patient_response IS NULL`  AND
 *   `requested_at > now() - interval '60 seconds'`
 * If either predicate is false, zero rows return and we surface the
 * discriminator to the caller (`already_responded` vs `already_timed_out`).
 *
 * **Twilio retry.** On first failure wait 500±100ms (jitter) and retry.
 * On second failure: emit `video_recording_failed_to_start` system
 * message + stamp `twilio_error_code` on the audit row (Migration 072's
 * additive column). Return `{ accepted: true }` anyway — the patient's
 * consent is recorded; the Twilio failure is a separate surfaced event.
 */
export async function patientResponseToEscalation(
  input: PatientResponseToEscalationInput,
): Promise<PatientResponseToEscalationResult> {
  const requestId = input.requestId?.trim();
  const patientId = input.patientId?.trim();
  const decision = input.decision;
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!requestId) throw new ValidationError('requestId is required');
  if (!patientId) throw new ValidationError('patientId is required');
  if (decision !== 'allow' && decision !== 'decline') {
    throw new ValidationError(`Unknown decision: ${String(decision)}`);
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }

  // Step 1: authZ — find the row + check session patient match. We do
  // this pre-UPDATE so an unauthorised caller never flips the row.
  const row = await fetchRowById(requestId);
  if (!row) throw new NotFoundError('Video escalation request not found');

  const session = await findSessionById(row.session_id);
  if (!session) throw new NotFoundError('Consultation session not found');
  if (!session.patientId || session.patientId !== patientId) {
    return { accepted: false, reason: 'not_a_participant' };
  }

  // Step 2: atomic UPDATE with the expiry + pending guards.
  const cutoffIso = new Date(Date.now() - EXPIRY_SECONDS * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from('video_escalation_audit')
    .update({
      patient_response: decision,
      responded_at: nowIso,
    })
    .eq('id', requestId)
    .is('patient_response', null)
    .gte('requested_at', cutoffIso)
    .select('id, session_id, doctor_id, correlation_id')
    .maybeSingle();

  if (updErr) {
    logger.error(
      { correlationId, requestId, error: updErr.message },
      'recording-escalation-service: atomic response update failed',
    );
    throw new InternalError(
      `recording-escalation-service: response update failed (${updErr.message})`,
    );
  }

  if (!updated) {
    // Either another caller already resolved it, or the 60s window
    // expired. Probe the row to distinguish for the caller.
    const fresh = await fetchRowById(requestId);
    if (!fresh || fresh.patient_response !== null) {
      return { accepted: false, reason: 'already_responded' };
    }
    return { accepted: false, reason: 'already_timed_out' };
  }

  const rowCtx = {
    correlationId: (updated.correlation_id as string | null) ?? correlationId,
    sessionId: updated.session_id as string,
    doctorId: updated.doctor_id as string,
    requestId,
  };

  // Step 3 (decline): log + return. Realtime fan-out is handled by the
  // Postgres-changes subscription the frontend opened on
  // `video_escalation_audit`; nothing else to publish.
  if (decision === 'decline') {
    logger.info(rowCtx, 'recording-escalation-service: patient declined');
    // No system message — hidden from chat per task-41 Notes #3.
    return { accepted: true };
  }

  // Step 4 (allow): flip Twilio rules. One retry on failure.
  const roomSid = session.providerSessionId?.trim();
  if (!roomSid) {
    // Session has no Twilio room somehow — fail the escalation
    // gracefully; the patient's allow is recorded; the doctor sees
    // `video_recording_failed_to_start`.
    logger.error(
      { ...rowCtx },
      'recording-escalation-service: allow but no roomSid — failing Twilio flip',
    );
    await stampTwilioFailure(requestId, 'NO_ROOM_SID', rowCtx.correlationId);
    await emitVideoRecordingFailedToStart(
      rowCtx.sessionId,
      rowCtx.correlationId,
      'NO_ROOM_SID',
    );
    return { accepted: true };
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await escalateToFullVideoRecording({
        sessionId: rowCtx.sessionId,
        roomSid,
        doctorId: rowCtx.doctorId,
        escalationRequestId: requestId,
        correlationId: rowCtx.correlationId,
      });
      // Success — emit banner, return. System message fan-out picks up
      // the `video_recording_started` event via Realtime; the `GET
      // /video-escalation-state` endpoint now derives `locked:
      // already_recording_video` for the doctor UI. Task 42's
      // indicator re-renders on the next Realtime tick as well.
      await emitVideoRecordingStarted(rowCtx.sessionId, rowCtx.correlationId);
      logger.info(
        { ...rowCtx, attempt },
        'recording-escalation-service: Twilio rule flip succeeded',
      );
      return { accepted: true };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { ...rowCtx, attempt, error: message },
        'recording-escalation-service: Twilio rule flip failed',
      );
      if (attempt < 2) {
        // 500ms ±100ms jitter.
        const jitter = Math.floor(Math.random() * 200) - 100;
        await sleep(500 + jitter);
      }
    }
  }

  // Both attempts failed. Stamp Twilio error on the audit row +
  // emit the failure system message to both parties.
  const errCode = extractTwilioErrorCode(lastError);
  await stampTwilioFailure(requestId, errCode, rowCtx.correlationId);
  await emitVideoRecordingFailedToStart(
    rowCtx.sessionId,
    rowCtx.correlationId,
    errCode,
  );
  logger.error(
    { ...rowCtx, twilioErrorCode: errCode, severity: 'critical' },
    'recording-escalation-service: Twilio rule flip failed after retry (patient consent preserved)',
  );
  return { accepted: true };
}

// ============================================================================
// Public: getVideoEscalationStateForSession
// ============================================================================

/**
 * Read-only derived-state query. Powers both the doctor UI's initial
 * mount / reconnect hydration and the patient UI's state probe (e.g.
 * if the patient's consent modal was closed by a timeout, the patient
 * app re-renders to a clean state on mount).
 *
 * **Derivation rules** (mirror the frontend state machine in
 * `task-40-doctor-video-escalation-button-and-reason-modal.md`):
 *
 *   0 rows                             → idle (attemptsUsed=0)
 *   1 row, pending, <60s old           → requesting
 *   1 row, pending, ≥60s old           → requesting (the worker hasn't
 *                                         fired yet; the doctor UI
 *                                         shows the waiting view until
 *                                         Realtime delivers 'timeout')
 *   1 row, response=allow              → locked:already_recording_video
 *   1 row, response=decline|timeout,
 *     <5min old                        → cooldown (attemptsUsed=1)
 *   1 row, response=decline|timeout,
 *     ≥5min old                        → idle (attemptsUsed=1)
 *   2 rows                             → locked:max_attempts
 *                                         UNLESS head is pending+recent
 *                                         (then requesting, attemptsUsed=2)
 *                                         OR head is allow
 *                                         (then locked:already_recording_video)
 */
export async function getVideoEscalationStateForSession(
  input: GetVideoEscalationStateForSessionInput,
): Promise<GetVideoEscalationStateForSessionResult> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) throw new ValidationError('sessionId is required');

  const rows = await fetchRecentRowsForSession(sessionId, MAX_ATTEMPTS);
  const state = deriveState(rows);
  const recent: RecentEscalation[] = rows.map((r) => ({
    requestId:       r.id,
    requestedAt:     r.requested_at,
    patientResponse: r.patient_response,
  }));
  return { state, recent };
}

function deriveState(rows: AuditRowSnapshot[]): VideoEscalationDerivedState {
  if (rows.length === 0) {
    return { kind: 'idle', attemptsUsed: 0 };
  }

  const head = rows[0]!;
  const headMs = new Date(head.requested_at).getTime();
  const nowMs = Date.now();
  const attemptsUsed = rows.length as 1 | 2;

  // Head has an `allow` response that is STILL active (not yet revoked).
  // The doctor UI hides the button; Task 42's indicator is shown.
  if (head.patient_response === 'allow' && head.revoked_at === null) {
    return { kind: 'locked', reason: 'already_recording_video', requestId: head.id };
  }

  // Head is pending.
  if (head.patient_response === null) {
    const expiresAt = new Date(headMs + EXPIRY_SECONDS * 1000).toISOString();
    return {
      kind:         'requesting',
      requestId:    head.id,
      expiresAt,
      attemptsUsed,
    };
  }

  // Head resolved to a terminal state — decline, timeout, OR an
  // allow that was subsequently revoked mid-call (Plan 08 Task 42).
  // Revoke shares the cooldown/idle arithmetic with decline/timeout per
  // Decision 10 LOCKED (task-42 "Re-escalation after revoke"): the
  // revoke counts against attemptsUsed and starts a 5-min cooldown
  // from the ORIGINAL requested_at (not from revoked_at), so the
  // doctor can't immediately re-escalate after a revoke. The UI-facing
  // `lastOutcome` tag is mapped from the terminal shape: we treat a
  // revoked allow like a decline in the cooldown banner copy (both
  // signal "patient ended the video-recording request").
  const cooldownEndMs = headMs + COOLDOWN_MINUTES * 60_000;
  const isRevokedAllow =
    head.patient_response === 'allow' && head.revoked_at !== null;
  const lastOutcome: 'decline' | 'timeout' = isRevokedAllow
    ? 'decline'
    : (head.patient_response as 'decline' | 'timeout');

  if (nowMs < cooldownEndMs) {
    if (attemptsUsed === 2) {
      // Two attempts used + still within cooldown on head. Both cooldown
      // AND max-attempts apply; locked wins (harsher outcome).
      return { kind: 'locked', reason: 'max_attempts', requestId: null };
    }
    return {
      kind:          'cooldown',
      availableAt:   new Date(cooldownEndMs).toISOString(),
      attemptsUsed,
      lastOutcome,
      lastReason:    null, // v1 has no patient-decline free text.
    };
  }

  // Head cooldown elapsed. If max-attempts hit → locked regardless.
  if (attemptsUsed === 2) {
    return { kind: 'locked', reason: 'max_attempts', requestId: null };
  }

  // Only 1 attempt used + cooldown elapsed → idle with attemptsUsed=1.
  return { kind: 'idle', attemptsUsed: 1 };
}

// ============================================================================
// Participant-check helper (for HTTP route RBAC)
// ============================================================================

/**
 * Return `true` when `userId` is either the doctor or the patient on the
 * session backing `requestId`. Used by the patient-respond endpoint to
 * gate non-participants without duplicating the session lookup.
 */
export async function isSessionParticipantForRequest(
  requestId: string,
  userId: string,
): Promise<{ isParticipant: boolean; role: 'doctor' | 'patient' | null; sessionId: string | null }> {
  const row = await fetchRowById(requestId);
  if (!row) return { isParticipant: false, role: null, sessionId: null };
  const session = await findSessionById(row.session_id);
  if (!session) return { isParticipant: false, role: null, sessionId: row.session_id };
  if (session.doctorId === userId) {
    return { isParticipant: true, role: 'doctor', sessionId: row.session_id };
  }
  if (session.patientId && session.patientId === userId) {
    return { isParticipant: true, role: 'patient', sessionId: row.session_id };
  }
  return { isParticipant: false, role: null, sessionId: row.session_id };
}

// ============================================================================
// Public: patientRevokeVideoMidCall
// ============================================================================

/**
 * Patient-initiated revoke of an in-flight video recording (Plan 08
 * Task 42 · Decision 10 LOCKED safety valve).
 *
 * **Step-by-step policy** (mirrors task-42 acceptance criteria):
 *   1. AuthZ — caller must be the session's patient. The controller
 *      already cross-checks the bearer JWT.sub against session.patient_id
 *      via the standard `isSessionParticipant` path, but the service
 *      re-asserts so ad-hoc service callers (future plans) can't
 *      bypass the check.
 *   2. State check — find the most recent `allow` audit row with
 *      `revoked_at IS NULL`. If none → idempotent success. This covers
 *      three scenarios:
 *        · Patient double-taps revoke while the first is in flight.
 *          The second call returns `already_audio_only` without
 *          writing anything (task-42 acceptance "idempotent when
 *          already audio-only").
 *        · Doctor never escalated (the button was never pressed); a
 *          stray revoke from e.g. a stale client returns harmless.
 *        · A concurrent doctor-revert / system-fallback already rolled
 *          the row back; the patient's revoke collapses to a no-op.
 *   3. Call `revertToAudioOnlyRecording` — Task 43's composed
 *      primitive does the Twilio PATCH + ledger rows (attempted +
 *      completed / failed). Throws on failure. **Option A chosen**
 *      (task-42 acceptance "Error handling — Twilio failure"): we let
 *      the error propagate to the caller; the UI shows "Couldn't stop
 *      recording. Try again." No forged success audit row.
 *   4. Atomic UPDATE — stamp `revoked_at` + `revoke_reason` on the
 *      audit row. Guarded by `revoked_at IS NULL` so a race between
 *      two concurrent revokes lands exactly one winner. The UPDATE
 *      fires Postgres-changes to `video_escalation_audit`, which
 *      Task 40's doctor hook + Task 42's indicator both listen to
 *      — the doctor button re-enables (subject to cooldown) and the
 *      indicator fades out on both sides.
 *   5. Write intent-row in `consultation_recording_audit`
 *      (`patient_revoked_video_mid_session`). This sits alongside
 *      Task 43's `video_recording_reverted` rows from step 3; two
 *      audit surfaces serve different consumers (intent vs rule-flip).
 *   6. Emit `video_recording_stopped` system message. Visible to both
 *      parties in the companion chat.
 *   7. Insert doctor-dashboard event (`patient_revoked_video_mid_session`).
 *      Graceful-degrades if Migration 073 hasn't widened the CHECK
 *      constraint yet (logs a warning; the system message from step 6
 *      still surfaces the revoke).
 *
 * **Why `revertToAudioOnlyRecording` is called BEFORE the audit UPDATE.**
 * If the Twilio flip fails, we MUST NOT mark the audit row as revoked
 * — the recording may still be audio+video at Twilio's end, and a
 * forged `revoked_at` would make the doctor UI re-enable the
 * escalation button while video is still rolling. The UPDATE is the
 * source of truth for the UI, so it only runs after Twilio confirms.
 *
 * **Return shape.** `{ correlationId, status }`. Controller maps
 * `status: 'already_audio_only'` to 200 (no-op), `status: 'revoked'`
 * to 200 (success).
 */
export async function patientRevokeVideoMidCall(
  input: PatientRevokeVideoMidCallInput,
): Promise<PatientRevokeVideoMidCallResult> {
  const sessionId = input.sessionId?.trim();
  const patientId = input.patientId?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!patientId) throw new ValidationError('patientId is required');

  // Step 1 — AuthZ + resolve session + roomSid.
  const session = await findSessionById(sessionId);
  if (!session) throw new NotFoundError('Consultation session not found');
  if (!session.patientId || session.patientId !== patientId) {
    throw new ForbiddenError('Only the session patient can revoke video recording');
  }
  const roomSid = session.providerSessionId?.trim();
  // Missing roomSid on a live-video consult is unexpected; Twilio
  // revert is a no-op without one. We treat this as
  // `already_audio_only` because there's no rule-flip to perform AND
  // no audit row to mark — the session simply isn't wired for Twilio.
  // Logging keeps ops-visibility if this ever fires.
  if (!roomSid) {
    logger.warn(
      { correlationId, sessionId },
      'patientRevokeVideoMidCall: no roomSid on session; treating as already_audio_only',
    );
    return { correlationId, status: 'already_audio_only' };
  }

  // Step 2 — find the latest ACTIVE allow row. `fetchRecentRowsForSession`
  // already orders by requested_at DESC so the first matching row is
  // the one to revoke. We scan up to MAX_ATTEMPTS because a second
  // escalation request after a doctor-revert is still allowed in a
  // future v1.1 flow — defensive even though v1 caps at MAX_ATTEMPTS.
  const recent = await fetchRecentRowsForSession(sessionId, MAX_ATTEMPTS);
  const activeAllow = recent.find(
    (r) => r.patient_response === 'allow' && r.revoked_at === null,
  );
  if (!activeAllow) {
    logger.info(
      { correlationId, sessionId, patientId },
      'patientRevokeVideoMidCall: no active allow row; idempotent no-op',
    );
    return { correlationId, status: 'already_audio_only' };
  }

  // Step 3 — Twilio rule flip (Task 43's composed primitive).
  // `revertToAudioOnlyRecording` internally writes the
  // `video_recording_reverted` attempted+completed ledger rows. Throws
  // on Twilio failure.
  const rowCorrelationId =
    (activeAllow.correlation_id ?? correlationId).toString();
  await revertToAudioOnlyRecording({
    sessionId,
    roomSid,
    reason:        'patient_revoked',
    initiatedBy:   'patient',
    correlationId: rowCorrelationId,
  });

  // Step 4 — atomic audit UPDATE. Guard on `revoked_at IS NULL` so a
  // concurrent revoke attempt lands exactly one winner. `.maybeSingle`
  // returns `null` if zero rows matched — which means another path
  // (e.g. a doctor-revert race) won. That's still a success from the
  // patient's POV; we log + skip the remaining side-effects on that
  // branch so we don't double-emit the system message.
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from('video_escalation_audit')
    .update({
      revoked_at:    nowIso,
      revoke_reason: 'patient_revoked',
    })
    .eq('id', activeAllow.id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (updErr) {
    throw new InternalError(
      `recording-escalation-service: revoke audit update failed (${updErr.message})`,
    );
  }
  if (!updated) {
    // Another writer (concurrent revoke / future doctor-revert) won
    // the race. The Twilio flip already landed in Step 3, so the
    // recording is audio-only. Treat this as idempotent success —
    // don't re-emit the system message or dashboard event.
    logger.info(
      { correlationId: rowCorrelationId, sessionId, auditId: activeAllow.id },
      'patientRevokeVideoMidCall: concurrent revoke won; skipping side-effects',
    );
    return { correlationId: rowCorrelationId, status: 'already_audio_only' };
  }

  // Step 5 — write intent-row in consultation_recording_audit. The
  // Migration 064 reason CHECK requires 5..200 chars; we use a pinned
  // canonical copy so the column stays legible across locales (the
  // system message carries the localizable UI surface).
  const patientRevokeIntentReason =
    'Patient revoked video recording mid-consult via the in-call control.';
  const { error: intentErr } = await admin
    .from('consultation_recording_audit')
    .insert({
      session_id:     sessionId,
      action:         'patient_revoked_video_mid_session',
      action_by:      patientId,
      action_by_role: 'patient',
      reason:         patientRevokeIntentReason,
      metadata: {
        kind:                    'video',
        status:                  'completed',
        twilio_sid:              roomSid,
        escalation_request_id:   activeAllow.id,
        initiated_by:            'patient',
      },
      correlation_id: rowCorrelationId,
    });
  if (intentErr) {
    // Intent row is a secondary ledger — Task 43 already wrote the
    // rule-flip rows. Log + continue; don't undo the revoke.
    logger.warn(
      {
        correlationId: rowCorrelationId,
        sessionId,
        auditId:       activeAllow.id,
        error:         intentErr.message,
      },
      'patientRevokeVideoMidCall: consultation_recording_audit intent-row insert failed (non-fatal)',
    );
  }

  // Step 6 — emit system message. Fire-and-forget (errors swallowed
  // inside the emitter).
  await emitVideoRecordingStopped(
    sessionId,
    rowCorrelationId,
    'patient',
    'patient_revoked',
  );

  // Step 7 — insert dashboard-feed event for the doctor. Graceful
  // degrade if Migration 073's CHECK widening hasn't landed OR if
  // `doctor_dashboard_events` is otherwise unavailable (Plan 07 Task
  // 30 dependency-fallback path — see task-42 "Doctor-side reactive
  // surface").
  try {
    await insertDashboardEvent({
      doctorId:   session.doctorId,
      eventKind:  'patient_revoked_video_mid_session',
      sessionId,
      payload: {
        video_escalation_audit_id: activeAllow.id,
        revoked_at:                nowIso,
        // v1 doesn't resolve patient display name OR consult-started-at
        // at the service layer — the frontend feed component falls back
        // to "Your patient" / "Earlier today" respectively. The
        // `sessionId` FK on the row lets a v1.1 surface hydrate richer
        // copy server-side without a payload shape change. Follow-up is
        // captured in docs/capture/inbox.md.
        patient_display_name:      '',
        consult_started_at:        null,
      },
    });
  } catch (err) {
    logger.warn(
      {
        correlationId: rowCorrelationId,
        sessionId,
        doctorId: session.doctorId,
        error:    err instanceof Error ? err.message : String(err),
      },
      'patientRevokeVideoMidCall: dashboard-event insert failed (non-fatal; system message carries the surface)',
    );
  }

  logger.info(
    {
      correlationId: rowCorrelationId,
      sessionId,
      auditId:       activeAllow.id,
      patientId,
    },
    'patientRevokeVideoMidCall: revoke completed',
  );

  return { correlationId: rowCorrelationId, status: 'revoked' };
}

// ============================================================================
// Internals
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTwilioErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const withCode = err as { code?: unknown; status?: unknown };
    if (typeof withCode.code === 'string' || typeof withCode.code === 'number') {
      return String(withCode.code);
    }
    if (typeof withCode.status === 'number') {
      return `HTTP_${withCode.status}`;
    }
  }
  if (err instanceof Error) return err.name;
  return 'UNKNOWN';
}

async function stampTwilioFailure(
  requestId: string,
  twilioErrorCode: string,
  correlationId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from('video_escalation_audit')
    .update({ twilio_error_code: twilioErrorCode.slice(0, 100) })
    .eq('id', requestId);
  if (error) {
    // Migration 072 may not have landed yet — log + move on. The system
    // message already surfaced the failure to the room.
    logger.warn(
      {
        correlationId,
        requestId,
        error: error.message,
      },
      'recording-escalation-service: twilio_error_code stamp failed (migration 072 may be pending)',
    );
  }
}
