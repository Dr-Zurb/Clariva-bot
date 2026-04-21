/**
 * Voice Session — Twilio Adapter (Plan 05 · Task 23, Decision 2 LOCKED)
 *
 * Thin wrapper around `videoSessionTwilioAdapter`. Voice = Twilio Video in
 * audio-only mode. Same SDK, same webhook surface, same recording
 * lifecycle — only two things differ:
 *
 *   1. The **Recording Rules** on the Twilio room are configured to
 *      include audio and exclude video (defense-in-depth; the frontend in
 *      Task 24 also never publishes a camera track).
 *   2. `endSession` enqueues a voice transcription job (Task 25) after
 *      the Twilio room teardown.
 *
 * Why NOT a distinct `twilio_voice` provider? The `provider` column on
 * `consultation_sessions` answers "what backend service-of-record is
 * responsible for the live session", not "what modality is it". Voice and
 * video both run on Twilio Video infrastructure; the voice/video
 * distinction lives on `consultation_sessions.modality`. This keeps
 * mid-consult voice→video switching (Plan 09 / Decision 11) as "flip the
 * Recording Rules + grant a camera publish" — same room SID, same DB row.
 *
 * **Invariant:** nothing outside this file (or `consultation-session-service.ts`)
 * should import from here directly. The facade's adapter registry is the
 * only legitimate caller. Enforced by the PR-time grep:
 *   rg "from .*voice-session-twilio" --type ts | rg -v "consultation-session-service\\.ts"
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-23-voice-session-twilio-adapter.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md
 * @see COMPLIANCE.md - No PHI in logs
 */

import Twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';
import { videoSessionTwilioAdapter } from './video-session-twilio';
import { enqueueVoiceTranscription } from './voice-transcription-service';
import type {
  AdapterCreateResult,
  AdapterGetJoinTokenInput,
  ConsultationSessionAdapter,
  CreateSessionInput,
  JoinToken,
  Modality,
  Provider,
} from '../types/consultation-session';

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Twilio client for the Recording Rules call. Re-implemented locally
 * (rather than importing from `video-session-twilio.ts`) so the voice
 * adapter doesn't need access to the video adapter's module-private
 * helpers — the only cross-adapter surface is the exported adapter object.
 */
function getTwilioClient(): Twilio.Twilio | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return Twilio(sid, token);
}

// ============================================================================
// Public helper — exported so a future Decision 11 "force audio-only
// mid-call" path (Plan 09) can invoke the rule update independently of
// createSession.
// ============================================================================

/**
 * Apply audio-only Recording Rules to a Twilio Video room.
 *
 * Rule shape: `[{ include, audio }, { exclude, video }]`. This ensures the
 * stored Composition artifact is audio-only regardless of what tracks a
 * (possibly tampered) client might publish. Frontend-side enforcement
 * (no camera track published) is belt-and-suspenders on top of this.
 *
 * **Timing:** Twilio's `recordingRules.update()` applies to **future
 * tracks**, so calling it immediately after `rooms.create()` (the
 * pre-consult cron in Plan 04 / Task 18 runs ~5 min before the session
 * starts) is well-within the safe window. If a race ever surfaces where
 * the doctor joins faster than the rule update lands, the rule still
 * applies to all subsequent tracks and the in-flight tracks finalize
 * under the default rule; doc as a known edge in the adapter's JSDoc.
 *
 * @throws InternalError on Twilio API failure or missing credentials.
 *         createSession propagates this so recording-rule misconfiguration
 *         is loud (session-quality bug, not silent data-quality bug).
 */
export async function applyAudioOnlyRecordingRules(
  roomSid: string,
  correlationId: string
): Promise<void> {
  const trimmed = roomSid?.trim();
  if (!trimmed) {
    throw new InternalError(
      'applyAudioOnlyRecordingRules: roomSid is required'
    );
  }

  const client = getTwilioClient();
  if (!client) {
    // Matches `video-session-twilio.ts` semantics: Twilio-not-configured is
    // a configuration error — we've already created the room in a path
    // that must have had a client, so reaching here is exceptional.
    throw new InternalError(
      'applyAudioOnlyRecordingRules: Twilio not configured ' +
        '(TWILIO_ACCOUNT_SID/AUTH_TOKEN missing after room creation?)'
    );
  }

  try {
    await client.video.v1.rooms(trimmed).recordingRules.update({
      rules: [
        { type: 'include', kind: 'audio' },
        { type: 'exclude', kind: 'video' },
      ],
    });

    logger.info(
      { correlationId, roomSid: trimmed },
      'voice-session-twilio: audio-only Recording Rules applied'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, roomSid: trimmed, error: message },
      'voice-session-twilio: Recording Rules update failed'
    );
    throw new InternalError(
      `Failed to apply audio-only Recording Rules to room ${trimmed}: ${message}`
    );
  }
}

// ============================================================================
// Adapter object — registered with the facade
// ============================================================================

/**
 * Voice adapter. Modality = `'voice'`, provider = `'twilio_video'` (see
 * file-level doc for the "why not twilio_voice" rationale).
 *
 * Method contracts:
 *   - `createSession`: delegates to video adapter's createSession, then
 *     applies audio-only Recording Rules. Propagates failures as
 *     `InternalError` (no silent fallback).
 *   - `endSession`: delegates to video adapter's endSession, then
 *     enqueues voice transcription. Transcription-enqueue failures are
 *     swallowed + logged (the consult is already over; transcription is
 *     best-effort and non-blocking).
 *   - `getJoinToken`: delegates entirely to the video adapter. Audio-only
 *     is enforced client-side and at the Recording Rules layer; the
 *     access token itself carries identical capability grants. **The
 *     video adapter's `getJoinToken` owns the Plan 06 / Task 37
 *     `emitPartyJoined` banner — this adapter does NOT fire it
 *     separately (single source, no double-banner; task-37 Notes #7).**
 */
export const voiceSessionTwilioAdapter: ConsultationSessionAdapter = {
  modality: 'voice' satisfies Modality,
  provider: 'twilio_video' satisfies Provider,

  async createSession(
    input: CreateSessionInput,
    correlationId: string
  ): Promise<AdapterCreateResult> {
    const created = await videoSessionTwilioAdapter.createSession(
      input,
      correlationId
    );

    if (!created.providerSessionId) {
      // The video adapter's contract is to always return a providerSessionId
      // on success (it throws on failure). Defensive guard in case that
      // contract ever slips — better to surface here than silently skip
      // the Recording Rules.
      throw new InternalError(
        'voice-session-twilio: video adapter returned no providerSessionId'
      );
    }

    await applyAudioOnlyRecordingRules(created.providerSessionId, correlationId);

    return created;
  },

  async endSession(providerSessionId: string, correlationId: string): Promise<void> {
    await videoSessionTwilioAdapter.endSession(providerSessionId, correlationId);

    try {
      await enqueueVoiceTranscription({ providerSessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { correlationId, providerSessionId, error: message },
        'voice-session-twilio: enqueueVoiceTranscription failed (non-fatal; consult is already ended)'
      );
    }
  },

  async getJoinToken(
    input: AdapterGetJoinTokenInput,
    correlationId: string
  ): Promise<JoinToken> {
    return videoSessionTwilioAdapter.getJoinToken(input, correlationId);
  },
};
