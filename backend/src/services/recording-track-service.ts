/**
 * Recording-track service — Twilio Video Recording Rules + artifact
 * lookup wrapper (Plan 08 · Task 43 · Decision 10 LOCKED · keystone).
 *
 * Decision 10 LOCKED the three runtime states a video consult can be
 * in:
 *
 *   1. **Audio-only (default)** — rules `include audio` / `exclude
 *      video`. Every video consult enters this state at room-create
 *      time (via `consultation-session-service.createSession`) and
 *      exits it only when a doctor-initiated escalation lands
 *      (`escalateToFullVideoRecording`). The voice modality stays here
 *      for the life of the consult.
 *   2. **Audio + video (escalated)** — rules include both audio and
 *      video. Twilio starts a new video Composition in parallel with
 *      the in-flight audio Composition the pause/resume ledger from
 *      Plan 07 · Task 28 has been maintaining.
 *   3. **Reverted to audio-only** — rules flip back. The in-flight
 *      video Composition closes at t=revert; audio continues
 *      uninterrupted. A later escalation produces a *second* video
 *      Composition, not a continuation of the first.
 *
 * This module exposes four public functions:
 *
 *   · `startAudioOnlyRecording`       — set / re-set the audio-only
 *                                       baseline.
 *   · `escalateToFullVideoRecording`  — flip to audio + video after
 *                                       doctor escalation + patient
 *                                       consent.
 *   · `revertToAudioOnlyRecording`    — flip back (doctor revert,
 *                                       patient revoke, system
 *                                       fallback).
 *   · `getRecordingArtifactsForSession` — list audio + video
 *                                       Composition metadata for a
 *                                       session's replay UI.
 *
 * **Idempotency + side-effect doctrine (matches Plan 07 · Task 28 pause
 * service).** Each mutating call is wrapped in a double-row audit
 * ledger:
 *
 *     Row 1: action = <rule_flip>, metadata.status = 'attempted'
 *     API:   await twilio-recording-rules.setRecordingRulesTo*
 *     Row 2: action = <rule_flip>, metadata.status = 'completed'
 *            OR                    metadata.status = 'failed'
 *
 * Both rows share `correlation_id` so the Plan 02 reconciliation worker
 * can sweep orphan `attempted` rows after a 5-minute SLA (same infra
 * Task 28 uses today).
 *
 * **Action mapping** (onto Plan 07 · Migration 064 ENUM + Plan 08 ·
 * Migration 071 additions):
 *
 *   | Function                     | initiatedBy          | action                       |
 *   | ---------------------------- | -------------------- | ---------------------------- |
 *   | startAudioOnlyRecording      | 'system'             | recording_started            |
 *   | startAudioOnlyRecording      | 'doctor_revert'      | video_recording_reverted     |
 *   | startAudioOnlyRecording      | 'patient_revoke'     | video_recording_reverted     |
 *   | escalateToFullVideoRecording | (always doctor)      | video_recording_started      |
 *   | revertToAudioOnlyRecording   | 'doctor'/'patient'/'system' | video_recording_reverted |
 *
 * The three `revertToAudioOnlyRecording` cases are internally routed to
 * `startAudioOnlyRecording` with the matching `initiatedBy`, so there's
 * only one ledger-write code path for the flip-to-audio-only state.
 *
 * **Deviation from Task 43 spec.** The task markdown listed six new
 * ENUM values (`_attempted` / `_completed` / `_failed` per flip). That
 * collides with Migration 064's existing double-row pattern which puts
 * the status in `metadata.status` rather than the action name — the
 * pause-service read path (`fetchLatestPauseResumeRow`) filters by
 * action, not by status-in-action-name. We go with Migration 064's
 * pattern (two new ENUM values + status in metadata) for consistency;
 * see migration 071 header comment for the full rationale.
 *
 * **Action-specific row writes are NOT this module's job.** Patient
 * revoke (action = `patient_revoked_video_mid_session`, Task 42) and
 * doctor escalation-request (`video_escalation_audit` table via Task
 * 41) write their intent-level rows in their own service modules.
 * This module only writes the Twilio-rule-flip level. Composing both
 * at the caller keeps each service auditable on its own.
 *
 * **Cache.** `getRecordingArtifactsForSession` memoises Twilio's
 * `listCompositionsForRoom` result per-session for 60 s in process
 * memory. Escalate/revert bust the cache explicitly so the replay
 * player can't see stale data after the doctor just rolled the rules.
 * Cross-pod consistency is out of scope (see Task 43 Notes #11).
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-43-recording-track-service-twilio-rules-wrapper.md
 * @see backend/src/services/twilio-recording-rules.ts           (shared adapter)
 * @see backend/src/services/twilio-compositions.ts              (listCompositionsForRoom)
 * @see backend/src/services/recording-pause-service.ts          (sibling ledger writer — pause/resume)
 * @see backend/migrations/064_consultation_recording_audit.sql  (base ledger table)
 * @see backend/migrations/071_recording_audit_action_video_values.sql (Task 43's ENUM widen)
 */

import { randomUUID } from 'crypto';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { findSessionById } from './consultation-session-service';
import {
  listCompositionsForRoom,
  type RoomCompositionSummary,
} from './twilio-compositions';
import {
  setRecordingRulesToAudioAndVideo,
  setRecordingRulesToAudioOnly,
  TwilioRoomNotFoundError,
} from './twilio-recording-rules';

// ============================================================================
// Public types
// ============================================================================

export type StartInitiatedBy = 'system' | 'doctor_revert' | 'patient_revoke';
export type RevertInitiatedBy = 'doctor' | 'patient' | 'system';
export type RevertReason = 'doctor_paused' | 'patient_revoked' | 'system_error_fallback';

export interface StartAudioOnlyRecordingInput {
  sessionId:      string;
  roomSid:        string;
  initiatedBy:    StartInitiatedBy;
  correlationId?: string;
}

export interface StartAudioOnlyRecordingResult {
  correlationId: string;
}

export interface EscalateToFullVideoRecordingInput {
  sessionId:             string;
  roomSid:               string;
  /** Doctor user id of the clinician who triggered the escalation. */
  doctorId:              string;
  /**
   * FK to `video_escalation_audit.id` (Plan 08 · Task 45) pinpointing
   * the request-consent-response cycle this rule-flip resolves. Stored
   * in the ledger's metadata for cross-table joins.
   */
  escalationRequestId:   string;
  correlationId?:        string;
}

export interface EscalateToFullVideoRecordingResult {
  correlationId:         string;
  /**
   * Server-side wall-clock when the audio+video rule-set landed on
   * Twilio. Used by the composition-naming convention
   * `consult_{session_id}_video_{ISO_8601}.mp4` (plan open question #5).
   */
  escalationStartedAt:   Date;
}

export interface RevertToAudioOnlyRecordingInput {
  sessionId:      string;
  roomSid:        string;
  reason:         RevertReason;
  initiatedBy:    RevertInitiatedBy;
  correlationId?: string;
}

export interface RevertToAudioOnlyRecordingResult {
  correlationId: string;
}

/**
 * Replay-surface friendly view of a single Composition attached to a
 * session's room. The split into `audioCompositions` /
 * `videoCompositions` lives in the return type of
 * `getRecordingArtifactsForSession` so Task 44's replay player can
 * render them as two separate tabs without re-splitting client-side.
 */
export interface ArtifactRef {
  compositionSid:   string;
  kind:             'audio' | 'video';
  startedAt:        Date;
  endedAt:          Date | null;
  durationSeconds:  number | null;
  status:           RoomCompositionSummary['status'];
}

export interface GetRecordingArtifactsForSessionInput {
  sessionId: string;
}

export interface GetRecordingArtifactsForSessionResult {
  audioCompositions: ArtifactRef[];
  videoCompositions: ArtifactRef[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * The all-zeros UUID matches `consultation-message-service.SYSTEM_SENDER_ID`
 * and Migration 064's header convention: "For action_by_role='system',
 * use the all-zeros UUID". Keeping the constant local avoids a cross-
 * service import for a five-byte constant.
 */
const SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';

const ARTIFACT_CACHE_TTL_MS = 60_000;

// ============================================================================
// Ledger helpers
// ============================================================================

type AuditAction =
  | 'recording_started'
  | 'video_recording_started'
  | 'video_recording_reverted';

type ActionByRole = 'doctor' | 'patient' | 'system' | 'support_staff';

type LedgerStatus = 'attempted' | 'completed' | 'failed';

interface LedgerMetadata {
  twilio_sid:              string;
  kind:                    'audio' | 'video';
  status:                  LedgerStatus;
  error?:                  string;
  initiated_by?:           string;
  escalation_request_id?:  string;
  doctor_id?:              string;
  reason?:                 string;
}

interface AuditRow {
  session_id:       string;
  action:           AuditAction;
  action_by:        string;
  action_by_role:   ActionByRole;
  reason:           string | null;
  metadata:         LedgerMetadata;
  correlation_id:   string | null;
}

async function insertAuditRow(row: AuditRow): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-track-service: Supabase admin client unavailable — cannot write audit row',
    );
  }
  const { error } = await admin
    .from('consultation_recording_audit')
    .insert(row as unknown as Record<string, unknown>);
  if (error) {
    throw new InternalError(
      `recording-track-service: audit insert failed (${error.message})`,
    );
  }
}

/**
 * Write a matching `failed` row in a best-effort fashion — if the
 * audit write itself fails on top of the Twilio failure we log + swallow
 * so the original Twilio error bubbles up (we'd rather surface the
 * primary failure than mask it with a secondary one).
 */
async function tryInsertFailedRow(
  row: AuditRow,
  correlationId: string,
): Promise<void> {
  try {
    await insertAuditRow(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, sessionId: row.session_id, error: message },
      'recording-track-service: failed-row write ALSO failed (primary Twilio error will bubble up)',
    );
  }
}

interface ResolvedActor {
  actionBy:     string;
  actionByRole: ActionByRole;
}

/**
 * Resolve the `(action_by, action_by_role)` pair for a revert /
 * start-audio-only call given only the initiatedBy tag. System actions
 * use the all-zeros UUID; doctor/patient actions look up the session
 * once and use the stored doctorId/patientId. If a patient-initiated
 * revert arrives on a session with a null patientId (anonymous patient
 * / pre-KYC flow), we fall back to 'system' + all-zeros and log a
 * warning — patient-initiated revokes should not happen on anonymous
 * sessions but the fallback keeps the audit row well-formed rather than
 * throwing.
 */
async function resolveActor(
  sessionId: string,
  initiatedBy: StartInitiatedBy | RevertInitiatedBy,
  correlationId: string,
): Promise<ResolvedActor> {
  if (initiatedBy === 'system') {
    return { actionBy: SYSTEM_ACTOR_UUID, actionByRole: 'system' };
  }

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  if (initiatedBy === 'doctor' || initiatedBy === 'doctor_revert') {
    return { actionBy: session.doctorId, actionByRole: 'doctor' };
  }

  // initiatedBy === 'patient' || 'patient_revoke'
  const patientId = session.patientId?.trim();
  if (!patientId) {
    logger.warn(
      { correlationId, sessionId, initiatedBy },
      'recording-track-service: patient-initiated flip on session with null patientId — falling back to system actor',
    );
    return { actionBy: SYSTEM_ACTOR_UUID, actionByRole: 'system' };
  }
  return { actionBy: patientId, actionByRole: 'patient' };
}

function mapStartInitiatedByToAction(initiatedBy: StartInitiatedBy): AuditAction {
  if (initiatedBy === 'system') return 'recording_started';
  return 'video_recording_reverted';
}

// ============================================================================
// Public: startAudioOnlyRecording
// ============================================================================

/**
 * Set / re-set the Twilio Recording Rules for `roomSid` to the
 * canonical audio-only shape.
 *
 * **Called from three sites** (all idempotent; adapter short-circuits
 * on already-audio-only):
 *   1. `consultation-session-service.createSession` for fresh video
 *      consults (`initiatedBy: 'system'`).
 *   2. `revertToAudioOnlyRecording` internally (`initiatedBy: 'doctor_revert' | 'patient_revoke'`).
 *
 * **Out of scope (v1):** Plan 07 · Task 28's `resumeRecording` does NOT
 * call this function. Resume is kind-scoped ("flip audio back on")
 * while this is mode-scoped ("flip both kinds to the audio-only
 * tuple"). Mixing them would overwrite the video state on every resume
 * — not what the pause ledger wants. The task-43 doc's enumeration of
 * three call sites is corrected here; see the implementation log.
 *
 * @throws ValidationError on missing sessionId / roomSid.
 * @throws NotFoundError when sessionId does not resolve to a session
 *         (actor-resolution path only — system calls skip this).
 * @throws TwilioRoomNotFoundError when Twilio's rules endpoint returns
 *         404. The attempted row is written; a failed row is written
 *         with `error` metadata; the error rethrows.
 * @throws InternalError on any other Twilio or DB failure (ledger
 *         failure propagates).
 */
export async function startAudioOnlyRecording(
  input: StartAudioOnlyRecordingInput,
): Promise<StartAudioOnlyRecordingResult> {
  const sessionId = input.sessionId?.trim();
  const roomSid = input.roomSid?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }
  if (!roomSid) {
    throw new ValidationError('roomSid is required');
  }

  const action = mapStartInitiatedByToAction(input.initiatedBy);
  const actor = await resolveActor(sessionId, input.initiatedBy, correlationId);

  const baseMetadata: LedgerMetadata = {
    twilio_sid:   roomSid,
    kind:         'audio',
    status:       'attempted',
    initiated_by: input.initiatedBy,
  };

  await insertAuditRow({
    session_id:     sessionId,
    action,
    action_by:      actor.actionBy,
    action_by_role: actor.actionByRole,
    reason:         null,
    metadata:       baseMetadata,
    correlation_id: correlationId,
  });

  try {
    await setRecordingRulesToAudioOnly(roomSid, correlationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await tryInsertFailedRow(
      {
        session_id:     sessionId,
        action,
        action_by:      actor.actionBy,
        action_by_role: actor.actionByRole,
        reason:         null,
        metadata:       {
          ...baseMetadata,
          status: 'failed',
          error:  message.slice(0, 500),
        },
        correlation_id: correlationId,
      },
      correlationId,
    );
    if (err instanceof TwilioRoomNotFoundError) {
      logger.error(
        { correlationId, sessionId, roomSid, error: message },
        'recording-track-service: startAudioOnlyRecording — Twilio room not found',
      );
    } else {
      logger.error(
        { correlationId, sessionId, roomSid, error: message },
        'recording-track-service: startAudioOnlyRecording FAILED (alarm)',
      );
    }
    throw err;
  }

  await insertAuditRow({
    session_id:     sessionId,
    action,
    action_by:      actor.actionBy,
    action_by_role: actor.actionByRole,
    reason:         null,
    metadata:       {
      ...baseMetadata,
      status: 'completed',
    },
    correlation_id: correlationId,
  });

  // Cache-bust: the audio-only flip changes the composition set the
  // replay surface reads. Next getRecordingArtifactsForSession call
  // must re-fetch from Twilio.
  bustArtifactCache(sessionId);

  logger.info(
    { correlationId, sessionId, roomSid, initiatedBy: input.initiatedBy, action },
    'recording-track-service: startAudioOnlyRecording completed',
  );
  return { correlationId };
}

// ============================================================================
// Public: escalateToFullVideoRecording
// ============================================================================

/**
 * Flip the Recording Rules to include both audio and video. Triggers a
 * new video Composition in parallel with the ongoing audio Composition
 * that Plan 07 · Task 28's pause/resume ledger has been maintaining.
 *
 * Does NOT write the patient-consent / doctor-request intent rows —
 * those live in `video_escalation_audit` (Task 45) and are the caller's
 * (Task 41) responsibility. This function only writes the Twilio-
 * rule-flip ledger to `consultation_recording_audit`.
 *
 * Adapter failures rethrow after a `failed` ledger row is written.
 * Task 41's `patientResponseToEscalation` catches the throw, retries
 * once after 500 ms (per Task 43 acceptance line 165), and on second
 * failure surfaces a `video_recording_failed_to_start` system message.
 *
 * @throws ValidationError on missing inputs.
 * @throws TwilioRoomNotFoundError when Twilio's rules endpoint returns
 *         404.
 * @throws InternalError on other Twilio / ledger failures.
 */
export async function escalateToFullVideoRecording(
  input: EscalateToFullVideoRecordingInput,
): Promise<EscalateToFullVideoRecordingResult> {
  const sessionId = input.sessionId?.trim();
  const roomSid = input.roomSid?.trim();
  const doctorId = input.doctorId?.trim();
  const escalationRequestId = input.escalationRequestId?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!roomSid) throw new ValidationError('roomSid is required');
  if (!doctorId) throw new ValidationError('doctorId is required');
  if (!escalationRequestId) {
    throw new ValidationError('escalationRequestId is required');
  }

  const baseMetadata: LedgerMetadata = {
    twilio_sid:             roomSid,
    kind:                   'video',
    status:                 'attempted',
    initiated_by:           'doctor',
    escalation_request_id:  escalationRequestId,
    doctor_id:              doctorId,
  };

  await insertAuditRow({
    session_id:     sessionId,
    action:         'video_recording_started',
    action_by:      doctorId,
    action_by_role: 'doctor',
    reason:         null,
    metadata:       baseMetadata,
    correlation_id: correlationId,
  });

  const escalationStartedAt = new Date();
  try {
    await setRecordingRulesToAudioAndVideo(roomSid, correlationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await tryInsertFailedRow(
      {
        session_id:     sessionId,
        action:         'video_recording_started',
        action_by:      doctorId,
        action_by_role: 'doctor',
        reason:         null,
        metadata:       {
          ...baseMetadata,
          status: 'failed',
          error:  message.slice(0, 500),
        },
        correlation_id: correlationId,
      },
      correlationId,
    );
    logger.error(
      {
        correlationId,
        sessionId,
        roomSid,
        doctorId,
        escalationRequestId,
        error: message,
        severity: 'critical',
      },
      'recording-track-service: escalateToFullVideoRecording FAILED (alarm — mismatched rule risk)',
    );
    throw err;
  }

  await insertAuditRow({
    session_id:     sessionId,
    action:         'video_recording_started',
    action_by:      doctorId,
    action_by_role: 'doctor',
    reason:         null,
    metadata:       {
      ...baseMetadata,
      status: 'completed',
    },
    correlation_id: correlationId,
  });

  bustArtifactCache(sessionId);

  logger.info(
    {
      correlationId,
      sessionId,
      roomSid,
      doctorId,
      escalationRequestId,
      escalationStartedAt: escalationStartedAt.toISOString(),
    },
    'recording-track-service: escalateToFullVideoRecording completed',
  );
  return { correlationId, escalationStartedAt };
}

// ============================================================================
// Public: revertToAudioOnlyRecording
// ============================================================================

/**
 * Flip the Recording Rules back to audio-only after an escalation. The
 * in-flight video Composition closes; the audio Composition continues.
 * A subsequent escalation within the same consult produces a *second*
 * video Composition (Task 43 Notes #8).
 *
 * Composed internally as `startAudioOnlyRecording` with the appropriate
 * `initiatedBy` remapping — the rule-flip ledger action is
 * `video_recording_reverted` (not `recording_started`) because
 * "reverting after an escalation" is semantically distinct from the
 * baseline establishment at session-create.
 *
 * Reason-specific intent rows (e.g. `patient_revoked_video_mid_session`
 * when reason='patient_revoked') are NOT written here — the caller
 * (Task 42's patient-revoke service / Task 40's doctor-revert
 * controller / Task 41's system-fallback path) owns that write. Keeping
 * it out lets this function stay a pure rule-flip primitive.
 */
export async function revertToAudioOnlyRecording(
  input: RevertToAudioOnlyRecordingInput,
): Promise<RevertToAudioOnlyRecordingResult> {
  const sessionId = input.sessionId?.trim();
  const roomSid = input.roomSid?.trim();
  const correlationId = input.correlationId?.trim() || randomUUID();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!roomSid) throw new ValidationError('roomSid is required');

  if (
    input.reason !== 'doctor_paused' &&
    input.reason !== 'patient_revoked' &&
    input.reason !== 'system_error_fallback'
  ) {
    throw new ValidationError(`Unknown revert reason: ${String(input.reason)}`);
  }
  if (
    input.initiatedBy !== 'doctor' &&
    input.initiatedBy !== 'patient' &&
    input.initiatedBy !== 'system'
  ) {
    throw new ValidationError(`Unknown revert initiatedBy: ${String(input.initiatedBy)}`);
  }

  const action: AuditAction = 'video_recording_reverted';
  const actor = await resolveActor(sessionId, input.initiatedBy, correlationId);

  const baseMetadata: LedgerMetadata = {
    twilio_sid:   roomSid,
    kind:         'video',
    status:       'attempted',
    initiated_by: input.initiatedBy,
    reason:       input.reason,
  };

  await insertAuditRow({
    session_id:     sessionId,
    action,
    action_by:      actor.actionBy,
    action_by_role: actor.actionByRole,
    reason:         null,
    metadata:       baseMetadata,
    correlation_id: correlationId,
  });

  try {
    await setRecordingRulesToAudioOnly(roomSid, correlationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await tryInsertFailedRow(
      {
        session_id:     sessionId,
        action,
        action_by:      actor.actionBy,
        action_by_role: actor.actionByRole,
        reason:         null,
        metadata:       {
          ...baseMetadata,
          status: 'failed',
          error:  message.slice(0, 500),
        },
        correlation_id: correlationId,
      },
      correlationId,
    );
    logger.error(
      {
        correlationId,
        sessionId,
        roomSid,
        reason: input.reason,
        initiatedBy: input.initiatedBy,
        error: message,
        severity: 'critical',
      },
      'recording-track-service: revertToAudioOnlyRecording FAILED (alarm — mismatched rule risk)',
    );
    throw err;
  }

  await insertAuditRow({
    session_id:     sessionId,
    action,
    action_by:      actor.actionBy,
    action_by_role: actor.actionByRole,
    reason:         null,
    metadata:       {
      ...baseMetadata,
      status: 'completed',
    },
    correlation_id: correlationId,
  });

  bustArtifactCache(sessionId);

  logger.info(
    {
      correlationId,
      sessionId,
      roomSid,
      reason: input.reason,
      initiatedBy: input.initiatedBy,
    },
    'recording-track-service: revertToAudioOnlyRecording completed',
  );
  return { correlationId };
}

// ============================================================================
// Public: getRecordingArtifactsForSession
// ============================================================================

interface ArtifactCacheEntry {
  cachedAt:          number;
  audioCompositions: ArtifactRef[];
  videoCompositions: ArtifactRef[];
}

const artifactCache: Map<string, ArtifactCacheEntry> = new Map();

function bustArtifactCache(sessionId: string): void {
  artifactCache.delete(sessionId);
}

/**
 * Test hook — clear the per-process artifact cache. Exported only for
 * the recording-track-service unit test; no production call site.
 */
export function __resetArtifactCacheForTests(): void {
  artifactCache.clear();
}

function toArtifactRef(summary: RoomCompositionSummary, kind: 'audio' | 'video'): ArtifactRef {
  return {
    compositionSid:  summary.compositionSid,
    kind,
    startedAt:       summary.startedAt,
    endedAt:         summary.endedAt,
    durationSeconds: summary.durationSeconds,
    status:          summary.status,
  };
}

/**
 * List the audio + video Compositions attached to the Twilio room that
 * backs a given session. Used by Task 44's replay player (video
 * escalation toggle UI) and Task 32's transcript export.
 *
 * **Caching:** 60-second in-memory cache per sessionId, busted on any
 * rule-flip (start/escalate/revert) from this module. Cross-pod
 * consistency is not provided — each pod maintains its own Map. The
 * replay player re-fetches on navigation, and the cache-bust hooks
 * fire locally only. See Task 43 Notes #11.
 *
 * **Session-not-found:** returns empty lists rather than throwing — a
 * text-modality session or a session whose Twilio room never minted
 * will have no compositions to surface. Callers that want a hard fail
 * can compare `audioCompositions.length + videoCompositions.length ===
 * 0` and show a "no recording available" affordance.
 *
 * @throws InternalError on Twilio list failure. (Session lookup failure
 *         → empty lists + warn log.)
 */
export async function getRecordingArtifactsForSession(
  input: GetRecordingArtifactsForSessionInput,
): Promise<GetRecordingArtifactsForSessionResult> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }

  const cached = artifactCache.get(sessionId);
  if (cached && Date.now() - cached.cachedAt < ARTIFACT_CACHE_TTL_MS) {
    return {
      audioCompositions: cached.audioCompositions,
      videoCompositions: cached.videoCompositions,
    };
  }

  const session = await findSessionById(sessionId);
  if (!session) {
    logger.warn(
      { sessionId },
      'recording-track-service: getRecordingArtifactsForSession — session not found',
    );
    return { audioCompositions: [], videoCompositions: [] };
  }

  const roomSid = session.providerSessionId?.trim();
  if (!roomSid) {
    return { audioCompositions: [], videoCompositions: [] };
  }

  const rows = await listCompositionsForRoom(roomSid);
  const audioCompositions: ArtifactRef[] = [];
  const videoCompositions: ArtifactRef[] = [];
  for (const summary of rows) {
    // A Composition with `includeVideo=true` is a video-mode artifact
    // (it may ALSO include audio, but for the replay-surface split we
    // bucket it by video-ness). Audio-only compositions go into the
    // audio bucket. Compositions with neither flag — should never
    // happen in practice but we defensively drop them rather than
    // double-bucket.
    if (summary.includeVideo) {
      videoCompositions.push(toArtifactRef(summary, 'video'));
    } else if (summary.includeAudio) {
      audioCompositions.push(toArtifactRef(summary, 'audio'));
    }
  }

  const sortByStartedAtAsc = (a: ArtifactRef, b: ArtifactRef): number =>
    a.startedAt.getTime() - b.startedAt.getTime();
  audioCompositions.sort(sortByStartedAtAsc);
  videoCompositions.sort(sortByStartedAtAsc);

  artifactCache.set(sessionId, {
    cachedAt: Date.now(),
    audioCompositions,
    videoCompositions,
  });

  return { audioCompositions, videoCompositions };
}
