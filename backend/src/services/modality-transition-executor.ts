/**
 * Modality Transition Executor (Plan 09 · Task 48)
 *
 * Thin, stateless, DB-free module that `modality-change-service.ts`
 * (Task 47) invokes inside its commit transaction to actually flip the
 * underlying provider. Owns the 6 transition cells:
 *
 *                 | → text                         | → voice                                  | → video
 *   text →        | same-modality (NoOp)           | new Twilio audio-only room (new SID)     | new Twilio video room (new SID)
 *   voice →       | disconnect Twilio room         | same-modality (NoOp)                      | reuse room; `escalateToFullVideoRecording`
 *   video →       | revert + disconnect Twilio     | reuse room; `revertToAudioOnlyRecording`  | same-modality (NoOp)
 *
 * **Decision 2 payoff.** Voice↔video transitions never re-provision a
 * Twilio room — they're literally a Recording Rules PATCH via Plan 08
 * Task 43's `recording-track-service.ts` wrapper. The expensive path is
 * text→voice/video (Twilio room creation + 2 fresh access tokens).
 *
 * **Companion chat continuity invariant.** No branch ever touches the
 * Supabase Realtime companion chat. Plan 06 Task 36 keyed it by
 * `consultation_session_id` (not by `provider_session_id`), so it
 * survives every transition by design. See Notes #6 on the task doc.
 *
 * **What this module does NOT do** (fail-loud if someone tries):
 *   · No DB writes — Task 47 owns the transaction.
 *   · No system messages — Task 53 / Task 47 own them.
 *   · No retries — single-attempt; Task 47 & Task 49 own retry policy.
 *   · No companion chat re-provisioning — it's session-scoped.
 *
 * **Rollback doctrine.** On `text → voice` / `text → video`, if Twilio
 * room creation succeeded but a downstream step (e.g. access-token mint)
 * throws, the catch block best-effort closes the orphan room via
 * `completeTwilioRoom`. The `voice/video → text` branch has an inherent
 * rollback limitation (Twilio `room.update({ status: 'completed' })` is
 * one-way); logged at critical severity when detected upstream. See the
 * task doc's Notes #5.
 *
 * **Idempotency is the caller's responsibility.** Task 47 holds the
 * single-writer invariant via the counter `UPDATE ... WHERE counter = 0`
 * predicate; two concurrent `executeTransition` calls on the same
 * session cannot both commit.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-48-modality-transition-executor.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-47-request-modality-change-state-machine.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-09-mid-consult-modality-switching.md
 * @see COMPLIANCE.md — no PHI in logs (only opaque ids + enums)
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';
import type {
  Modality,
  Provider,
  SessionRecord,
} from '../types/consultation-session';
import {
  completeTwilioRoom,
  videoSessionTwilioAdapter,
} from './video-session-twilio';
import { voiceSessionTwilioAdapter } from './voice-session-twilio';
import {
  escalateToFullVideoRecording,
  revertToAudioOnlyRecording,
} from './recording-track-service';

// ============================================================================
// Public interface — stable contract between Task 47 (caller) + Task 48 (impl).
// ============================================================================

/**
 * Executor input. State machine supplies the session row (already loaded
 * + counter-guarded), the target modality, and a correlation id threaded
 * through the whole transition flow.
 */
export interface ExecuteTransitionInput {
  /** Loaded + counter-guarded session row. Includes current provider state. */
  session: SessionRecord;
  /** Target modality. State machine guarantees `toModality !== session.modality`. */
  toModality: Modality;
  /** Threaded through Twilio API logs + structured service logs. */
  correlationId: string;
  /** Optional doctor-supplied reason — passed into recording-rule metadata. */
  reason?: string;
  /**
   * Who initiated the transition. Routed to Plan 08 Task 43's
   * `revertToAudioOnlyRecording` as the `reason` (one of
   * `'doctor_paused'` / `'patient_revoked'` / `'system_error_fallback'`)
   * — this executor maps `initiatedBy` onto the Plan 08 reason space.
   * Optional because Task 47's current call-site doesn't thread it yet
   * (see the inbox follow-up); default is `'doctor_paused'` for
   * doctor-initiated and `'patient_revoked'` for patient-initiated
   * transitions on the revert path.
   */
  initiatedBy?: 'patient' | 'doctor';
}

/**
 * Executor output. `newProviderSessionId` is `null` on the `voice/video
 * → text` branch to signal "clear the DB column + flip `provider` to
 * `supabase_realtime`"; the state machine's commit UPDATE reads the
 * discriminator `newProvider` to decide whether to also PATCH the
 * `provider` column.
 */
export interface ExecuteTransitionResult {
  /**
   * Provider session id to stamp onto `consultation_sessions
   * .provider_session_id`:
   *   · `text → voice/video`: freshly created Twilio Room SID.
   *   · `voice ↔ video`:      unchanged SID (returned for caller
   *                           convenience so the commit UPDATE is
   *                           structurally identical across branches).
   *   · `voice/video → text`: `null` — signals the state machine to
   *                           clear the column in the UPDATE payload.
   */
  newProviderSessionId: string | null;
  /**
   * Provider to stamp onto `consultation_sessions.provider`. Only set
   * on branches that cross the Twilio↔Supabase boundary (all four
   * text-touching branches). Undefined for voice↔video (same Twilio
   * room).
   */
  newProvider?: Provider;
  /**
   * Optional replay-surface pointer mirrored from Plan 08 Task 43's
   * composition-label conventions. Currently a structured hint only —
   * Task 44's replay player reads compositions from Plan 08's audit
   * ledger, not from this field. Kept for forward-compat with Task 53
   * (which could stamp it onto the system-message metadata) and for
   * observability.
   */
  recordingSegmentRef?: {
    kind:             'audio_started' | 'video_started' | 'video_ended' | 'audio_ended';
    compositionLabel: string;
    startedAt?:       Date;
    endedAt?:         Date;
  };
  /**
   * Legacy single-string artifact ref kept for backwards-compat with
   * Task 47's stub call-site. Derived from
   * `recordingSegmentRef.compositionLabel` when the former is set.
   * Remove once Task 47 is refactored to read the richer field
   * directly.
   */
  recordingArtifactRef?: string;
  /**
   * Doctor's fresh Twilio access token for the newly-created room.
   * Populated ONLY on `text → voice` / `text → video` branches. Task
   * 47 surfaces this in the HTTP response; Task 51's modality-change
   * launcher uses it to swap the doctor's live connection. Undefined
   * on all other branches.
   */
  newAccessToken?: string;
  /**
   * Patient's fresh Twilio access token. Same branches as
   * `newAccessToken`. Task 47 rebroadcasts this over the
   * `consultation-sessions:{id}:modality-change` Realtime channel so
   * the patient's `<TextConsultRoom>` can swap-mount to
   * `<VoiceConsultRoom>` / `<VideoRoom>`.
   */
  newPatientAccessToken?: string;
  /**
   * Wall-clock from entry to provider-confirmation. Task 47 logs this
   * and feeds the `modality_change_transition_latency_ms{transition}`
   * histogram (tracked in the observability follow-up in capture/
   * inbox.md).
   *
   * SLO targets (task doc):
   *   voice↔video:         p95 <  500ms
   *   text → voice/video:  p95 < 3000ms
   *   voice/video → text:  p95 < 1500ms
   */
  transitionLatencyMs: number;
}

/**
 * Executor contract. Task 48's live implementation is injectable via
 * `setModalityTransitionExecutorForTests()` so unit tests can stub it
 * without a live Twilio client.
 */
export interface ModalityTransitionExecutor {
  executeTransition(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult>;
}

// ============================================================================
// Typed errors — callers can `instanceof`-branch for clearer failure modes.
// ============================================================================

/**
 * Thrown when the dispatcher receives `fromModality === toModality`.
 * Defence-in-depth: Task 47 Step 5 already filters these out, but we
 * prefer fail-loud over silent-success if an upstream bug ever leaks
 * a no-op through.
 */
export class NoOpTransitionError extends Error {
  public readonly name = 'NoOpTransitionError';
  public readonly code = 'NO_OP_TRANSITION';
  public readonly modality: Modality;
  public readonly correlationId: string;

  constructor(modality: Modality, correlationId: string) {
    super(
      `modality-transition-executor: same-modality transition rejected (from=${modality} to=${modality}). ` +
        'This is a bug — Task 47 should have short-circuited before reaching the executor.',
    );
    this.modality = modality;
    this.correlationId = correlationId;
  }
}

/**
 * Thrown when an access-token mint fails in the text→voice/video path
 * after a Twilio room has already been created. The executor's catch
 * block closes the orphan room before re-throwing so the caller sees
 * a clean "no room left behind" failure.
 */
export class AccessTokenMintError extends Error {
  public readonly name = 'AccessTokenMintError';
  public readonly code = 'ACCESS_TOKEN_MINT_FAILED';
  public readonly role: 'doctor' | 'patient';
  public readonly correlationId: string;

  constructor(role: 'doctor' | 'patient', correlationId: string, cause?: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : 'unknown';
    super(
      `modality-transition-executor: ${role} access-token mint failed during room swap: ${causeMsg}`,
    );
    this.role = role;
    this.correlationId = correlationId;
  }
}

// ============================================================================
// Per-branch helpers.
// ============================================================================

/**
 * Minimum shape the voice / video adapters need for `createSession`.
 * Mid-consult, we don't have access to the appointment's
 * `scheduled_start_at` / `expected_end_at` through the state-machine's
 * `SessionRecord` — the adapter only consumes `appointmentId` for the
 * Twilio room name (`appointment-{id}`), so passing "now" for the
 * timing fields is safe. Kept explicit so a future adapter that
 * actually reads these fields fails loudly rather than silently
 * produces bad data.
 */
function buildCreateSessionInput(session: SessionRecord, toModality: Modality): {
  appointmentId:     string;
  doctorId:          string;
  patientId:         string | null;
  modality:          Modality;
  scheduledStartAt:  Date;
  expectedEndAt:     Date;
} {
  return {
    appointmentId:    session.appointmentId,
    doctorId:         session.doctorId,
    patientId:        session.patientId,
    modality:         toModality,
    scheduledStartAt: session.scheduledStartAt,
    expectedEndAt:    session.expectedEndAt,
  };
}

/**
 * Mint both doctor + patient Twilio Video access tokens for a newly
 * provisioned room. Throws `AccessTokenMintError` tagged with the role
 * that failed — the caller's catch block uses this to close the
 * orphan room.
 */
async function mintPartyTokens(
  session: SessionRecord,
  providerSessionId: string,
  toModality: Modality,
  correlationId: string,
): Promise<{ doctorToken: string; patientToken: string }> {
  const adapter = toModality === 'voice' ? voiceSessionTwilioAdapter : videoSessionTwilioAdapter;

  let doctorToken: string;
  try {
    const t = await adapter.getJoinToken(
      {
        appointmentId:     session.appointmentId,
        doctorId:          session.doctorId,
        role:              'doctor',
        providerSessionId,
        sessionId:         session.id,
      },
      correlationId,
    );
    doctorToken = t.token;
  } catch (err) {
    throw new AccessTokenMintError('doctor', correlationId, err);
  }

  let patientToken: string;
  try {
    const t = await adapter.getJoinToken(
      {
        appointmentId:     session.appointmentId,
        doctorId:          session.doctorId,
        role:              'patient',
        providerSessionId,
        sessionId:         session.id,
      },
      correlationId,
    );
    patientToken = t.token;
  } catch (err) {
    throw new AccessTokenMintError('patient', correlationId, err);
  }

  return { doctorToken, patientToken };
}

/**
 * Build the `consult_{session_id}_{kind}_{ISO}` composition label used
 * across Plan 07 / 08 / 09 for replay-surface correlation. Kept in one
 * place so the ISO-timestamp format stays consistent.
 */
function compositionLabel(sessionId: string, kind: 'audio' | 'video', at: Date): string {
  return `consult_${sessionId}_${kind}_${at.toISOString()}`;
}

/**
 * Map `initiatedBy` onto Plan 08 Task 43's `RevertReason` space.
 * `doctor` initiation → `'doctor_paused'`; `patient` initiation →
 * `'patient_revoked'`; unset defaults to `'doctor_paused'` for v1 (the
 * common case — Plan 09 patient-initiated downgrade is immediate and
 * doesn't thread `initiatedBy` through yet; follow-up in inbox.md).
 */
function revertReasonFromInitiator(
  initiatedBy: 'patient' | 'doctor' | undefined,
): 'doctor_paused' | 'patient_revoked' {
  return initiatedBy === 'patient' ? 'patient_revoked' : 'doctor_paused';
}

/**
 * Map `initiatedBy` onto Plan 08's `RevertInitiatedBy` space. Same
 * semantics as above. The executor default matches Task 47's current
 * call-site (which doesn't thread `initiatedBy` yet).
 */
function revertInitiatedBy(
  initiatedBy: 'patient' | 'doctor' | undefined,
): 'patient' | 'doctor' | 'system' {
  return initiatedBy ?? 'doctor';
}

// ============================================================================
// Six branch handlers — dispatched on `(fromModality, toModality)`.
// ============================================================================

/**
 * `text → voice`. Provision a brand-new Twilio Video room in audio-
 * only mode (voice adapter delegates to video adapter's
 * `createSession` + applies audio-only Recording Rules) and mint
 * doctor+patient access tokens. On any post-creation failure, best-
 * effort close the orphan room.
 */
async function executeTextToVoice(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult> {
  const startedAt = Date.now();
  const created = await voiceSessionTwilioAdapter.createSession(
    buildCreateSessionInput(input.session, 'voice'),
    input.correlationId,
  );

  const newSid = created.providerSessionId;
  if (!newSid) {
    throw new InternalError(
      'modality-transition-executor: text→voice — voice adapter returned no providerSessionId',
    );
  }

  let tokens: { doctorToken: string; patientToken: string };
  try {
    tokens = await mintPartyTokens(input.session, newSid, 'voice', input.correlationId);
  } catch (err) {
    logger.error(
      { correlationId: input.correlationId, sessionId: input.session.id, newSid, error: err instanceof Error ? err.message : String(err) },
      'modality-transition-executor: text→voice — token mint failed; closing orphan room',
    );
    await completeTwilioRoom(newSid, input.correlationId);
    throw err;
  }

  const startedCompositionAt = new Date();
  const label = compositionLabel(input.session.id, 'audio', startedCompositionAt);
  return {
    newProviderSessionId:  newSid,
    newProvider:           'twilio_video_audio',
    newAccessToken:        tokens.doctorToken,
    newPatientAccessToken: tokens.patientToken,
    recordingSegmentRef: {
      kind:             'audio_started',
      compositionLabel: label,
      startedAt:        startedCompositionAt,
    },
    recordingArtifactRef: label,
    transitionLatencyMs:  Date.now() - startedAt,
  };
}

/**
 * `text → video`. Provision a brand-new Twilio Video full room; the
 * default recording rule is audio-only (Plan 08 Task 43 convention —
 * video recording requires an explicit `escalateToFullVideoRecording`
 * call, which is NOT performed on transition). Client-side, Plan 09
 * Task 51's modality-change launcher enables the doctor's camera
 * publish after the transition lands.
 */
async function executeTextToVideo(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult> {
  const startedAt = Date.now();
  const created = await videoSessionTwilioAdapter.createSession(
    buildCreateSessionInput(input.session, 'video'),
    input.correlationId,
  );

  const newSid = created.providerSessionId;
  if (!newSid) {
    throw new InternalError(
      'modality-transition-executor: text→video — video adapter returned no providerSessionId',
    );
  }

  let tokens: { doctorToken: string; patientToken: string };
  try {
    tokens = await mintPartyTokens(input.session, newSid, 'video', input.correlationId);
  } catch (err) {
    logger.error(
      { correlationId: input.correlationId, sessionId: input.session.id, newSid, error: err instanceof Error ? err.message : String(err) },
      'modality-transition-executor: text→video — token mint failed; closing orphan room',
    );
    await completeTwilioRoom(newSid, input.correlationId);
    throw err;
  }

  const startedCompositionAt = new Date();
  const label = compositionLabel(input.session.id, 'audio', startedCompositionAt);
  return {
    newProviderSessionId:  newSid,
    newProvider:           'twilio_video',
    newAccessToken:        tokens.doctorToken,
    newPatientAccessToken: tokens.patientToken,
    recordingSegmentRef: {
      kind:             'audio_started',
      compositionLabel: label,
      startedAt:        startedCompositionAt,
    },
    recordingArtifactRef: label,
    transitionLatencyMs:  Date.now() - startedAt,
  };
}

/**
 * `voice → video` (Decision 2 payoff). Same Twilio room — just flip
 * the Recording Rules to audio+video via Plan 08 Task 43's wrapper.
 * No new room, no new access tokens (both parties already connected);
 * Task 51's UI hint toggles the camera publish client-side.
 *
 * The `escalationRequestId` uses the `modality_change:` prefix so
 * Plan 08's ledger can trace the origin back to a Plan 09 transition
 * without needing a matching `video_escalation_audit` row (there
 * isn't one — Plan 09 writes to `consultation_modality_history`
 * instead). See task doc Notes #3.
 */
async function executeVoiceToVideo(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult> {
  const startedAt = Date.now();
  const roomSid = input.session.providerSessionId;
  if (!roomSid) {
    throw new InternalError(
      'modality-transition-executor: voice→video — session.providerSessionId is missing; cannot escalate',
    );
  }

  const result = await escalateToFullVideoRecording({
    sessionId:             input.session.id,
    roomSid,
    doctorId:              input.session.doctorId,
    escalationRequestId:   `modality_change:${input.correlationId}`,
    correlationId:         input.correlationId,
  });

  const label = compositionLabel(input.session.id, 'video', result.escalationStartedAt);
  return {
    newProviderSessionId:  roomSid,
    recordingSegmentRef: {
      kind:             'video_started',
      compositionLabel: label,
      startedAt:        result.escalationStartedAt,
    },
    recordingArtifactRef: label,
    transitionLatencyMs:  Date.now() - startedAt,
  };
}

/**
 * `video → voice`. Same room — flip Recording Rules back to audio-
 * only. Client unpublishes the camera track. Plan 08's `revert…`
 * handles paused↔active state idempotently (Notes #1 on the
 * pause-resume coordination block).
 */
async function executeVideoToVoice(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult> {
  const startedAt = Date.now();
  const roomSid = input.session.providerSessionId;
  if (!roomSid) {
    throw new InternalError(
      'modality-transition-executor: video→voice — session.providerSessionId is missing; cannot revert',
    );
  }

  await revertToAudioOnlyRecording({
    sessionId:      input.session.id,
    roomSid,
    reason:         revertReasonFromInitiator(input.initiatedBy),
    initiatedBy:    revertInitiatedBy(input.initiatedBy),
    correlationId:  input.correlationId,
  });

  const endedAt = new Date();
  const label = compositionLabel(input.session.id, 'video', endedAt);
  return {
    newProviderSessionId:  roomSid,
    recordingSegmentRef: {
      kind:             'video_ended',
      compositionLabel: label,
      endedAt,
    },
    recordingArtifactRef: label,
    transitionLatencyMs:  Date.now() - startedAt,
  };
}

/**
 * `voice → text`. Disconnect the Twilio room (the voice adapter's
 * `endSession` enqueues the transcription job + wraps the video
 * adapter's room completion). Returns `newProviderSessionId: null` so
 * Task 47's UPDATE clears the column + flips `provider` to
 * `supabase_realtime`.
 *
 * The companion chat (Plan 06) is already live and survives this
 * transition by design — its channel key is the session id, not the
 * provider session id. No Supabase-side action required.
 *
 * **Rollback limitation** (Notes #5): Twilio `room.update({ status:
 * 'completed' })` is one-way. If Task 47's commit UPDATE somehow
 * fails AFTER this executor succeeds, the DB reflects voice but the
 * Twilio room is gone. Task 47 orders its transaction so the commit
 * UPDATE is the only step remaining; the orphan window is the counter
 * guard's `WHERE counter = 0` predicate (already logged loudly on
 * race).
 */
async function executeVoiceToText(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult> {
  const startedAt = Date.now();
  const roomSid = input.session.providerSessionId;
  if (!roomSid) {
    throw new InternalError(
      'modality-transition-executor: voice→text — session.providerSessionId is missing; cannot end Twilio room',
    );
  }

  await voiceSessionTwilioAdapter.endSession(roomSid, input.correlationId);

  const endedAt = new Date();
  const label = compositionLabel(input.session.id, 'audio', endedAt);
  return {
    newProviderSessionId: null,
    newProvider:          'supabase_realtime',
    recordingSegmentRef: {
      kind:             'audio_ended',
      compositionLabel: label,
      endedAt,
    },
    recordingArtifactRef: label,
    transitionLatencyMs: Date.now() - startedAt,
  };
}

/**
 * `video → text`. First revert to audio-only Recording Rules so the
 * video composition is closed gracefully (even though the room is
 * about to end — keeps Plan 08's ledger coherent). Then disconnect.
 * Same rollback limitation as `voice → text`.
 */
async function executeVideoToText(input: ExecuteTransitionInput): Promise<ExecuteTransitionResult> {
  const startedAt = Date.now();
  const roomSid = input.session.providerSessionId;
  if (!roomSid) {
    throw new InternalError(
      'modality-transition-executor: video→text — session.providerSessionId is missing; cannot revert+end Twilio room',
    );
  }

  await revertToAudioOnlyRecording({
    sessionId:      input.session.id,
    roomSid,
    reason:         revertReasonFromInitiator(input.initiatedBy),
    initiatedBy:    revertInitiatedBy(input.initiatedBy),
    correlationId:  input.correlationId,
  });

  // Video adapter (not voice) — video→text came from a video session;
  // voice adapter's `endSession` also enqueues a voice-transcription
  // job that would be irrelevant here.
  await videoSessionTwilioAdapter.endSession(roomSid, input.correlationId);

  const endedAt = new Date();
  const label = compositionLabel(input.session.id, 'video', endedAt);
  return {
    newProviderSessionId: null,
    newProvider:          'supabase_realtime',
    recordingSegmentRef: {
      kind:             'video_ended',
      compositionLabel: label,
      endedAt,
    },
    recordingArtifactRef: label,
    transitionLatencyMs: Date.now() - startedAt,
  };
}

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Dispatch `(fromModality, toModality)` to the right branch handler.
 * Same-modality throws `NoOpTransitionError` (defence-in-depth per
 * Task 47 already filtering these; see task doc Notes #8 + #10).
 */
async function dispatchTransition(
  input: ExecuteTransitionInput,
): Promise<ExecuteTransitionResult> {
  const from = input.session.modality;
  const to = input.toModality;

  if (from === to) {
    throw new NoOpTransitionError(from, input.correlationId);
  }

  logger.info(
    {
      correlationId: input.correlationId,
      sessionId:     input.session.id,
      from,
      to,
      initiatedBy:   input.initiatedBy,
    },
    'modality-transition-executor: dispatching transition',
  );

  switch (`${from}->${to}` as const) {
    case 'text->voice':  return executeTextToVoice(input);
    case 'text->video':  return executeTextToVideo(input);
    case 'voice->video': return executeVoiceToVideo(input);
    case 'video->voice': return executeVideoToVoice(input);
    case 'voice->text':  return executeVoiceToText(input);
    case 'video->text':  return executeVideoToText(input);
    default:
      // Exhaustiveness guard — TypeScript narrows `from`/`to` to
      // `Modality`, so this is unreachable; kept for defence against
      // future enum additions without an executor branch.
      throw new InternalError(
        `modality-transition-executor: unhandled transition ${from}->${to}`,
      );
  }
}

// ============================================================================
// Live executor — the default singleton. Replaces the Task-47-ship stub.
// ============================================================================

const liveExecutor: ModalityTransitionExecutor = {
  async executeTransition(input): Promise<ExecuteTransitionResult> {
    const started = Date.now();
    try {
      const result = await dispatchTransition(input);
      logger.info(
        {
          correlationId:       input.correlationId,
          sessionId:           input.session.id,
          from:                input.session.modality,
          to:                  input.toModality,
          transitionLatencyMs: result.transitionLatencyMs,
          newProviderSessionId: result.newProviderSessionId,
          newProvider:          result.newProvider,
        },
        'modality-transition-executor: transition applied',
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          correlationId: input.correlationId,
          sessionId:     input.session.id,
          from:          input.session.modality,
          to:            input.toModality,
          latencyMs:     Date.now() - started,
          error:         message,
        },
        'modality-transition-executor: transition failed',
      );
      throw err;
    }
  },
};

// ============================================================================
// DI plumbing — state machine reads this reference; tests overwrite it.
// ============================================================================

let activeExecutor: ModalityTransitionExecutor = liveExecutor;

/**
 * Reads the active executor. State machine calls this; never caches
 * (so a test-time override applies on every tick).
 */
export function getModalityTransitionExecutor(): ModalityTransitionExecutor {
  return activeExecutor;
}

/**
 * Test-only override. `null` restores the default (live) executor.
 * Production code MUST NOT call this outside the test harness.
 */
export function setModalityTransitionExecutorForTests(
  override: ModalityTransitionExecutor | null,
): void {
  activeExecutor = override ?? liveExecutor;
}

/**
 * Convenience wrapper for the state machine — thin indirection so a
 * unit test that wants to stub the executor can do so by importing
 * `setModalityTransitionExecutorForTests` rather than monkey-patching.
 */
export async function executeModalityTransition(
  input: ExecuteTransitionInput,
): Promise<ExecuteTransitionResult> {
  return activeExecutor.executeTransition(input);
}

// ============================================================================
// Test-only helpers — exported solely so the unit suite can exercise the
// individual branch handlers in isolation (avoids having to reconstruct
// the dispatcher's switch via string concatenation). DO NOT import from
// production code.
// ============================================================================

/**
 * Generate a correlation id suitable for a synthetic executor call in
 * integration tests. Re-exported so the sandbox test harness doesn't
 * have to pull in `node:crypto` directly.
 */
export function generateExecutorCorrelationId(): string {
  return `exec-${randomUUID()}`;
}

export const __testOnly__ = {
  executeTextToVoice,
  executeTextToVideo,
  executeVoiceToVideo,
  executeVideoToVoice,
  executeVoiceToText,
  executeVideoToText,
  dispatchTransition,
  compositionLabel,
  revertReasonFromInitiator,
  revertInitiatedBy,
};
