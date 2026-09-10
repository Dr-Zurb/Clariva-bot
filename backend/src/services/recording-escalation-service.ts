/**
 * Recording-escalation service — doctor-initiated video-recording consent
 * flow (Plan 08 · Task 41 · Decision 10 LOCKED · **highest-risk server
 * task in Plan 08**).
 *
 * Owns the state machine for video-recording escalation. Two entry
 * points: a doctor request (patient must consent) and a patient offer
 * (self-consenting — rec-25 / REC-D12).
 *
 *     doctor clicks "Request video"
 *         │
 *         ▼
 *   requestVideoEscalation()  ──┐
 *         │                      │ atomic rate-limit check
 *         │                      │ (max 2 *chargeable* / consult;
 *         │                      │  5-min cooldown on decline/timeout;
 *         │                      │  30s debounce on consensual stop /
 *         │                      │  grant expiry; no stacking pending)
 *         │                      │
 *         ▼                      │
 *   video_escalation_audit (pending row) + 60s timer  ◄── durable via
 *         │                                              DB polling worker
 *         ▼
 *   patient's consent modal opens (Realtime fan-out on `INSERT` via the
 *   `video_escalation_audit` Postgres-changes channel, which Plan 08 Task
 *   40/41 frontends subscribe to).
 *         │
 *         ├──── 'allow'    ─► patientResponseToEscalation()
 *         │                    ─► startVideoGrantAfterAllow()
 *         │                         │
 *         │                         ├─ doctor extend once
 *         │                         │    grant_expires_at += 120s
 *         │                         │
 *         │                         └─ 120s elapse ─► grant-expiry
 *         │                              worker reverts audio-only
 *         │                              (revoke_reason=grant_expired)
 *         │                              30s debounce, no attempt cost
 *         ├──── 'decline'  ─► patientResponseToEscalation() (no Twilio)
 *         └──── 60s elapse ─► video-escalation-timeout-worker marks row
 *                             'timeout' (atomic UPDATE; idempotent if
 *                             'allow'/'decline' won the race)
 *
 *     patient taps "Show my video to the doctor"
 *         │
 *         ▼
 *   offerVideoRecording()  ──┐
 *         │                   │ no doctor rate-limit
 *         │                   │ refuse if a doctor request is pending
 *         │                   │ no-op if already recording
 *         │                   │ 30s debounce on stop / grant expiry
 *         │                   │ (doctor decline cooldown does not block)
 *         ▼                   │
 *   video_escalation_audit (already-answered allow,
 *   initiated_by='patient') ─► startVideoGrantAfterAllow()
 *         │                    (same Twilio flip + grant stamp as a
 *         │                     doctor-initiated allow)
 *         ▼
 *   video_recording_started (both parties) — no consent modal, no
 *   new dashboard event_kind (CHECK widen would need a second p4
 *   migration; rec-21 owns the only one)
 *
 * **Why the service owns no setTimeout.** A pod restart would lose an
 * in-memory timer and the row would sit `pending` forever (→ audit row
 * integrity broken + the patient's consent window ambiguous to the
 * doctor UI). The durable strategy is a 5s database-polling worker
 * (`video-escalation-timeout-worker.ts` for consent; sibling
 * `video-grant-expiry-worker.ts` for the 120s grant). A `setTimeout`
 * shadow is deliberately NOT added — the 5s polling fuzz is an
 * acceptable tradeoff against a lost timer that would keep recording
 * video. Revisit if product complains.
 *
 * **Failure-mode mitigations (task-41 spec):**
 *   · A (consent bypass): a `setTimeout`-based flip could fire before
 *     the patient responds if clocks drift. We never call
 *     `escalateToFullVideoRecording` from the timeout path — the
 *     timeout only marks the audit row. The rule-flip lives exclusively
 *     in `startVideoGrantAfterAllow` — the allow branch and the
 *     patient-offer path are the only callers.
 *   · B (silent consent loss): the atomic UPDATE is the source of
 *     truth. Realtime broadcasts are best-effort — if the publish fails
 *     the frontend re-hydrates via `getVideoEscalationStateForSession`
 *     on reconnect.
 *   · C (rate-limit bypass): the rate-limit check reads
 *     `video_escalation_audit` — a durable Postgres table. A server
 *     restart does NOT reset the counter.
 *
 * **REC-D9 / rec-23 — attempt counting.** `attemptsUsed` counts
 * *chargeable* rows (`isChargeableEscalationRow`), not `rows.length`.
 * A doctor-initiated pending, active allow, decline, or timeout
 * consumes one of the two slots. A patient-initiated offer never
 * does. An allow that ended by patient stop (`patient_revoked`) or
 * grant expiry (`grant_expired`) is refunded the moment it ends —
 * 30s debounce from `revoked_at`, no 5-min cooldown. Decline and
 * timeout keep the 5-min window from `requested_at` to the letter.
 *
 * **Migration 073 supersession.** 073's header said a revoke keeps
 * `attemptsUsed` honest and starts a cooldown from `requested_at`
 * so the doctor cannot immediately re-escalate. REC-D9 inverts that
 * for a *consensual* stop. 073 is not edited (shipped migration).
 * This header is the governing note (rec-23 §6.6).
 *
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-41-patient-video-consent-modal-and-escalation-service.md
 * @see docs/Work/Daily-plans/August 2026/17-08-2026/recording-governance-v2/p4-video-escalation-control/Tasks/task-rec-23-derive-state-counter-split.md
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
import { RECORDING_SYSTEM_ACTOR_UUID } from '../types/consultation-recording-audit';
import { findSessionById } from './consultation-session-service';
import { resolveRecordingCaller } from './recording-pause-service';
import {
  emitVideoRecordingFailedToStart,
  emitVideoRecordingPaused,
  emitVideoRecordingResumed,
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

export const VIDEO_ESCALATION_PRESET_REASONS = [
  'visible_symptom',
  'document_procedure',
  'patient_request',
  'other',
] as const;

export type VideoEscalationPresetReason =
  (typeof VIDEO_ESCALATION_PRESET_REASONS)[number];

/** Server-authored; satisfies the 5..200 `reason` CHECK. No doctor free text. */
export const VIDEO_ESCALATION_REASON_BY_PRESET: Record<
  VideoEscalationPresetReason,
  string
> = {
  visible_symptom:    'Doctor needs video to see a visible symptom.',
  document_procedure: 'Doctor needs video to document a procedure.',
  patient_request:    "Doctor is recording video at the patient's request.",
  other:              'Doctor needs video for another clinical reason.',
};

export type PatientResponse = 'allow' | 'decline' | 'timeout';

export interface RequestVideoEscalationInput {
  sessionId:         string;
  /** Must match the session's `doctorId`. Controller enforces this against
   *  the bearer JWT separately; the service re-asserts. */
  doctorId:          string;
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
  /** Session patient actor when the caller already resolved it. */
  patientId?:     string;
  /** Dual-bearer: scoped consult JWT or Supabase patient session. */
  bearerJwt?:     string;
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

export interface OfferVideoRecordingInput {
  sessionId:      string;
  /** Must match `consultation_sessions.patient_id`. Controller enforces
   *  against the bearer JWT; the service re-asserts. */
  patientId:      string;
  correlationId?: string;
}

/**
 *   · `started`            — offer row written; Twilio flip attempted.
 *   · `already_recording`  — video already rolling; idempotent no-op.
 */
export type OfferVideoRecordingResult =
  | {
      status:          'started';
      requestId:       string;
      grantExpiresAt:  string | null;
      correlationId:   string;
    }
  | {
      status:        'already_recording';
      correlationId: string;
    };

/** Server-authored; satisfies the 5..200 `reason` CHECK. No patient free text. */
export const PATIENT_OFFER_REASON =
  'Patient offered video recording during this consult.';

export function canonicalVideoEscalationReason(
  code: VideoEscalationPresetReason,
): string {
  const text = VIDEO_ESCALATION_REASON_BY_PRESET[code];
  if (text.length < REASON_MIN || text.length > REASON_MAX) {
    throw new InternalError(
      'recording-escalation-service: canonical reason failed length CHECK',
    );
  }
  return text;
}

export interface PatientRevokeVideoMidCallInput {
  /** `consultation_sessions.id`. */
  sessionId:      string;
  /** Session patient actor: `patients.id` when set, else session id
   *  (rec-17 surrogate). Controller resolves via dual-bearer. */
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

export interface PauseVideoGrantInput {
  sessionId:      string;
  patientId:      string;
  correlationId?: string;
}

export type PauseVideoGrantResult =
  | { status: 'paused'; correlationId: string }
  | { status: 'already_paused'; correlationId: string }
  | { status: 'already_audio_only'; correlationId: string };

export interface ResumeVideoGrantInput {
  sessionId:      string;
  patientId:      string;
  correlationId?: string;
}

export type ResumeVideoGrantResult =
  | { status: 'resumed'; correlationId: string }
  | { status: 'already_recording'; correlationId: string };

export interface GetVideoEscalationStateForSessionInput {
  sessionId: string;
}

export interface ExtendVideoGrantInput {
  sessionId:      string;
  doctorId:       string;
  correlationId?: string;
}

export interface ExtendVideoGrantResult {
  grantExpiresAt:  string;
  grantExtendedAt: string;
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
      attemptsUsed:  0 | 1 | 2;
    }
  | {
      kind:          'cooldown';
      availableAt:   string;
      attemptsUsed:  0 | 1 | 2;
      lastOutcome:   'decline' | 'timeout' | 'stopped';
      lastReason:    string | null;
    }
  | {
      kind:             'locked';
      reason:           'max_attempts' | 'already_recording_video';
      requestId:        string | null;
      /** rec-22. Set when `reason === 'already_recording_video'`. */
      grantExpiresAt?:  string | null;
      /** rec-22. True when the one doctor extension has been spent. */
      extensionSpent?:  boolean;
      /** rec-24. True when `video_paused_at` is set. Grant still locked. */
      videoPaused?:     boolean;
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

/** 409 — no active allow row to extend. */
export class NoActiveVideoGrantError extends ConflictError {
  constructor() {
    super('No active video recording grant to extend.');
  }
}

/** 409 — the one allowed extension was already spent. */
export class GrantAlreadyExtendedError extends ConflictError {
  constructor() {
    super('This video grant has already been extended.');
  }
}

/** 409 — grant expiry already passed (or was never stamped). */
export class GrantAlreadyExpiredError extends ConflictError {
  constructor() {
    super('This video grant has already expired.');
  }
}

/** 409 — resume after the grant ended; a fresh request is needed. */
export class VideoGrantEndedError extends ConflictError {
  constructor() {
    super('Video recording has ended. A new request is needed to record video again.');
  }
}

/** 409 — a doctor request is still pending; two consent flows is undesigned. */
export class OfferBlockedByPendingRequestError extends ConflictError {
  constructor() {
    super(
      'Your doctor has already asked to record video. Please respond to that request first.',
    );
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
/** rec-22 / REC-D8 / REC4-D2. Default video-grant lifetime. */
const GRANT_SECONDS = 120;
/** rec-22 / REC-D8 / REC4-D2. One doctor extension adds this many seconds. */
const GRANT_EXTENSION_SECONDS = 120;
/** rec-23 / REC-D9. Consensual stop + grant expiry debounce, from `revoked_at`. */
const STOP_DEBOUNCE_MS = 30_000;
/**
 * rec-23 §4.1. Attempts and rows are no longer 1:1 (uncapped stop →
 * re-request). 32 is above the REC4-D10 grant signal (4) and well
 * above `MAX_ATTEMPTS`, while staying a bounded indexed read on
 * `idx_video_escalation_audit_session_time`.
 */
const AUDIT_READ_LIMIT = 32;
/** rec-23 / REC4-D10. Operational signal only — no block, no banner. */
const GRANT_VOLUME_SIGNAL_THRESHOLD = 4;

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
  /** Plan 08 · Task 42 + rec-21. Who / why the revoke fired. v1 emits
   *  `'patient_revoked'`; Migration 197 adds `'grant_expired'`. */
  revoke_reason:       'patient_revoked' | 'doctor_revert' | 'system_error_fallback' | 'grant_expired' | null;
  /** rec-21 / REC-D8. When an allowed grant auto-reverts. NULL on
   *  pending / decline / timeout / legacy rows. */
  grant_expires_at:    string | null;
  /** rec-21 / REC-D8. Presence means the one doctor extension was spent. */
  grant_extended_at:   string | null;
  /** rec-21 / REC-D7. Non-NULL = currently paused. Not a revoke. */
  video_paused_at:     string | null;
  /** rec-21 / REC-D12. NOT NULL in the DB (default `'doctor'`). */
  initiated_by:        'doctor' | 'patient';
}

/**
 * Columns selected by both `fetchRecentRowsForSession` and
 * `fetchRowById`. Pinned as a constant so the two reads stay in sync —
 * a mismatch would silently drop the `revoked_at` field on one path,
 * breaking the state derivation without a type error (Supabase returns
 * partial shapes).
 */
const AUDIT_ROW_SELECT =
  'id, session_id, doctor_id, reason, preset_reason_code, patient_response, requested_at, responded_at, correlation_id, revoked_at, revoke_reason, grant_expires_at, grant_extended_at, video_paused_at, initiated_by';

/**
 * Fields the rec-23 counter split reads. Exported so unit tests can
 * build fixtures without constructing a full audit snapshot.
 */
export type EscalationDeriveInput = Pick<
  AuditRowSnapshot,
  | 'id'
  | 'patient_response'
  | 'requested_at'
  | 'revoked_at'
  | 'revoke_reason'
  | 'initiated_by'
> & {
  grant_expires_at?:  string | null;
  grant_extended_at?: string | null;
  video_paused_at?:   string | null;
};

/**
 * A row consumes one of the doctor's two attempts when it is
 * doctor-initiated and it is pending, currently-active, or
 * terminal-by-decline-or-timeout. Not chargeable when patient-initiated,
 * or when an allow ended by a patient stop or grant expiry (REC-D9).
 *
 * Named once; `deriveVideoEscalationState` and the request-time
 * rate-limit both call this. Do not copy-paste the predicate.
 */
export function isChargeableEscalationRow(row: EscalationDeriveInput): boolean {
  if (row.initiated_by === 'patient') return false;
  if (row.patient_response === null) return true;
  if (row.patient_response === 'decline' || row.patient_response === 'timeout') {
    return true;
  }
  if (row.patient_response === 'allow' && row.revoked_at === null) return true;
  if (row.patient_response === 'allow' && row.revoked_at !== null) {
    return (
      row.revoke_reason === 'doctor_revert' ||
      row.revoke_reason === 'system_error_fallback'
    );
  }
  return false;
}

function isStopClassRow(row: EscalationDeriveInput): boolean {
  return (
    row.patient_response === 'allow' &&
    row.revoked_at !== null &&
    row.revoke_reason !== 'doctor_revert' &&
    row.revoke_reason !== 'system_error_fallback'
  );
}

function countChargeableRows(rows: EscalationDeriveInput[]): number {
  return rows.filter(isChargeableEscalationRow).length;
}

function clampAttemptsUsed(n: number): 0 | 1 | 2 {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  return 2;
}

function clampIdleAttempts(n: number): 0 | 1 {
  return n <= 0 ? 0 : 1;
}

function countGrantedRows(rows: EscalationDeriveInput[]): number {
  return rows.filter((r) => r.patient_response === 'allow').length;
}

function maybeSignalGrantVolume(
  sessionId: string,
  rows: EscalationDeriveInput[],
): void {
  const grantCount = countGrantedRows(rows);
  if (grantCount >= GRANT_VOLUME_SIGNAL_THRESHOLD) {
    logger.info(
      { sessionId, grantCount },
      'recording-escalation-service: session grant count exceeded operational threshold',
    );
  }
}

async function fetchRecentRowsForSession(
  sessionId: string,
  limit: number = AUDIT_READ_LIMIT,
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
 * already-recording, rate-limit, audit insert) and
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
  const presetReasonCode = input.presetReasonCode;
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!doctorId) throw new ValidationError('doctorId is required');
  if (!presetReasonCode) throw new ValidationError('presetReasonCode is required');
  if (!VIDEO_ESCALATION_PRESET_REASONS.includes(presetReasonCode)) {
    throw new ValidationError(`Unknown presetReasonCode: ${String(presetReasonCode)}`);
  }
  const reasonStored = canonicalVideoEscalationReason(presetReasonCode);

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

  // Step 4 (rate-limit). Read is no longer capped at MAX_ATTEMPTS —
  // chargeable rows and raw rows are not the same thing after rec-23.
  const recent = await fetchRecentRowsForSession(sessionId, AUDIT_READ_LIMIT);
  maybeSignalGrantVolume(sessionId, recent);
  const nowMs = Date.now();
  const head = recent[0];
  if (head && head.patient_response === null) {
    // Pending request in-flight. Behaviour unchanged from the
    // `recent.length === 1` guard: reject both a live window and a
    // stale pending (timeout worker will close it; next tap succeeds).
    const headRequestedAtMs = new Date(head.requested_at).getTime();
    if (nowMs - headRequestedAtMs < EXPIRY_SECONDS * 1000) {
      throw new PendingRequestExistsError();
    }
    throw new PendingRequestExistsError();
  }
  if (head && head.patient_response === 'allow' && head.revoked_at === null) {
    // Still-active allow → mode should be 'audio_and_video' and we
    // should have thrown at Step 3. Defensive: treat as locked.
    throw new AlreadyRecordingVideoError();
  }
  if (countChargeableRows(recent) >= MAX_ATTEMPTS) {
    throw new MaxAttemptsReachedError();
  }
  if (head && isStopClassRow(head)) {
    const revokedMs = new Date(head.revoked_at as string).getTime();
    const debounceEndMs = revokedMs + STOP_DEBOUNCE_MS;
    if (nowMs < debounceEndMs) {
      throw new CooldownInProgressError(new Date(debounceEndMs).toISOString());
    }
  } else if (
    head &&
    (head.patient_response === 'decline' || head.patient_response === 'timeout')
  ) {
    const headRequestedAtMs = new Date(head.requested_at).getTime();
    const cooldownEndMs = headRequestedAtMs + COOLDOWN_MINUTES * 60_000;
    if (nowMs < cooldownEndMs) {
      throw new CooldownInProgressError(new Date(cooldownEndMs).toISOString());
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
    reason:              reasonStored,
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
  const nextUsed = clampAttemptsUsed(countChargeableRows(recent) + 1);
  const attemptsUsed: 1 | 2 = nextUsed === 0 ? 1 : nextUsed;

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
// Public: offerVideoRecording (rec-25 / REC-D12)
// ============================================================================

/**
 * Patient offers video without being asked. Self-consenting — the row
 * is written already-answered (`patient_response = 'allow'` +
 * `responded_at` together) so no consent modal can open. Does **not**
 * call the doctor rate-limit. Recording start reuses
 * `startVideoGrantAfterAllow`.
 */
/** Same actor as rec-17: real patient UUID, or session id when missing. */
function assertIsSessionPatient(
  session: { id: string; patientId: string | null },
  patientId: string,
  message: string,
): void {
  const pid = session.patientId?.trim();
  const expected =
    pid && pid !== RECORDING_SYSTEM_ACTOR_UUID ? pid : session.id;
  if (patientId !== expected) {
    throw new ForbiddenError(message);
  }
}

export async function offerVideoRecording(
  input: OfferVideoRecordingInput,
): Promise<OfferVideoRecordingResult> {
  const sessionId = input.sessionId?.trim();
  const patientId = input.patientId?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!patientId) throw new ValidationError('patientId is required');

  const session = await findSessionById(sessionId);
  if (!session) throw new NotFoundError('Consultation session not found');
  assertIsSessionPatient(
    session,
    patientId,
    'Only the session patient can offer video recording',
  );
  if (session.status !== 'live') {
    throw new SessionNotActiveError(session.status);
  }
  const roomSid = session.providerSessionId?.trim();
  if (!roomSid) {
    throw new ConflictError(
      'Video escalation not available for this session (no Twilio room).',
    );
  }

  try {
    const mode = await getCurrentRecordingMode(roomSid);
    if (mode === 'audio_and_video') {
      return { status: 'already_recording', correlationId };
    }
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        roomSid,
        error: err instanceof Error ? err.message : String(err),
      },
      'recording-escalation-service: Twilio mode probe failed on offer; continuing',
    );
  }

  const recent = await fetchRecentRowsForSession(sessionId, AUDIT_READ_LIMIT);
  maybeSignalGrantVolume(sessionId, recent);
  const nowMs = Date.now();
  const head = recent[0];

  if (head && head.patient_response === null) {
    throw new OfferBlockedByPendingRequestError();
  }
  if (head && head.patient_response === 'allow' && head.revoked_at === null) {
    return { status: 'already_recording', correlationId };
  }
  if (head && isStopClassRow(head)) {
    const revokedMs = new Date(head.revoked_at as string).getTime();
    const debounceEndMs = revokedMs + STOP_DEBOUNCE_MS;
    if (nowMs < debounceEndMs) {
      throw new CooldownInProgressError(new Date(debounceEndMs).toISOString());
    }
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }

  const nowIso = new Date().toISOString();
  const insertPayload = {
    session_id:         sessionId,
    doctor_id:          session.doctorId,
    reason:             PATIENT_OFFER_REASON,
    preset_reason_code: 'patient_request',
    patient_response:   'allow',
    responded_at:       nowIso,
    initiated_by:       'patient',
    correlation_id:     correlationId,
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
        error: insertErr.message,
      },
      'recording-escalation-service: offer audit insert failed',
    );
    throw new InternalError(
      `recording-escalation-service: offer audit insert failed (${insertErr.message})`,
    );
  }
  if (!inserted) {
    throw new InternalError(
      'recording-escalation-service: offer audit insert returned no row',
    );
  }

  const requestId = inserted.id as string;
  const { grantExpiresAt } = await startVideoGrantAfterAllow({
    requestId,
    sessionId,
    doctorId: session.doctorId,
    roomSid,
    correlationId,
  });

  logger.info(
    {
      correlationId,
      sessionId,
      requestId,
      grantExpiresAt,
    },
    'recording-escalation-service: patient offered video recording',
  );

  return { status: 'started', requestId, grantExpiresAt, correlationId };
}

// ============================================================================
// Shared: startVideoGrantAfterAllow
// ============================================================================

/**
 * Twilio flip + one retry + grant-expiry stamp after success. Shared
 * by the doctor-initiated allow branch and the patient-offer path.
 * Consent (or the offer row) is already recorded; a Twilio failure
 * leaves the row honest and emits `video_recording_failed_to_start`.
 */
async function startVideoGrantAfterAllow(args: {
  requestId:      string;
  sessionId:      string;
  doctorId:       string;
  roomSid:        string | undefined;
  correlationId:  string;
}): Promise<{ grantExpiresAt: string | null }> {
  const { requestId, sessionId, doctorId, roomSid, correlationId } = args;
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }
  const rowCtx = { correlationId, sessionId, doctorId, requestId };

  if (!roomSid) {
    logger.error(
      { ...rowCtx },
      'recording-escalation-service: allow but no roomSid — failing Twilio flip',
    );
    await stampTwilioFailure(requestId, 'NO_ROOM_SID', correlationId);
    await emitVideoRecordingFailedToStart(sessionId, correlationId, 'NO_ROOM_SID');
    return { grantExpiresAt: null };
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await escalateToFullVideoRecording({
        sessionId,
        roomSid,
        doctorId,
        escalationRequestId: requestId,
        correlationId,
      });
      const grantExpiresAt = new Date(
        Date.now() + GRANT_SECONDS * 1000,
      ).toISOString();
      const { error: stampErr } = await admin
        .from('video_escalation_audit')
        .update({ grant_expires_at: grantExpiresAt })
        .eq('id', requestId)
        .eq('patient_response', 'allow')
        .is('revoked_at', null);
      if (stampErr) {
        logger.error(
          { ...rowCtx, error: stampErr.message, severity: 'critical' },
          'recording-escalation-service: grant expiry stamp failed after Twilio flip',
        );
      }
      await emitVideoRecordingStarted(sessionId, correlationId);
      logger.info(
        { ...rowCtx, attempt, grantExpiresAt },
        'recording-escalation-service: Twilio rule flip succeeded',
      );
      return { grantExpiresAt };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { ...rowCtx, attempt, error: message },
        'recording-escalation-service: Twilio rule flip failed',
      );
      if (attempt < 2) {
        const jitter = Math.floor(Math.random() * 200) - 100;
        await sleep(500 + jitter);
      }
    }
  }

  const errCode = extractTwilioErrorCode(lastError);
  await stampTwilioFailure(requestId, errCode, correlationId);
  await emitVideoRecordingFailedToStart(sessionId, correlationId, errCode);
  logger.error(
    { ...rowCtx, twilioErrorCode: errCode, severity: 'critical' },
    'recording-escalation-service: Twilio rule flip failed after retry (patient consent preserved)',
  );
  return { grantExpiresAt: null };
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
  const decision = input.decision;
  const correlationId = input.correlationId?.trim() || randomUUID();
  const bearerJwt = input.bearerJwt?.trim();
  const patientIdDirect = input.patientId?.trim();

  if (!requestId) throw new ValidationError('requestId is required');
  if (!bearerJwt && !patientIdDirect) {
    throw new ValidationError('patientId or bearerJwt is required');
  }
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

  let patientId = patientIdDirect ?? '';
  if (bearerJwt) {
    const caller = await resolveRecordingCaller(session.id, bearerJwt);
    if (caller.role !== 'patient') {
      return { accepted: false, reason: 'not_a_participant' };
    }
    patientId = caller.actorId;
  }
  const pid = session.patientId?.trim();
  const expected =
    pid && pid !== RECORDING_SYSTEM_ACTOR_UUID ? pid : session.id;
  if (patientId !== expected) {
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

  // Step 4 (allow): flip Twilio rules. Shared with the patient-offer path.
  const roomSid = session.providerSessionId?.trim();
  await startVideoGrantAfterAllow({
    requestId,
    sessionId: rowCtx.sessionId,
    doctorId: rowCtx.doctorId,
    roomSid,
    correlationId: rowCtx.correlationId,
  });
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
 * **Derivation rules** (rec-23 matrix / REC-D9). `attemptsUsed` is the
 * count of chargeable rows, never `rows.length`. Newest row is head.
 *
 *   0 rows                                  → idle (used 0)
 *   pending, <60s or ≥60s (worker pending)  → requesting
 *   allow, active (incl. paused — rec-24)   → locked:already_recording_video
 *   decline|timeout, <5min of requested_at  → cooldown (used = chargeable)
 *   decline|timeout, ≥5min of requested_at  → idle (used = chargeable)
 *     unless chargeable ≥ 2                 → locked:max_attempts
 *   stop|grant_expired, <30s of revoked_at  → cooldown used 0-or-older,
 *                                              lastOutcome='stopped',
 *                                              availableAt = revoked_at+30s
 *   stop|grant_expired, ≥30s                → idle (stop does not count)
 *   decline after a stop                    → cooldown used 1, last decline
 *   stop after a decline                    → cooldown/idle used 1
 *   two stops, ≥30s                         → idle used 0
 *   pending after a stop                    → requesting used 1
 *   patient offer (rec-25)                  → never chargeable
 *   ≥3 rows                                 → legal; count chargeable only
 */
export async function getVideoEscalationStateForSession(
  input: GetVideoEscalationStateForSessionInput,
): Promise<GetVideoEscalationStateForSessionResult> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) throw new ValidationError('sessionId is required');

  const rows = await fetchRecentRowsForSession(sessionId, AUDIT_READ_LIMIT);
  maybeSignalGrantVolume(sessionId, rows);
  const state = deriveVideoEscalationState(rows);
  const recent: RecentEscalation[] = rows.map((r) => ({
    requestId:       r.id,
    requestedAt:     r.requested_at,
    patientResponse: r.patient_response,
  }));
  return { state, recent };
}

/**
 * Pure derivation used by `getVideoEscalationStateForSession` and by
 * rec-23 unit tests. `nowMs` is injectable so matrix rows pin a clock.
 *
 * REC-D9: a consensual stop refunds the attempt and yields a 30s
 * debounce from `revoked_at`. Decline/timeout keep 5 min from
 * `requested_at`. See task-rec-23 matrix — implement to that table.
 */
export function deriveVideoEscalationState(
  rows: EscalationDeriveInput[],
  nowMs: number = Date.now(),
): VideoEscalationDerivedState {
  if (rows.length === 0) {
    return { kind: 'idle', attemptsUsed: 0 };
  }

  const head = rows[0]!;
  const headMs = new Date(head.requested_at).getTime();
  const attemptsUsed = countChargeableRows(rows);

  // Head has an `allow` that is STILL active (not yet revoked). Pause
  // (rec-24) does not revoke — a paused grant stays locked.
  if (head.patient_response === 'allow' && head.revoked_at === null) {
    return {
      kind:            'locked',
      reason:          'already_recording_video',
      requestId:       head.id,
      grantExpiresAt:  head.grant_expires_at ?? null,
      extensionSpent:  Boolean(head.grant_extended_at),
      videoPaused:     Boolean(head.video_paused_at),
    };
  }

  if (head.patient_response === null) {
    const expiresAt = new Date(headMs + EXPIRY_SECONDS * 1000).toISOString();
    return {
      kind:         'requesting',
      requestId:    head.id,
      expiresAt,
      attemptsUsed: clampAttemptsUsed(attemptsUsed),
    };
  }

  if (attemptsUsed >= MAX_ATTEMPTS) {
    return { kind: 'locked', reason: 'max_attempts', requestId: null };
  }

  if (isStopClassRow(head)) {
    const revokedMs = new Date(head.revoked_at as string).getTime();
    const debounceEndMs = revokedMs + STOP_DEBOUNCE_MS;
    if (nowMs < debounceEndMs) {
      return {
        kind:         'cooldown',
        availableAt:  new Date(debounceEndMs).toISOString(),
        attemptsUsed: clampIdleAttempts(attemptsUsed),
        lastOutcome:  'stopped',
        lastReason:   null,
      };
    }
    return { kind: 'idle', attemptsUsed: clampIdleAttempts(attemptsUsed) };
  }

  const cooldownEndMs = headMs + COOLDOWN_MINUTES * 60_000;
  const lastOutcome: 'decline' | 'timeout' =
    head.patient_response === 'timeout' ? 'timeout' : 'decline';

  if (nowMs < cooldownEndMs) {
    return {
      kind:         'cooldown',
      availableAt:  new Date(cooldownEndMs).toISOString(),
      attemptsUsed: clampIdleAttempts(attemptsUsed),
      lastOutcome,
      lastReason:   null,
    };
  }

  return { kind: 'idle', attemptsUsed: clampIdleAttempts(attemptsUsed) };
}

// ============================================================================
// Public: extendVideoGrant (rec-22 — exactly one)
// ============================================================================

/**
 * Doctor spends the single grant extension. Guard is the atomic UPDATE
 * on `grant_extended_at IS NULL` AND `revoked_at IS NULL` AND
 * `grant_expires_at > now` — two rapid taps cannot buy two extensions.
 */
export async function extendVideoGrant(
  input: ExtendVideoGrantInput,
): Promise<ExtendVideoGrantResult> {
  const sessionId = input.sessionId?.trim();
  const doctorId = input.doctorId?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!doctorId) throw new ValidationError('doctorId is required');

  const session = await findSessionById(sessionId);
  if (!session) throw new NotFoundError('Consultation session not found');
  if (session.doctorId !== doctorId) {
    throw new ForbiddenError('Only the session doctor can extend the video grant');
  }
  if (session.status !== 'live') {
    throw new SessionNotActiveError(session.status);
  }

  const recent = await fetchRecentRowsForSession(sessionId, AUDIT_READ_LIMIT);
  const active = recent.find(
    (r) => r.patient_response === 'allow' && r.revoked_at === null,
  );
  if (!active) throw new NoActiveVideoGrantError();
  if (active.grant_extended_at) throw new GrantAlreadyExtendedError();

  const currentExpiryMs = active.grant_expires_at
    ? Date.parse(active.grant_expires_at)
    : Number.NaN;
  if (!Number.isFinite(currentExpiryMs) || currentExpiryMs <= Date.now()) {
    throw new GrantAlreadyExpiredError();
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }

  const nowIso = new Date().toISOString();
  const nextExpiry = new Date(
    currentExpiryMs + GRANT_EXTENSION_SECONDS * 1000,
  ).toISOString();

  const { data: updated, error: updErr } = await admin
    .from('video_escalation_audit')
    .update({
      grant_extended_at: nowIso,
      grant_expires_at:  nextExpiry,
    })
    .eq('id', active.id)
    .eq('patient_response', 'allow')
    .is('revoked_at', null)
    .is('grant_extended_at', null)
    .gt('grant_expires_at', nowIso)
    .select('grant_expires_at, grant_extended_at')
    .maybeSingle();

  if (updErr) {
    logger.error(
      { correlationId, sessionId, requestId: active.id, error: updErr.message },
      'recording-escalation-service: grant extend update failed',
    );
    throw new InternalError(
      `recording-escalation-service: grant extend failed (${updErr.message})`,
    );
  }
  if (!updated) {
    throw new GrantAlreadyExtendedError();
  }

  logger.info(
    {
      correlationId,
      sessionId,
      requestId: active.id,
      grantExpiresAt: nextExpiry,
    },
    'recording-escalation-service: grant extended once',
  );

  return {
    grantExpiresAt:  (updated.grant_expires_at as string) ?? nextExpiry,
    grantExtendedAt: (updated.grant_extended_at as string) ?? nowIso,
  };
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
  assertIsSessionPatient(
    session,
    patientId,
    'Only the session patient can revoke video recording',
  );
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
  // the one to revoke. Read limit is AUDIT_READ_LIMIT (not MAX_ATTEMPTS)
  // because rec-23 made ≥3 rows legal — a later allow after two stops
  // must still be findable.
  const recent = await fetchRecentRowsForSession(sessionId, AUDIT_READ_LIMIT);
  maybeSignalGrantVolume(sessionId, recent);
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
        // captured in docs/Work/capture/inbox.md.
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
// Public: pauseVideoGrant / resumeVideoGrant (rec-24 / REC-D7)
// ============================================================================

function grantHasExpired(row: { grant_expires_at: string | null }): boolean {
  if (!row.grant_expires_at) return false;
  const ms = Date.parse(row.grant_expires_at);
  return Number.isFinite(ms) && ms <= Date.now();
}

/**
 * Patient pauses video on the existing grant. Not a revoke: `revoked_at`
 * stays NULL, no new audit row. Twilio flip first, then stamp
 * `video_paused_at` (same honesty order as stop).
 */
export async function pauseVideoGrant(
  input: PauseVideoGrantInput,
): Promise<PauseVideoGrantResult> {
  const sessionId = input.sessionId?.trim();
  const patientId = input.patientId?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!patientId) throw new ValidationError('patientId is required');

  const session = await findSessionById(sessionId);
  if (!session) throw new NotFoundError('Consultation session not found');
  assertIsSessionPatient(
    session,
    patientId,
    'Only the session patient can pause video recording',
  );
  if (session.status !== 'live') {
    throw new SessionNotActiveError(session.status);
  }
  const roomSid = session.providerSessionId?.trim();
  if (!roomSid) {
    return { status: 'already_audio_only', correlationId };
  }

  const recent = await fetchRecentRowsForSession(sessionId, AUDIT_READ_LIMIT);
  const activeAllow = recent.find(
    (r) => r.patient_response === 'allow' && r.revoked_at === null,
  );
  if (!activeAllow) {
    return { status: 'already_audio_only', correlationId };
  }
  if (activeAllow.video_paused_at) {
    return { status: 'already_paused', correlationId };
  }
  if (grantHasExpired(activeAllow)) {
    throw new VideoGrantEndedError();
  }

  const rowCorrelationId =
    (activeAllow.correlation_id ?? correlationId).toString();
  await revertToAudioOnlyRecording({
    sessionId,
    roomSid,
    reason:        'patient_paused',
    initiatedBy:   'patient',
    correlationId: rowCorrelationId,
  });

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from('video_escalation_audit')
    .update({ video_paused_at: nowIso })
    .eq('id', activeAllow.id)
    .is('revoked_at', null)
    .is('video_paused_at', null)
    .select('id')
    .maybeSingle();
  if (updErr) {
    throw new InternalError(
      `recording-escalation-service: pause stamp failed (${updErr.message})`,
    );
  }
  if (!updated) {
    return { status: 'already_paused', correlationId: rowCorrelationId };
  }

  await emitVideoRecordingPaused(sessionId, rowCorrelationId);
  logger.info(
    { correlationId: rowCorrelationId, sessionId, auditId: activeAllow.id },
    'recording-escalation-service: video grant paused',
  );
  return { status: 'paused', correlationId: rowCorrelationId };
}

/**
 * Resume the same grant. No consent, no requestVideoEscalation, no
 * attempt. Twilio flip first, then clear `video_paused_at`.
 */
export async function resumeVideoGrant(
  input: ResumeVideoGrantInput,
): Promise<ResumeVideoGrantResult> {
  const sessionId = input.sessionId?.trim();
  const patientId = input.patientId?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!patientId) throw new ValidationError('patientId is required');

  const session = await findSessionById(sessionId);
  if (!session) throw new NotFoundError('Consultation session not found');
  assertIsSessionPatient(
    session,
    patientId,
    'Only the session patient can resume video recording',
  );
  if (session.status !== 'live') {
    throw new SessionNotActiveError(session.status);
  }
  const roomSid = session.providerSessionId?.trim();
  if (!roomSid) {
    throw new VideoGrantEndedError();
  }

  const recent = await fetchRecentRowsForSession(sessionId, AUDIT_READ_LIMIT);
  const activeAllow = recent.find(
    (r) => r.patient_response === 'allow' && r.revoked_at === null,
  );
  if (!activeAllow || grantHasExpired(activeAllow)) {
    throw new VideoGrantEndedError();
  }
  if (!activeAllow.video_paused_at) {
    return { status: 'already_recording', correlationId };
  }

  const rowCorrelationId =
    (activeAllow.correlation_id ?? correlationId).toString();
  await escalateToFullVideoRecording({
    sessionId,
    roomSid,
    doctorId: session.doctorId,
    escalationRequestId: activeAllow.id,
    correlationId: rowCorrelationId,
  });

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-escalation-service: Supabase admin client unavailable',
    );
  }
  const { data: updated, error: updErr } = await admin
    .from('video_escalation_audit')
    .update({ video_paused_at: null })
    .eq('id', activeAllow.id)
    .is('revoked_at', null)
    .not('video_paused_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (updErr) {
    throw new InternalError(
      `recording-escalation-service: resume stamp failed (${updErr.message})`,
    );
  }
  if (!updated) {
    return { status: 'already_recording', correlationId: rowCorrelationId };
  }

  await emitVideoRecordingResumed(sessionId, rowCorrelationId);
  logger.info(
    { correlationId: rowCorrelationId, sessionId, auditId: activeAllow.id },
    'recording-escalation-service: video grant resumed',
  );
  return { status: 'resumed', correlationId: rowCorrelationId };
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
