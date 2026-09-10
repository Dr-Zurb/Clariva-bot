/**
 * Recording pause/resume service (Plan 07 · Task 28 · rec-14).
 *
 * Doctor-driven mid-consult pause of the session recording. Twilio's
 * Recording Rules API is the underlying primitive — this service wraps
 * it with an audit ledger + a companion-chat system message so both
 * parties see the pause and the legal / regulatory trail is preserved.
 *
 * **Ledger pattern (double-row):**
 *   1. Validate input (preset reason code, doctor authz, session status).
 *   2. Write an `attempted` audit row BEFORE the Twilio call.
 *   3. Call `twilio-recording-rules.excludeAllParticipantsFromRecording`
 *      / `includeAllParticipantsInRecording` per live kind.
 *   4. On success, write a `completed` audit row (same `correlation_id`
 *      as #2). On failure, write a `failed` row + throw.
 *   5. Emit a `'recording_paused'` / `'recording_resumed'` system
 *      message (best-effort; emitSystemMessage's internal error-swallow
 *      means a failure here does not undo the pause).
 *
 * A Twilio failure or process crash between (2) and (4) leaves an
 * orphan `attempted` row. `recording-orphan-reconciliation-worker`
 * (rec-20) sweeps those after the 5-minute SLA via
 * `idx_recording_audit_attempted`. It observes Twilio and closes the
 * ledger — it never re-drives the original action.
 *
 * **Idempotency:** a second pause while already paused (or resume
 * while not paused) short-circuits without writing new rows and
 * without calling Twilio — returns a `{ skipped: true }` log line.
 * Benign concurrent taps from the same doctor collapse cleanly.
 *
 * **Pause / resume (REC-D13, REC3-D5):** pause reads Twilio's current
 * include-rules and excludes every kind that is actually being
 * captured. The set is stored on the ledger as `metadata.paused_kinds`.
 * Resume replays that set via kind-scoped include — never the
 * mode-scoped setters in `recording-track-service`. Video comes back
 * only when p4 says the grant is still valid; if p4 has no answer,
 * resume restores audio only and stamps `metadata.video_restore`.
 *
 * **p4 pause-state contract (REC3-D6):**
 *   1. "Paused" at the rule level means every kind recorded on the
 *      open pause row is excluded. A paused room therefore reads as
 *      RecordingMode `'other'`, not `'audio_only'`.
 *   2. Ask whether a session is paused via `isSessionRecordingPaused`
 *      (session id) or `isRoomRecordingPaused` (Twilio room SID).
 *      That is the only source of truth. Do not re-derive from mode.
 *   3. While a pause is open, do not flip Recording Rules. Mode
 *      setters in `twilio-recording-rules` consult (2) and no-op.
 *
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-28-recording-pause-resume-mid-consult.md
 * @see backend/src/services/twilio-recording-rules.ts (the merge-aware Twilio wrapper)
 * @see backend/src/services/consultation-message-service.ts · emitSystemMessage
 * @see docs/Work/Daily-plans/August 2026/17-08-2026/recording-governance-v2/p3-pause-integrity/Tasks/task-rec-14-pause-covers-every-active-recording-kind.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { findSessionById, findSessionByProviderSessionId } from './consultation-session-service';
import { emitSystemMessage, formatTimeInDoctorTz } from './consultation-message-service';
import { verifyScopedConsultationJwt } from './supabase-jwt-mint';
import {
  isRecordingPauseReasonCode,
  PAUSE_REASON_NOT_RECORDED,
  RECORDING_AUTO_RESUME_BATCH_CAP,
  RECORDING_PAUSE_AUTO_RESUME_MS,
  RECORDING_PAUSE_MAX_EXTENSIONS,
  RECORDING_SYSTEM_ACTOR_UUID,
  type RecordingAutoResumeExtensionsUsed,
  type RecordingPauseClosedAs,
  type RecordingPauseReasonCode,
  type VideoRestoreDecision,
} from '../types/consultation-recording-audit';
import {
  excludeAllParticipantsFromRecording,
  getIncludedRecordingKinds,
  includeAllParticipantsInRecording,
  TwilioRoomNotFoundError,
  type RecordingRuleKind,
} from './twilio-recording-rules';

// ============================================================================
// Public types
// ============================================================================

export type RecordingCallerRole = 'doctor' | 'patient';

export interface RecordingCaller {
  role: RecordingCallerRole;
  /** Doctor auth.users id, or rec-13 patient surrogate (`session.id` when no patient row). */
  actorId: string;
}

export interface PauseRecordingInput {
  sessionId: string;
  correlationId: string;
  /**
   * Doctor path (existing tests + doctor UI). Required when the caller
   * is the doctor and no `bearerJwt` / `caller` is supplied.
   */
  doctorId?: string;
  /**
   * Dual-bearer mount (rec-17): scoped consult JWT (patient) or
   * Supabase access token (doctor). Discriminated by `resolveRecordingCaller`.
   */
  bearerJwt?: string;
  /** Injected caller for unit tests. */
  caller?: RecordingCaller;
  /**
   * Required for a doctor pause. Ignored for a patient pause — always
   * recorded as `patient_request` (rec-17 / REC-D15).
   */
  reasonCode?: RecordingPauseReasonCode;
}

export interface ResumeRecordingInput {
  sessionId: string;
  correlationId: string;
  doctorId?: string;
  bearerJwt?: string;
  caller?: RecordingCaller;
}

export interface ExtendRecordingPauseInput {
  sessionId: string;
  doctorId: string;
  correlationId: string;
}

export interface ExtendRecordingPauseResult {
  autoResumeAt: Date;
  autoResumeExtensionsUsed: 1;
}

export interface RecordingState {
  sessionId: string;
  paused: boolean;
  pausedAt?: Date;
  /** Actor id of who issued the pause (for the banner). */
  pausedBy?: string;
  /** Durable fact for honest copy — do not infer role from an id. */
  pausedByRole?: RecordingCallerRole;
  /**
   * Preset code, or `not_recorded_in_preset_form` for legacy / redacted
   * rows. Never a doctor-typed sentence (REC3-D9).
   */
  pauseReason?: RecordingPauseReasonCode | typeof PAUSE_REASON_NOT_RECORDED;
  /** Kinds the open pause actually suppressed. Additive (rec-14). */
  pausedKinds?: RecordingRuleKind[];
  resumedAt?: Date;
  /** Server-owned absolute deadline. Clients count down from this. */
  autoResumeAt?: Date;
  autoResumeExtensionsUsed?: RecordingAutoResumeExtensionsUsed;
  /** Echo of the single bound so the UI does not carry its own copy. */
  autoResumeBoundMs?: number;
}

export interface DueAutoResumePauseRow {
  id: string;
  sessionId: string;
  autoResumeAt: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * p4 grant-validity read (REC3-D6). p3 does not inspect
 * `video_escalation_audit`. Until p4 exports a yes/no, this returns
 * `null` (unknown) and resume fails closed — audio only.
 */
export type VideoGrantValidReader = (sessionId: string) => Promise<boolean | null>;

const defaultVideoGrantValidReader: VideoGrantValidReader = async (): Promise<boolean | null> =>
  null;

let videoGrantValidReader: VideoGrantValidReader = defaultVideoGrantValidReader;

/** p4 registers a yes/no grant check here. Until then, resume fails closed. */
export function setVideoGrantValidReader(reader: VideoGrantValidReader): void {
  videoGrantValidReader = reader;
}

export function __setVideoGrantValidReaderForTests(reader: VideoGrantValidReader): void {
  setVideoGrantValidReader(reader);
}

export function __resetVideoGrantValidReaderForTests(): void {
  videoGrantValidReader = defaultVideoGrantValidReader;
}

/**
 * action_by_role CHECK constraint mirrors the migration.
 */
type ActionByRole = 'doctor' | 'patient' | 'system' | 'support_staff';

type AuditAction =
  | 'recording_paused'
  | 'recording_resumed'
  | 'recording_stopped'
  | 'patient_revoked_video_mid_session'
  | 'recording_started'
  | 'patient_declined_pre_session';

type LedgerStatus = 'attempted' | 'completed' | 'failed';

// ============================================================================
// Audit row helpers (private)
// ============================================================================

interface AuditRow {
  id?: string;
  session_id: string;
  action: AuditAction;
  action_by: string;
  action_by_role: ActionByRole;
  reason: string | null;
  pause_reason_code?: RecordingPauseReasonCode | null;
  auto_resume_at?: string | null;
  auto_resume_extensions_used?: RecordingAutoResumeExtensionsUsed | null;
  pause_closed_as?: RecordingPauseClosedAs | null;
  metadata: {
    twilio_sid?: string;
    kind: RecordingRuleKind;
    paused_kinds?: RecordingRuleKind[];
    restored_kinds?: RecordingRuleKind[];
    video_restore?: VideoRestoreDecision;
    status: LedgerStatus;
    error?: string;
  };
  correlation_id: string | null;
  created_at?: string;
}

async function insertAuditRow(row: Omit<AuditRow, 'id' | 'created_at'>): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-pause-service: Supabase admin client unavailable — cannot write audit row'
    );
  }
  const { error } = await admin
    .from('consultation_recording_audit')
    .insert(row as unknown as Record<string, unknown>);
  if (error) {
    throw new InternalError(`recording-pause-service: audit insert failed (${error.message})`);
  }
}

interface LatestAuditSummary {
  id: string | null;
  action: AuditAction;
  status: LedgerStatus | null;
  reason: string | null;
  pauseReasonCode: RecordingPauseReasonCode | null;
  actionBy: string;
  actionByRole: ActionByRole | null;
  createdAt: Date;
  twilioSid: string | null;
  pausedKinds: RecordingRuleKind[];
  autoResumeAt: Date | null;
  autoResumeExtensionsUsed: RecordingAutoResumeExtensionsUsed | null;
  pauseClosedAs: RecordingPauseClosedAs | null;
}

/**
 * Fetch the most-recent `recording_paused` / `recording_resumed` row
 * for a session. `getCurrentRecordingState` and the idempotency-check
 * path share this read so they stay consistent.
 *
 * Returns `null` if no row has ever been written for this session (the
 * "never paused" state — the default at session creation time).
 */
type LatestFetch = { ok: true; row: LatestAuditSummary | null } | { ok: false };

function parsePausedKinds(
  metadata: {
    kind?: unknown;
    paused_kinds?: unknown;
  } | null
): RecordingRuleKind[] {
  const raw = metadata?.paused_kinds;
  if (Array.isArray(raw)) {
    const kinds = raw.filter((k): k is RecordingRuleKind => k === 'audio' || k === 'video');
    if (kinds.length > 0) return kinds;
  }
  if (metadata?.kind === 'audio' || metadata?.kind === 'video') {
    return [metadata.kind];
  }
  return ['audio'];
}

async function fetchLatestPauseResumeRowResult(sessionId: string): Promise<LatestFetch> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: true, row: null };
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .select(
      'id, action, reason, pause_reason_code, action_by, action_by_role, metadata, created_at, auto_resume_at, auto_resume_extensions_used, pause_closed_as'
    )
    .eq('session_id', sessionId)
    .in('action', ['recording_paused', 'recording_resumed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'recording-pause-service: latest audit row lookup failed'
    );
    return { ok: false };
  }
  if (!data) return { ok: true, row: null };
  const row = data as {
    id?: string;
    action: AuditAction;
    reason: string | null;
    pause_reason_code?: RecordingPauseReasonCode | null;
    action_by: string;
    action_by_role?: ActionByRole | null;
    metadata: {
      status?: LedgerStatus;
      twilio_sid?: string;
      kind?: RecordingRuleKind;
      paused_kinds?: RecordingRuleKind[];
    } | null;
    created_at: string;
    auto_resume_at?: string | null;
    auto_resume_extensions_used?: number | null;
    pause_closed_as?: RecordingPauseClosedAs | null;
  };
  return {
    ok: true,
    row: mapLatestRow(row),
  };
}

function mapLatestRow(row: {
  id?: string;
  action: AuditAction;
  reason: string | null;
  pause_reason_code?: RecordingPauseReasonCode | null;
  action_by: string;
  action_by_role?: ActionByRole | null;
  metadata: {
    status?: LedgerStatus;
    twilio_sid?: string;
    kind?: RecordingRuleKind;
    paused_kinds?: RecordingRuleKind[];
  } | null;
  created_at: string;
  auto_resume_at?: string | null;
  auto_resume_extensions_used?: number | null;
  pause_closed_as?: RecordingPauseClosedAs | null;
}): LatestAuditSummary {
  const extensions = row.auto_resume_extensions_used;
  return {
    id: row.id ?? null,
    action: row.action,
    status: row.metadata?.status ?? null,
    reason: row.reason,
    pauseReasonCode: isRecordingPauseReasonCode(row.pause_reason_code)
      ? row.pause_reason_code
      : null,
    actionBy: row.action_by,
    actionByRole: row.action_by_role ?? null,
    createdAt: new Date(row.created_at),
    twilioSid: row.metadata?.twilio_sid ?? null,
    pausedKinds: parsePausedKinds(row.metadata),
    autoResumeAt: row.auto_resume_at ? new Date(row.auto_resume_at) : null,
    autoResumeExtensionsUsed: extensions === 0 || extensions === 1 ? extensions : null,
    pauseClosedAs: row.pause_closed_as ?? null,
  };
}

async function fetchLatestPauseResumeRow(sessionId: string): Promise<LatestAuditSummary | null> {
  const result = await fetchLatestPauseResumeRowResult(sessionId);
  return result.ok ? result.row : null;
}

function isCompletedPause(row: LatestAuditSummary | null): boolean {
  return (
    !!row &&
    row.action === 'recording_paused' &&
    row.status === 'completed' &&
    row.pauseClosedAs == null
  );
}

function nextAutoResumeAt(fromMs: number = Date.now()): string {
  return new Date(fromMs + RECORDING_PAUSE_AUTO_RESUME_MS).toISOString();
}

/**
 * Authoritative pause-state read for p4 (and any rule-flipping path).
 * True only for a completed `recording_paused` row that has not been
 * followed by a later pause/resume row. Lookup failure fails closed
 * (treat as paused) so a revert cannot silently re-include audio.
 */
export async function isSessionRecordingPaused(sessionId: string): Promise<boolean> {
  const trimmed = sessionId?.trim();
  if (!trimmed) return false;
  const result = await fetchLatestPauseResumeRowResult(trimmed);
  if (!result.ok) return true;
  return isCompletedPause(result.row);
}

/**
 * Room-SID entry point used by `setRecordingRulesToAudioOnly` /
 * `setRecordingRulesToAudioAndVideo`. Unknown rooms are not paused
 * (create-time baseline must still land).
 */
export async function isRoomRecordingPaused(roomSid: string): Promise<boolean> {
  const trimmed = roomSid?.trim();
  if (!trimmed) return false;
  const session =
    (await findSessionByProviderSessionId('twilio_video', trimmed)) ??
    (await findSessionByProviderSessionId('twilio_video_audio', trimmed));
  if (!session) return false;
  return isSessionRecordingPaused(session.id);
}

function primaryKind(kinds: RecordingRuleKind[]): RecordingRuleKind {
  return kinds.includes('audio') ? 'audio' : (kinds[0] ?? 'audio');
}

function resolvePauseReasonToken(
  pauseReasonCode: RecordingPauseReasonCode | null | undefined,
  reason: string | null | undefined,
): RecordingPauseReasonCode | typeof PAUSE_REASON_NOT_RECORDED {
  if (isRecordingPauseReasonCode(pauseReasonCode)) return pauseReasonCode;
  if (isRecordingPauseReasonCode(reason)) return reason;
  return PAUSE_REASON_NOT_RECORDED;
}

// ============================================================================
// Public: resolveRecordingCaller (rec-17 dual-bearer)
// ============================================================================

function patientActorIdForSession(session: { id: string; patientId: string | null }): string {
  const pid = session.patientId?.trim();
  if (pid && pid !== RECORDING_SYSTEM_ACTOR_UUID) return pid;
  return session.id;
}

async function resolveCallerFromInput(
  sessionId: string,
  input: { doctorId?: string; bearerJwt?: string; caller?: RecordingCaller }
): Promise<RecordingCaller> {
  if (input.caller) return input.caller;
  if (input.bearerJwt?.trim()) {
    return resolveRecordingCaller(sessionId, input.bearerJwt.trim());
  }
  const doctorId = input.doctorId?.trim();
  if (doctorId) return { role: 'doctor', actorId: doctorId };
  throw new ValidationError('Authentication required');
}

/**
 * Discriminate a Bearer token the way attachment-sign / snapshot /
 * replay already do: scoped consult JWT first, then Supabase `getUser`.
 * Extra-participant tokens are refused — they are not a party to this
 * control. Membership goes through `isSessionParticipant`.
 */
export async function resolveRecordingCaller(
  sessionId: string,
  bearerJwt: string
): Promise<RecordingCaller> {
  const trimmedSession = sessionId?.trim();
  const token = bearerJwt?.trim();
  if (!trimmedSession) {
    throw new ValidationError('sessionId is required');
  }
  if (!token) {
    throw new UnauthorizedError('Bearer token is required');
  }

  const session = await findSessionById(trimmedSession);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  try {
    const claims = verifyScopedConsultationJwt(token);
    if (claims.consult_role === 'patient') {
      if (claims.session_id !== trimmedSession) {
        throw new UnauthorizedError('Token is not scoped to this session');
      }
      const membership = await isSessionParticipant(trimmedSession, claims.sub, {
        jwtSessionId: claims.session_id,
        consultRole: 'patient',
      });
      if (!membership.isParticipant || membership.role !== 'patient') {
        throw new ForbiddenError('Not a participant of this session');
      }
      return { role: 'patient', actorId: patientActorIdForSession(session) };
    }
    if (claims.consult_role === 'extra_participant') {
      throw new ForbiddenError('Only the doctor or patient can control recording');
    }
  } catch (err) {
    if (
      err instanceof UnauthorizedError ||
      err instanceof NotFoundError ||
      err instanceof ForbiddenError
    ) {
      throw err;
    }
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new UnauthorizedError('Invalid or expired token');
  }
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user?.id) {
    throw new UnauthorizedError('Invalid or expired token');
  }
  const membership = await isSessionParticipant(trimmedSession, userData.user.id);
  if (!membership.isParticipant || !membership.role) {
    throw new ForbiddenError('Not a participant of this session');
  }
  if (membership.role === 'patient') {
    return { role: 'patient', actorId: patientActorIdForSession(session) };
  }
  return { role: 'doctor', actorId: userData.user.id };
}

function assertCallerMayAct(
  caller: RecordingCaller,
  membership: { isParticipant: boolean; role: 'doctor' | 'patient' | null }
): void {
  if (!membership.isParticipant || membership.role !== caller.role) {
    throw new ForbiddenError(
      caller.role === 'doctor'
        ? 'Only the session doctor can pause recording'
        : 'Not a participant of this session'
    );
  }
}

function resumeRefusedCopy(pausedByRole: RecordingCallerRole): string {
  return pausedByRole === 'patient'
    ? 'Only the patient who paused can resume this recording. It will resume automatically in a few minutes.'
    : 'Only your doctor can resume this recording. It will resume automatically in a few minutes.';
}

// ============================================================================
// Public: pauseRecording
// ============================================================================

export async function pauseRecording(input: PauseRecordingInput): Promise<void> {
  const sessionId = input.sessionId?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';

  // 1. Input validation.
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }

  const caller = await resolveCallerFromInput(sessionId, input);
  const reasonCode: RecordingPauseReasonCode =
    caller.role === 'patient' ? 'patient_request' : (input.reasonCode as RecordingPauseReasonCode);
  if (caller.role === 'doctor' && !isRecordingPauseReasonCode(reasonCode)) {
    throw new ValidationError('reasonCode must be one of the five preset pause reasons');
  }

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }
  const membership = await isSessionParticipant(sessionId, caller.actorId);
  assertCallerMayAct(caller, membership);
  if (session.status !== 'live') {
    throw new ConflictError(`Cannot pause recording when session status is '${session.status}'`);
  }

  const twilioSid = session.providerSessionId?.trim();
  if (!twilioSid) {
    // The rules API is scoped to a room SID — without one we can't
    // toggle anything. This should only happen for a session whose
    // adapter hasn't minted a provider id yet (e.g. Plan 04 text).
    throw new ConflictError('Recording pause not available for this session (no Twilio room)');
  }

  // 2. Idempotency: if already paused + completed, no-op.
  const latest = await fetchLatestPauseResumeRow(sessionId);
  if (isCompletedPause(latest)) {
    logger.info(
      { correlationId, sessionId, skipped: true, reason: 'already_paused' },
      'recording-pause-service: pause skipped — already paused'
    );
    return;
  }

  let pausedKinds: RecordingRuleKind[];
  try {
    pausedKinds = await getIncludedRecordingKinds(twilioSid);
    if (pausedKinds.length === 0) pausedKinds = ['audio'];
  } catch (err) {
    await writePauseFailedPair({
      sessionId,
      actorId: caller.actorId,
      actorRole: caller.role,
      reasonCode,
      twilioSid,
      correlationId,
      pausedKinds: ['audio'],
      err,
    });
    throw err;
  }

  const kind = primaryKind(pausedKinds);

  // 3. Attempted audit row BEFORE the Twilio mutation.
  await insertAuditRow({
    session_id: sessionId,
    action: 'recording_paused',
    action_by: caller.actorId,
    action_by_role: caller.role,
    reason: reasonCode,
    pause_reason_code: reasonCode,
    metadata: {
      twilio_sid: twilioSid,
      kind,
      paused_kinds: pausedKinds,
      status: 'attempted',
    },
    correlation_id: correlationId,
  });

  // 4. Exclude every live kind. A partial success is still a failure.
  try {
    for (const liveKind of pausedKinds) {
      await excludeAllParticipantsFromRecording(twilioSid, liveKind, correlationId);
    }
  } catch (err) {
    await writePauseOutcomeRow({
      sessionId,
      actorId: caller.actorId,
      actorRole: caller.role,
      reasonCode,
      twilioSid,
      correlationId,
      pausedKinds,
      status: 'failed',
      err,
    });
    throw err;
  }

  // 5b. Completed row.
  await insertAuditRow({
    session_id: sessionId,
    action: 'recording_paused',
    action_by: caller.actorId,
    action_by_role: caller.role,
    reason: reasonCode,
    pause_reason_code: reasonCode,
    auto_resume_at: nextAutoResumeAt(),
    auto_resume_extensions_used: 0,
    pause_closed_as: null,
    metadata: {
      twilio_sid: twilioSid,
      kind,
      paused_kinds: pausedKinds,
      status: 'completed',
    },
    correlation_id: correlationId,
  });

  // 6. Companion-chat system message (best-effort).
  try {
    const timeLabel = formatTimeInDoctorTz(
      new Date(),
      (await loadDoctorTzForSession(sessionId)) ?? undefined
    );
    const coveredBoth = pausedKinds.includes('audio') && pausedKinds.includes('video');
    const actorLabel = caller.role === 'patient' ? 'Patient' : 'Doctor';
    const body = coveredBoth
      ? `${actorLabel} paused audio and video recording at ${timeLabel}.`
      : `${actorLabel} paused recording at ${timeLabel}.`;
    await emitSystemMessage({
      sessionId,
      event: 'recording_paused',
      body,
      correlationId: `recording_paused:${correlationId}`,
      meta: { byRole: caller.role, pausedKinds },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId, error: message },
      'recording-pause-service: emitSystemMessage (paused) failed; pause remains active'
    );
  }
}

async function writePauseFailedPair(input: {
  sessionId: string;
  actorId: string;
  actorRole: RecordingCallerRole;
  reasonCode: RecordingPauseReasonCode;
  twilioSid: string;
  correlationId: string;
  pausedKinds: RecordingRuleKind[];
  err: unknown;
}): Promise<void> {
  const kind = primaryKind(input.pausedKinds);
  await insertAuditRow({
    session_id: input.sessionId,
    action: 'recording_paused',
    action_by: input.actorId,
    action_by_role: input.actorRole,
    reason: input.reasonCode,
    pause_reason_code: input.reasonCode,
    metadata: {
      twilio_sid: input.twilioSid,
      kind,
      paused_kinds: input.pausedKinds,
      status: 'attempted',
    },
    correlation_id: input.correlationId,
  });
  await writePauseOutcomeRow({ ...input, status: 'failed' });
}

async function writePauseOutcomeRow(input: {
  sessionId: string;
  actorId: string;
  actorRole: RecordingCallerRole;
  reasonCode: RecordingPauseReasonCode;
  twilioSid: string;
  correlationId: string;
  pausedKinds: RecordingRuleKind[];
  status: 'failed';
  err: unknown;
}): Promise<void> {
  const message = input.err instanceof Error ? input.err.message : String(input.err);
  if (input.err instanceof TwilioRoomNotFoundError) {
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        roomSid: input.twilioSid,
        error: message,
      },
      'recording-pause-service: Twilio room not found'
    );
  }
  await insertAuditRow({
    session_id: input.sessionId,
    action: 'recording_paused',
    action_by: input.actorId,
    action_by_role: input.actorRole,
    reason: input.reasonCode,
    pause_reason_code: input.reasonCode,
    metadata: {
      twilio_sid: input.twilioSid,
      kind: primaryKind(input.pausedKinds),
      paused_kinds: input.pausedKinds,
      status: input.status,
      error: message.slice(0, 500),
    },
    correlation_id: input.correlationId,
  }).catch((writeErr) => {
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        error: writeErr instanceof Error ? writeErr.message : String(writeErr),
      },
      'recording-pause-service: failed-row write ALSO failed (Twilio failed first)'
    );
  });
}

// ============================================================================
// Public: resumeRecording
// ============================================================================

export async function resumeRecording(input: ResumeRecordingInput): Promise<void> {
  const sessionId = input.sessionId?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';

  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }

  const caller = await resolveCallerFromInput(sessionId, input);

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }
  const membership = await isSessionParticipant(sessionId, caller.actorId);
  if (!membership.isParticipant || membership.role !== caller.role) {
    throw new ForbiddenError(
      caller.role === 'doctor'
        ? 'Only the session doctor can resume recording'
        : 'Not a participant of this session'
    );
  }

  const latest = await fetchLatestPauseResumeRow(sessionId);
  if (isCompletedPause(latest)) {
    const pausedByRole: RecordingCallerRole =
      latest!.actionByRole === 'patient' ? 'patient' : 'doctor';
    if (pausedByRole !== caller.role) {
      throw new ForbiddenError(resumeRefusedCopy(pausedByRole));
    }
  }

  await executeResume({
    sessionId,
    session,
    actorId: caller.actorId,
    actorRole: caller.role,
    closedAs: 'manual_resume',
    correlationId,
  });
}

/**
 * Worker entry: same restore path as a doctor resume (rec-14), attributed
 * to the system actor. Distinguisher: `pause_closed_as = auto_resume`.
 */
export async function resumeRecordingAsSystem(input: {
  sessionId: string;
  correlationId: string;
}): Promise<void> {
  const sessionId = input.sessionId?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }
  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }
  await executeResume({
    sessionId,
    session,
    actorId: RECORDING_SYSTEM_ACTOR_UUID,
    actorRole: 'system',
    closedAs: 'auto_resume',
    correlationId,
  });
}

async function executeResume(input: {
  sessionId: string;
  session: NonNullable<Awaited<ReturnType<typeof findSessionById>>>;
  actorId: string;
  actorRole: 'doctor' | 'patient' | 'system';
  closedAs: 'manual_resume' | 'auto_resume';
  correlationId: string;
}): Promise<void> {
  const { sessionId, session, actorId, actorRole, closedAs, correlationId } = input;

  if (session.status !== 'live') {
    throw new ConflictError(`Cannot resume recording when session status is '${session.status}'`);
  }

  const twilioSid = session.providerSessionId?.trim();
  if (!twilioSid) {
    throw new ConflictError('Recording resume not available for this session (no Twilio room)');
  }

  const latest = await fetchLatestPauseResumeRow(sessionId);

  if (!isCompletedPause(latest)) {
    logger.info(
      { correlationId, sessionId, skipped: true, reason: 'not_paused' },
      'recording-pause-service: resume skipped — not currently paused'
    );
    return;
  }

  const pausedKinds = latest!.pausedKinds;
  const restore = await resolveKindsToRestore(sessionId, pausedKinds);
  const kind = primaryKind(restore.restoredKinds);

  await insertAuditRow({
    session_id: sessionId,
    action: 'recording_resumed',
    action_by: actorId,
    action_by_role: actorRole,
    reason: null,
    metadata: {
      twilio_sid: twilioSid,
      kind,
      paused_kinds: pausedKinds,
      restored_kinds: restore.restoredKinds,
      video_restore: restore.videoRestore,
      status: 'attempted',
    },
    correlation_id: correlationId,
  });

  try {
    for (const restoreKind of restore.restoredKinds) {
      await includeAllParticipantsInRecording(twilioSid, restoreKind, correlationId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof TwilioRoomNotFoundError) {
      logger.error(
        { correlationId, sessionId, roomSid: twilioSid, error: message },
        'recording-pause-service: resume — Twilio room not found'
      );
    }
    await insertAuditRow({
      session_id: sessionId,
      action: 'recording_resumed',
      action_by: actorId,
      action_by_role: actorRole,
      reason: null,
      metadata: {
        twilio_sid: twilioSid,
        kind,
        paused_kinds: pausedKinds,
        restored_kinds: restore.restoredKinds,
        video_restore: restore.videoRestore,
        status: 'failed',
        error: message.slice(0, 500),
      },
      correlation_id: correlationId,
    }).catch((writeErr) => {
      logger.error(
        {
          correlationId,
          sessionId,
          error: writeErr instanceof Error ? writeErr.message : String(writeErr),
        },
        'recording-pause-service: failed-row write (resume) ALSO failed'
      );
    });
    throw err;
  }

  await insertAuditRow({
    session_id: sessionId,
    action: 'recording_resumed',
    action_by: actorId,
    action_by_role: actorRole,
    reason: null,
    metadata: {
      twilio_sid: twilioSid,
      kind,
      paused_kinds: pausedKinds,
      restored_kinds: restore.restoredKinds,
      video_restore: restore.videoRestore,
      status: 'completed',
    },
    correlation_id: correlationId,
  });

  await stampOpenPauseClosed(sessionId, closedAs);

  try {
    const timeLabel = formatTimeInDoctorTz(
      new Date(),
      (await loadDoctorTzForSession(sessionId)) ?? undefined
    );
    const videoWithheld = pausedKinds.includes('video') && !restore.restoredKinds.includes('video');
    const actorLabel = actorRole === 'patient' ? 'Patient' : 'Doctor';
    const body =
      actorRole === 'system'
        ? `Recording resumed automatically at ${timeLabel}.`
        : videoWithheld
          ? `${actorLabel} resumed audio recording at ${timeLabel}.`
          : `${actorLabel} resumed recording at ${timeLabel}.`;
    await emitSystemMessage({
      sessionId,
      event: 'recording_resumed',
      body,
      correlationId: `recording_resumed:${correlationId}`,
      meta: { byRole: actorRole, restoredKinds: restore.restoredKinds, closedAs },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId, error: message },
      'recording-pause-service: emitSystemMessage (resumed) failed; resume remains active'
    );
  }
}

async function resolveKindsToRestore(
  sessionId: string,
  pausedKinds: RecordingRuleKind[]
): Promise<{ restoredKinds: RecordingRuleKind[]; videoRestore: VideoRestoreDecision }> {
  const restoredKinds: RecordingRuleKind[] = [];
  if (pausedKinds.includes('audio')) restoredKinds.push('audio');

  if (!pausedKinds.includes('video')) {
    return { restoredKinds, videoRestore: 'not_applicable' };
  }

  const grant = await videoGrantValidReader(sessionId);
  if (grant === true) {
    restoredKinds.push('video');
    return { restoredKinds, videoRestore: 'restored' };
  }
  // Fail closed: unknown (p4 not shipped) or explicit lapse.
  return {
    restoredKinds,
    videoRestore: grant === false ? 'grant_lapsed' : 'grant_unknown',
  };
}

// ============================================================================
// Public: extend + dangling stamp + worker helpers (rec-16)
// ============================================================================

export async function extendRecordingPause(
  input: ExtendRecordingPauseInput
): Promise<ExtendRecordingPauseResult> {
  const sessionId = input.sessionId?.trim();
  const doctorId = input.doctorId?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }
  if (!doctorId) {
    throw new ValidationError('doctorId is required');
  }

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }
  if (session.doctorId !== doctorId) {
    throw new ForbiddenError('Only the session doctor can extend a recording pause');
  }
  if (session.status !== 'live') {
    throw new ConflictError(`Cannot extend a pause when session status is '${session.status}'`);
  }

  const latest = await fetchLatestPauseResumeRow(sessionId);
  if (!isCompletedPause(latest) || !latest?.id) {
    throw new ConflictError('No open recording pause to extend');
  }
  if (latest.autoResumeExtensionsUsed === RECORDING_PAUSE_MAX_EXTENSIONS) {
    throw new ConflictError('This pause has already been extended once');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('recording-pause-service: admin client unavailable');
  }

  const nextDeadline = nextAutoResumeAt();
  const nowIso = new Date().toISOString();

  const { data: openRow } = await admin
    .from('consultation_recording_audit')
    .select('id, metadata')
    .eq('id', latest.id)
    .maybeSingle();
  const existingMeta =
    openRow && typeof openRow.metadata === 'object' && openRow.metadata !== null
      ? (openRow.metadata as Record<string, unknown>)
      : {};

  const { data: updated, error } = await admin
    .from('consultation_recording_audit')
    .update({
      auto_resume_at: nextDeadline,
      auto_resume_extensions_used: 1,
      metadata: {
        ...existingMeta,
        extension: { by: doctorId, at: nowIso },
      },
    })
    .eq('id', latest.id)
    .is('pause_closed_as', null)
    .eq('auto_resume_extensions_used', 0)
    .filter('metadata->>auto_resume_claim_id', 'is', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new InternalError(`recording-pause-service: extend update failed (${error.message})`);
  }
  if (!updated) {
    logger.info(
      { correlationId, sessionId, skipped: true, reason: 'extend_raced' },
      'recording-pause-service: extend no-op — pause closed, claimed, or already extended'
    );
    return { autoResumeAt: new Date(nextDeadline), autoResumeExtensionsUsed: 1 };
  }

  logger.info(
    { correlationId, sessionId, autoResumeAt: nextDeadline, extendedBy: doctorId },
    'recording-pause-service: pause extended once'
  );
  return { autoResumeAt: new Date(nextDeadline), autoResumeExtensionsUsed: 1 };
}

export async function stampDanglingPausesForEndedSession(
  sessionId: string,
  correlationId: string
): Promise<number> {
  const trimmed = sessionId?.trim();
  if (!trimmed) return 0;
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId, sessionId: trimmed },
      'recording-pause-service: dangling stamp skipped — no admin client'
    );
    return 0;
  }
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .update({ pause_closed_as: 'session_ended_while_paused' })
    .eq('session_id', trimmed)
    .eq('action', 'recording_paused')
    .is('pause_closed_as', null)
    .filter('metadata->>status', 'eq', 'completed')
    .select('id');
  if (error) {
    logger.warn(
      { correlationId, sessionId: trimmed, error: error.message },
      'recording-pause-service: dangling-pause stamp failed'
    );
    return 0;
  }
  const count = data?.length ?? 0;
  if (count > 0) {
    logger.info(
      { correlationId, sessionId: trimmed, stamped: count },
      'recording-pause-service: open pause stamped session_ended_while_paused'
    );
  }
  return count;
}

async function stampOpenPauseClosed(
  sessionId: string,
  closedAs: 'manual_resume' | 'auto_resume'
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from('consultation_recording_audit')
    .update({ pause_closed_as: closedAs })
    .eq('session_id', sessionId)
    .eq('action', 'recording_paused')
    .is('pause_closed_as', null)
    .filter('metadata->>status', 'eq', 'completed');
  if (error) {
    logger.warn(
      { sessionId, closedAs, error: error.message },
      'recording-pause-service: pause_closed_as stamp failed'
    );
  }
}

export async function scanDueAutoResumePauses(
  cutoffIso: string,
  limit: number = RECORDING_AUTO_RESUME_BATCH_CAP
): Promise<DueAutoResumePauseRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .select('id, session_id, auto_resume_at, metadata')
    .eq('action', 'recording_paused')
    .is('pause_closed_as', null)
    .not('auto_resume_at', 'is', null)
    .lte('auto_resume_at', cutoffIso)
    .filter('metadata->>status', 'eq', 'completed')
    .order('auto_resume_at', { ascending: true })
    .limit(limit);
  if (error) {
    throw new InternalError(`recording-pause-service: due-pause scan failed (${error.message})`);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    autoResumeAt: row.auto_resume_at as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
}

export async function claimPauseForAutoResume(
  rowId: string,
  claimId: string,
  cutoffIso: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data: current } = await admin
    .from('consultation_recording_audit')
    .select('metadata')
    .eq('id', rowId)
    .maybeSingle();
  const existing =
    current && typeof current.metadata === 'object' && current.metadata !== null
      ? (current.metadata as Record<string, unknown>)
      : {};
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .update({
      metadata: {
        ...existing,
        auto_resume_claim_id: claimId,
        auto_resume_claim_at: new Date().toISOString(),
      },
    })
    .eq('id', rowId)
    .is('pause_closed_as', null)
    .lte('auto_resume_at', cutoffIso)
    .filter('metadata->>auto_resume_claim_id', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new InternalError(`recording-pause-service: auto-resume claim failed (${error.message})`);
  }
  return !!data;
}

export async function clearAutoResumeClaim(rowId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const { data: current } = await admin
    .from('consultation_recording_audit')
    .select('metadata')
    .eq('id', rowId)
    .maybeSingle();
  const existing =
    current && typeof current.metadata === 'object' && current.metadata !== null
      ? { ...(current.metadata as Record<string, unknown>) }
      : {};
  delete existing.auto_resume_claim_id;
  delete existing.auto_resume_claim_at;
  const { error } = await admin
    .from('consultation_recording_audit')
    .update({ metadata: existing })
    .eq('id', rowId);
  if (error) {
    logger.warn(
      { rowId, error: error.message },
      'recording-pause-service: failed to clear auto-resume claim'
    );
  }
}

export async function releaseStaleAutoResumeClaims(staleBeforeIso: string): Promise<number> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 0;
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .select('id, metadata')
    .eq('action', 'recording_paused')
    .is('pause_closed_as', null)
    .not('metadata->>auto_resume_claim_id', 'is', null)
    .lt('metadata->>auto_resume_claim_at', staleBeforeIso)
    .limit(RECORDING_AUTO_RESUME_BATCH_CAP);
  if (error) {
    logger.warn(
      { error: error.message },
      'recording-pause-service: stale-claim scan failed'
    );
    return 0;
  }
  let released = 0;
  for (const row of data ?? []) {
    await clearAutoResumeClaim(row.id as string);
    released += 1;
  }
  return released;
}

// ============================================================================
// Public: getCurrentRecordingState
// ============================================================================

/**
 * Read-only inspector — no side effects. Used by both the doctor's
 * `<RecordingControls>` at mount time and the patient/doctor's
 * `<RecordingPausedIndicator>` to render the initial state before the
 * Realtime system-message stream takes over.
 *
 * Status resolution (matches task-28 acceptance criteria):
 *   - No row → `{ paused: false }`.
 *   - Latest `recording_paused` + status='completed' → paused.
 *   - Latest `recording_resumed` + status='completed' → not paused
 *     (returns `resumedAt`).
 *   - Latest row's status='attempted' → PREFERS the intent (Twilio
 *     call may be mid-flight; UI renders the pending intent).
 *   - Latest row's status='failed' → treats as a no-op (the prior state
 *     still applies) — the next non-failed row is the source of truth.
 *     Practically the failed row is almost always preceded by an
 *     attempted row, so we fall back through the history.
 */
export async function getCurrentRecordingState(sessionId: string): Promise<RecordingState> {
  const trimmed = sessionId?.trim();
  if (!trimmed) {
    throw new ValidationError('sessionId is required');
  }

  const latest = await fetchLatestPauseResumeRow(trimmed);
  if (!latest) {
    return { sessionId: trimmed, paused: false };
  }

  if (latest.status === 'failed') {
    // A failed row flips no state; walk back one row to see what the
    // prior definitive state was. (v1 optimisation: single fallback;
    // multi-failure chains are rare enough that we accept the edge.)
    const admin = getSupabaseAdminClient();
    if (!admin) {
      return { sessionId: trimmed, paused: false };
    }
    const { data } = await admin
      .from('consultation_recording_audit')
      .select(
        'id, action, reason, pause_reason_code, action_by, action_by_role, metadata, created_at, auto_resume_at, auto_resume_extensions_used, pause_closed_as'
      )
      .eq('session_id', trimmed)
      .in('action', ['recording_paused', 'recording_resumed'])
      .order('created_at', { ascending: false })
      .range(1, 1)
      .maybeSingle();
    if (!data) return { sessionId: trimmed, paused: false };
    const prior = mapLatestRow(
      data as Parameters<typeof mapLatestRow>[0]
    );
    const priorCompleted = prior.status === 'completed' || prior.status === 'attempted';
    if (!priorCompleted) return { sessionId: trimmed, paused: false };
    if (prior.action === 'recording_paused' && prior.pauseClosedAs == null) {
      return pausedStateFromSummary(trimmed, prior);
    }
    return {
      sessionId: trimmed,
      paused: false,
      resumedAt: prior.action === 'recording_resumed' ? prior.createdAt : undefined,
    };
  }

  // attempted OR completed — prefer intent. A closed pause is not open.
  if (latest.action === 'recording_paused' && latest.pauseClosedAs == null) {
    return pausedStateFromSummary(trimmed, latest);
  }
  return {
    sessionId: trimmed,
    paused: false,
    resumedAt: latest.createdAt,
  };
}

// ============================================================================
// Authorization helper (for the GET /recording/state route)
// ============================================================================

/**
 * Check whether a given user is a participant of a session (doctor or
 * patient). Used by `GET /recording/state` to RBAC the inspector
 * endpoint without duplicating participant-lookup logic in the route
 * handler.
 */
export async function isSessionParticipant(
  sessionId: string,
  userId: string,
  scoped?: { jwtSessionId: string; consultRole: 'patient' | 'doctor' | 'extra_participant' }
): Promise<{ isParticipant: boolean; role: 'doctor' | 'patient' | null }> {
  const session = await findSessionById(sessionId);
  if (!session) return { isParticipant: false, role: null };
  if (scoped?.consultRole === 'extra_participant') {
    return { isParticipant: false, role: null };
  }
  if (scoped?.consultRole === 'patient' && scoped.jwtSessionId === session.id) {
    return { isParticipant: true, role: 'patient' };
  }
  if (session.doctorId === userId) return { isParticipant: true, role: 'doctor' };
  if (session.patientId && session.patientId === userId) {
    return { isParticipant: true, role: 'patient' };
  }
  if (userId === session.id) {
    return { isParticipant: true, role: 'patient' };
  }
  return { isParticipant: false, role: null };
}

// ============================================================================
// Internal: doctor timezone lookup (mirrors the private helper in
// consultation-message-service.ts but we can't import that — keep a
// tiny local copy).
// ============================================================================

function pausedStateFromSummary(sessionId: string, row: LatestAuditSummary): RecordingState {
  return {
    sessionId,
    paused: true,
    pausedAt: row.createdAt,
    pausedBy: row.actionBy,
    pausedByRole: row.actionByRole === 'patient' ? 'patient' : 'doctor',
    pauseReason: resolvePauseReasonToken(row.pauseReasonCode, row.reason),
    pausedKinds: row.pausedKinds,
    autoResumeAt: row.autoResumeAt ?? undefined,
    autoResumeExtensionsUsed: row.autoResumeExtensionsUsed ?? undefined,
    autoResumeBoundMs: RECORDING_PAUSE_AUTO_RESUME_MS,
  };
}

async function loadDoctorTzForSession(sessionId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: session } = await admin
    .from('consultation_sessions')
    .select('doctor_id')
    .eq('id', sessionId)
    .maybeSingle();
  const doctorId = (session?.doctor_id as string | undefined)?.trim();
  if (!doctorId) return null;

  const { data: settings } = await admin
    .from('doctor_settings')
    .select('timezone')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  const tz = (settings?.timezone as string | undefined)?.trim();
  return tz || null;
}
