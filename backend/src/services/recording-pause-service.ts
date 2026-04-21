/**
 * Recording pause/resume service (Plan 07 · Task 28 · Decision 4 LOCKED).
 *
 * Doctor-driven mid-consult pause of the session recording. Twilio's
 * Recording Rules API is the underlying primitive — this service wraps
 * it with an audit ledger + a companion-chat system message so both
 * parties see the pause and the legal / regulatory trail is preserved.
 *
 * **Ledger pattern (double-row):**
 *   1. Validate input (reason length, doctor authz, session status).
 *   2. Write an `attempted` audit row BEFORE the Twilio call.
 *   3. Call `twilio-recording-rules.excludeAllParticipantsFromRecording`
 *      / `includeAllParticipantsInRecording`.
 *   4. On success, write a `completed` audit row (same `correlation_id`
 *      as #2). On failure, write a `failed` row + throw.
 *   5. Emit a `'recording_paused'` / `'recording_resumed'` system
 *      message (best-effort; emitSystemMessage's internal error-swallow
 *      means a failure here does not undo the pause).
 *
 * A Twilio failure or process crash between (2) and (4) leaves an
 * orphan `attempted` row. Plan 02's reconciliation worker (future
 * task) resolves these — the `idx_recording_audit_attempted` partial
 * index makes that sweep cheap.
 *
 * **Idempotency:** a second pause while already paused (or resume
 * while not paused) short-circuits without writing new rows and
 * without calling Twilio — returns a `{ skipped: true }` log line.
 * Benign concurrent taps from the same doctor collapse cleanly.
 *
 * **v1 scope:** `kind = 'audio'` only. Plan 08 Task 43 (the shared
 * Twilio Recording Rules wrapper) extends this service with `kind =
 * 'video'` when the video-escalation flow ships.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-28-recording-pause-resume-mid-consult.md
 * @see backend/src/services/twilio-recording-rules.ts (the merge-aware Twilio wrapper)
 * @see backend/src/services/consultation-message-service.ts · emitSystemMessage
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { findSessionById } from './consultation-session-service';
import {
  emitSystemMessage,
  formatTimeInDoctorTz,
} from './consultation-message-service';
import {
  excludeAllParticipantsFromRecording,
  includeAllParticipantsInRecording,
  type RecordingRuleKind,
} from './twilio-recording-rules';

// ============================================================================
// Public types
// ============================================================================

export interface PauseRecordingInput {
  sessionId:     string;
  /** Caller's user id; must match `session.doctorId`. */
  doctorId:      string;
  /** 5..200 chars after trim; empty / whitespace-only rejected. */
  reason:        string;
  correlationId: string;
}

export interface ResumeRecordingInput {
  sessionId:     string;
  doctorId:      string;
  correlationId: string;
}

export interface RecordingState {
  sessionId:     string;
  paused:        boolean;
  pausedAt?:     Date;
  /** Doctor user id of the actor who issued the pause (for the banner). */
  pausedBy?:     string;
  pauseReason?:  string;
  resumedAt?:    Date;
}

// ============================================================================
// Constants
// ============================================================================

const REASON_MIN_LENGTH = 5;
const REASON_MAX_LENGTH = 200;

/**
 * v1 scope = audio only. Plan 08's `kind: 'video'` extension reuses this
 * service — the parameter threads through as a non-default argument at
 * that point.
 */
const DEFAULT_KIND: RecordingRuleKind = 'audio';

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
  id?:              string;
  session_id:       string;
  action:           AuditAction;
  action_by:        string;
  action_by_role:   ActionByRole;
  reason:           string | null;
  metadata:         {
    twilio_sid?: string;
    kind:        RecordingRuleKind;
    status:      LedgerStatus;
    error?:      string;
  };
  correlation_id:   string | null;
  created_at?:      string;
}

async function insertAuditRow(row: Omit<AuditRow, 'id' | 'created_at'>): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-pause-service: Supabase admin client unavailable — cannot write audit row',
    );
  }
  const { error } = await admin
    .from('consultation_recording_audit')
    .insert(row as unknown as Record<string, unknown>);
  if (error) {
    throw new InternalError(
      `recording-pause-service: audit insert failed (${error.message})`,
    );
  }
}

interface LatestAuditSummary {
  action:        AuditAction;
  status:        LedgerStatus | null;
  reason:        string | null;
  actionBy:      string;
  createdAt:     Date;
  twilioSid:     string | null;
}

/**
 * Fetch the most-recent `recording_paused` / `recording_resumed` row
 * for a session. `getCurrentRecordingState` and the idempotency-check
 * path share this read so they stay consistent.
 *
 * Returns `null` if no row has ever been written for this session (the
 * "never paused" state — the default at session creation time).
 */
async function fetchLatestPauseResumeRow(sessionId: string): Promise<LatestAuditSummary | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .select('action, reason, action_by, metadata, created_at')
    .eq('session_id', sessionId)
    .in('action', ['recording_paused', 'recording_resumed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'recording-pause-service: latest audit row lookup failed',
    );
    return null;
  }
  if (!data) return null;
  const row = data as {
    action:     AuditAction;
    reason:     string | null;
    action_by:  string;
    metadata:   { status?: LedgerStatus; twilio_sid?: string } | null;
    created_at: string;
  };
  return {
    action:    row.action,
    status:    row.metadata?.status ?? null,
    reason:    row.reason,
    actionBy:  row.action_by,
    createdAt: new Date(row.created_at),
    twilioSid: row.metadata?.twilio_sid ?? null,
  };
}

// ============================================================================
// Public: pauseRecording
// ============================================================================

export async function pauseRecording(input: PauseRecordingInput): Promise<void> {
  const sessionId = input.sessionId?.trim();
  const doctorId = input.doctorId?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';
  const reasonTrimmed = (input.reason ?? '').trim();

  // 1. Input validation.
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }
  if (!doctorId) {
    throw new ValidationError('doctorId is required');
  }
  if (reasonTrimmed.length < REASON_MIN_LENGTH) {
    throw new ValidationError(
      `Reason must be at least ${REASON_MIN_LENGTH} characters`,
    );
  }
  if (reasonTrimmed.length > REASON_MAX_LENGTH) {
    throw new ValidationError(
      `Reason must be at most ${REASON_MAX_LENGTH} characters`,
    );
  }

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }
  if (session.doctorId !== doctorId) {
    throw new ForbiddenError('Only the session doctor can pause recording');
  }
  if (session.status !== 'live') {
    throw new ConflictError(
      `Cannot pause recording when session status is '${session.status}'`,
    );
  }

  const twilioSid = session.providerSessionId?.trim();
  if (!twilioSid) {
    // The rules API is scoped to a room SID — without one we can't
    // toggle anything. This should only happen for a session whose
    // adapter hasn't minted a provider id yet (e.g. Plan 04 text).
    throw new ConflictError(
      'Recording pause not available for this session (no Twilio room)',
    );
  }

  // 2. Idempotency: if already paused + completed, no-op.
  const latest = await fetchLatestPauseResumeRow(sessionId);
  if (
    latest &&
    latest.action === 'recording_paused' &&
    latest.status === 'completed'
  ) {
    logger.info(
      { correlationId, sessionId, skipped: true, reason: 'already_paused' },
      'recording-pause-service: pause skipped — already paused',
    );
    return;
  }

  // 3. Attempted audit row BEFORE the Twilio call.
  await insertAuditRow({
    session_id:     sessionId,
    action:         'recording_paused',
    action_by:      doctorId,
    action_by_role: 'doctor',
    reason:         reasonTrimmed,
    metadata:       {
      twilio_sid: twilioSid,
      kind:       DEFAULT_KIND,
      status:     'attempted',
    },
    correlation_id: correlationId,
  });

  // 4. Flip the Twilio recording rules.
  try {
    await excludeAllParticipantsFromRecording(twilioSid, DEFAULT_KIND, correlationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 5a. Failed row.
    await insertAuditRow({
      session_id:     sessionId,
      action:         'recording_paused',
      action_by:      doctorId,
      action_by_role: 'doctor',
      reason:         reasonTrimmed,
      metadata:       {
        twilio_sid: twilioSid,
        kind:       DEFAULT_KIND,
        status:     'failed',
        error:      message.slice(0, 500),
      },
      correlation_id: correlationId,
    }).catch((writeErr) => {
      logger.error(
        {
          correlationId,
          sessionId,
          error: writeErr instanceof Error ? writeErr.message : String(writeErr),
        },
        'recording-pause-service: failed-row write ALSO failed (Twilio failed first)',
      );
    });
    throw err;
  }

  // 5b. Completed row.
  await insertAuditRow({
    session_id:     sessionId,
    action:         'recording_paused',
    action_by:      doctorId,
    action_by_role: 'doctor',
    reason:         reasonTrimmed,
    metadata:       {
      twilio_sid: twilioSid,
      kind:       DEFAULT_KIND,
      status:     'completed',
    },
    correlation_id: correlationId,
  });

  // 6. Companion-chat system message (best-effort).
  try {
    const timeLabel = formatTimeInDoctorTz(
      new Date(),
      (await loadDoctorTzForSession(sessionId)) ?? undefined,
    );
    await emitSystemMessage({
      sessionId,
      event:         'recording_paused',
      body:          `Doctor paused recording at ${timeLabel}. Reason: ${reasonTrimmed}`,
      correlationId: `recording_paused:${correlationId}`,
      meta:          { reason: reasonTrimmed, byRole: 'doctor' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId, error: message },
      'recording-pause-service: emitSystemMessage (paused) failed; pause remains active',
    );
  }
}

// ============================================================================
// Public: resumeRecording
// ============================================================================

export async function resumeRecording(input: ResumeRecordingInput): Promise<void> {
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
    throw new ForbiddenError('Only the session doctor can resume recording');
  }
  if (session.status !== 'live') {
    throw new ConflictError(
      `Cannot resume recording when session status is '${session.status}'`,
    );
  }

  const twilioSid = session.providerSessionId?.trim();
  if (!twilioSid) {
    throw new ConflictError(
      'Recording resume not available for this session (no Twilio room)',
    );
  }

  const latest = await fetchLatestPauseResumeRow(sessionId);

  // Idempotency: if not currently paused (no row OR latest=resumed
  // completed), no-op.
  const currentlyPaused =
    latest &&
    latest.action === 'recording_paused' &&
    latest.status === 'completed';
  if (!currentlyPaused) {
    logger.info(
      { correlationId, sessionId, skipped: true, reason: 'not_paused' },
      'recording-pause-service: resume skipped — not currently paused',
    );
    return;
  }

  // Attempted audit row.
  await insertAuditRow({
    session_id:     sessionId,
    action:         'recording_resumed',
    action_by:      doctorId,
    action_by_role: 'doctor',
    reason:         null,
    metadata:       {
      twilio_sid: twilioSid,
      kind:       DEFAULT_KIND,
      status:     'attempted',
    },
    correlation_id: correlationId,
  });

  try {
    await includeAllParticipantsInRecording(twilioSid, DEFAULT_KIND, correlationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await insertAuditRow({
      session_id:     sessionId,
      action:         'recording_resumed',
      action_by:      doctorId,
      action_by_role: 'doctor',
      reason:         null,
      metadata:       {
        twilio_sid: twilioSid,
        kind:       DEFAULT_KIND,
        status:     'failed',
        error:      message.slice(0, 500),
      },
      correlation_id: correlationId,
    }).catch((writeErr) => {
      logger.error(
        {
          correlationId,
          sessionId,
          error: writeErr instanceof Error ? writeErr.message : String(writeErr),
        },
        'recording-pause-service: failed-row write (resume) ALSO failed',
      );
    });
    throw err;
  }

  await insertAuditRow({
    session_id:     sessionId,
    action:         'recording_resumed',
    action_by:      doctorId,
    action_by_role: 'doctor',
    reason:         null,
    metadata:       {
      twilio_sid: twilioSid,
      kind:       DEFAULT_KIND,
      status:     'completed',
    },
    correlation_id: correlationId,
  });

  try {
    const timeLabel = formatTimeInDoctorTz(
      new Date(),
      (await loadDoctorTzForSession(sessionId)) ?? undefined,
    );
    await emitSystemMessage({
      sessionId,
      event:         'recording_resumed',
      body:          `Doctor resumed recording at ${timeLabel}.`,
      correlationId: `recording_resumed:${correlationId}`,
      meta:          { byRole: 'doctor' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId, error: message },
      'recording-pause-service: emitSystemMessage (resumed) failed; resume remains active',
    );
  }
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
      .select('action, reason, action_by, metadata, created_at')
      .eq('session_id', trimmed)
      .in('action', ['recording_paused', 'recording_resumed'])
      .order('created_at', { ascending: false })
      .range(1, 1)
      .maybeSingle();
    if (!data) return { sessionId: trimmed, paused: false };
    const row = data as {
      action:     AuditAction;
      reason:     string | null;
      action_by:  string;
      metadata:   { status?: LedgerStatus } | null;
      created_at: string;
    };
    const priorCompleted =
      row.metadata?.status === 'completed' || row.metadata?.status === 'attempted';
    if (!priorCompleted) return { sessionId: trimmed, paused: false };
    if (row.action === 'recording_paused') {
      return {
        sessionId:    trimmed,
        paused:       true,
        pausedAt:     new Date(row.created_at),
        pausedBy:     row.action_by,
        pauseReason:  row.reason ?? undefined,
      };
    }
    return {
      sessionId:  trimmed,
      paused:     false,
      resumedAt:  new Date(row.created_at),
    };
  }

  // attempted OR completed — prefer intent.
  if (latest.action === 'recording_paused') {
    return {
      sessionId:   trimmed,
      paused:      true,
      pausedAt:    latest.createdAt,
      pausedBy:    latest.actionBy,
      pauseReason: latest.reason ?? undefined,
    };
  }
  return {
    sessionId:  trimmed,
    paused:     false,
    resumedAt:  latest.createdAt,
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
): Promise<{ isParticipant: boolean; role: 'doctor' | 'patient' | null }> {
  const session = await findSessionById(sessionId);
  if (!session) return { isParticipant: false, role: null };
  if (session.doctorId === userId) return { isParticipant: true, role: 'doctor' };
  if (session.patientId && session.patientId === userId) {
    return { isParticipant: true, role: 'patient' };
  }
  return { isParticipant: false, role: null };
}

// ============================================================================
// Internal: doctor timezone lookup (mirrors the private helper in
// consultation-message-service.ts but we can't import that — keep a
// tiny local copy).
// ============================================================================

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
