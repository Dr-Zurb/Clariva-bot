/**
 * Video Session — Twilio Adapter (Plan 01 · Task 15)
 *
 * Renamed from `consultation-room-service.ts` (Teleconsultation - e-task-2).
 * Behavior unchanged: Twilio Video room creation + Video AccessToken minting.
 *
 * **Important:** outside this file, only two call-sites may import from
 * here directly:
 *
 *   1. `consultation-session-service.ts` (the facade) — routes modality
 *      calls to the registered adapter.
 *   2. `voice-session-twilio.ts` (Plan 05 · Task 23) — composes this
 *      adapter as a thin wrapper in audio-only mode. Decision 8 LOCKED
 *      says voice and video share the Twilio Video provider, so
 *      adapter-level composition (rather than a separate twilio_voice
 *      integration) is the intentional path.
 *
 * Everywhere else MUST go through the facade. The PR-time grep:
 *   rg "from .*video-session-twilio" --type ts \
 *     | rg -v "consultation-session-service\.ts|voice-session-twilio\.ts|\.test\.ts"
 * must return empty.
 *
 * @see TELECONSULTATION_PLAN.md
 * @see COMPLIANCE.md - No PHI in logs
 */

import Twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError, ValidationError } from '../utils/errors';
import { emitPartyJoined } from './consultation-message-service';
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
// Types
// ============================================================================

export interface CreateRoomResult {
  roomSid: string;
  roomName: string;
}

// ============================================================================
// Internal helpers
// ============================================================================

function getTwilioClient(): Twilio.Twilio | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return Twilio(sid, token);
}

function isVideoConfigured(): boolean {
  const keySid = env.TWILIO_API_KEY_SID?.trim();
  const keySecret = env.TWILIO_API_KEY_SECRET?.trim();
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  return !!(keySid && keySecret && accountSid);
}

/**
 * Stable room-name convention: `appointment-{appointmentId}`.
 * Preserved from the legacy `consultation-room-service.ts` so existing
 * webhook identity parsing in `consultation-verification-service.ts`
 * (`participant-${appointmentId}`) keeps working unchanged.
 */
function buildRoomName(appointmentId: string): string {
  return `appointment-${appointmentId}`;
}

// ============================================================================
// Primitives (kept exported for the adapter object below; consumers should
// not import these directly — go through the facade)
// ============================================================================

/**
 * Create a Twilio Video room.
 *
 * @param roomName - Unique room name (e.g. appointment-{uuid})
 * @param correlationId - For logging (no PHI)
 * @returns Room SID and name, or null if Twilio not configured
 * @throws InternalError on Twilio API failure
 * @throws ValidationError if roomName invalid
 */
export async function createTwilioRoom(
  roomName: string,
  correlationId: string
): Promise<CreateRoomResult | null> {
  const trimmed = roomName?.trim();
  if (!trimmed || trimmed.length < 1) {
    throw new ValidationError('Room name is required');
  }

  const client = getTwilioClient();
  if (!client) {
    logger.warn(
      { correlationId },
      'Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN) - cannot create room'
    );
    return null;
  }

  const statusCallback = env.WEBHOOK_BASE_URL?.trim()
    ? `${env.WEBHOOK_BASE_URL.replace(/\/$/, '')}/webhooks/twilio/room-status`
    : undefined;

  try {
    const room = await client.video.v1.rooms.create({
      uniqueName: trimmed,
      type: 'group',
      ...(statusCallback && {
        statusCallback,
        statusCallbackMethod: 'POST' as const,
      }),
    });

    logger.info(
      { correlationId, roomSid: room.sid, roomName: trimmed },
      'Twilio Video room created'
    );

    return {
      roomSid: room.sid,
      roomName: room.uniqueName ?? trimmed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Idempotency: if a room with this uniqueName is already in-progress
    // (Twilio error 53113 "Room exists"), fetch + return it instead of
    // failing. This recovers gracefully from cases where a previous
    // `/consultation/start` created the Twilio room but the downstream
    // `consultation_sessions` insert threw — without this, every retry
    // 500s on the orphan room until Twilio ages it out (~5 min TTL).
    if (message.includes('53113') || /room exists/i.test(message)) {
      try {
        const existing = await client.video.v1.rooms(trimmed).fetch();
        if (existing.status === 'in-progress') {
          logger.warn(
            { correlationId, roomSid: existing.sid, roomName: trimmed },
            'Twilio Video room reused (recovered from orphan)'
          );
          return {
            roomSid: existing.sid,
            roomName: existing.uniqueName ?? trimmed,
          };
        }
        // Room exists but is 'completed' / 'failed' — Twilio keeps the
        // uniqueName reserved for ~5 min after the room terminates.
        // Surfacing a clearer message lets the doctor retry shortly.
        logger.error(
          { correlationId, roomName: trimmed, status: existing.status },
          'Twilio Video room uniqueName reserved by terminated room'
        );
        throw new InternalError(
          'This consult room is still winding down on the video provider — please wait ~30 seconds and try again.'
        );
      } catch (fetchErr) {
        if (fetchErr instanceof InternalError) throw fetchErr;
        const fetchMsg =
          fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        logger.error(
          { correlationId, roomName: trimmed, error: fetchMsg },
          'Twilio Video room reuse-fetch failed'
        );
        throw new InternalError('Failed to create video room');
      }
    }

    logger.error(
      { correlationId, roomName: trimmed, error: message },
      'Twilio Video room creation failed'
    );

    if (message.includes('20429') || message.includes('rate limit')) {
      throw new InternalError('Twilio rate limit exceeded - please try again shortly');
    }
    if (message.includes('20003') || message.includes('authenticate')) {
      throw new InternalError('Twilio credentials invalid - check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    }

    throw new InternalError('Failed to create video room');
  }
}

/** TTL for Video access token (seconds). 4 hours covers a consultation window. */
const VIDEO_TOKEN_TTL_SEC = 4 * 60 * 60;

/**
 * Generate a Twilio Video access token for a participant.
 *
 * @param identity - Participant identity (e.g. 'doctor-{doctorId}' or 'patient-{appointmentId}'). No PHI.
 * @param roomName - Room unique name or SID (participant will be restricted to this room)
 * @param correlationId - For logging (no PHI)
 * @returns JWT string, or null if Twilio Video not configured
 * @throws ValidationError if identity or roomName invalid
 */
export function generateVideoAccessToken(
  identity: string,
  roomName: string,
  correlationId: string
): string | null {
  const trimmedIdentity = identity?.trim();
  const trimmedRoom = roomName?.trim();
  if (!trimmedIdentity || trimmedIdentity.length < 1) {
    throw new ValidationError('Identity is required');
  }
  if (!trimmedRoom || trimmedRoom.length < 1) {
    throw new ValidationError('Room name is required');
  }

  if (!isVideoConfigured()) {
    logger.warn(
      { correlationId },
      'Twilio Video not configured (TWILIO_API_KEY_SID/SECRET) - cannot generate token'
    );
    return null;
  }

  const accountSid = env.TWILIO_ACCOUNT_SID!.trim();
  const apiKeySid = env.TWILIO_API_KEY_SID!.trim();
  const apiKeySecret = env.TWILIO_API_KEY_SECRET!.trim();

  const { AccessToken } = Twilio.jwt;
  const { VideoGrant } = AccessToken;

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: trimmedIdentity,
    ttl: VIDEO_TOKEN_TTL_SEC,
  });

  const videoGrant = new VideoGrant({ room: trimmedRoom });
  token.addGrant(videoGrant);

  return token.toJwt();
}

/**
 * Tear down a Twilio Video room. Idempotent: a 404 from Twilio (room
 * already completed) is treated as success.
 */
export async function completeTwilioRoom(
  roomSid: string,
  correlationId: string
): Promise<void> {
  const trimmed = roomSid?.trim();
  if (!trimmed) return;

  const client = getTwilioClient();
  if (!client) {
    logger.warn(
      { correlationId, roomSid: trimmed },
      'Twilio not configured - skipping room completion'
    );
    return;
  }

  try {
    await client.video.v1.rooms(trimmed).update({ status: 'completed' });
    logger.info({ correlationId, roomSid: trimmed }, 'Twilio Video room completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 20404 / "not found" = already completed; not an error for our purposes
    if (message.includes('20404') || message.toLowerCase().includes('not found')) {
      logger.info({ correlationId, roomSid: trimmed }, 'Twilio room already completed');
      return;
    }
    logger.warn(
      { correlationId, roomSid: trimmed, error: message },
      'Twilio Video room completion failed (non-fatal)'
    );
  }
}

/**
 * Check if Twilio Video is fully configured (rooms + tokens).
 */
export function isTwilioVideoConfigured(): boolean {
  return !!(
    getTwilioClient() &&
    isVideoConfigured()
  );
}

// ============================================================================
// Adapter object — registered with the facade
// ============================================================================

/**
 * The video adapter satisfies `ConsultationSessionAdapter` by composing the
 * primitives above. The facade wraps this with the DB row lifecycle.
 */
export const videoSessionTwilioAdapter: ConsultationSessionAdapter = {
  modality: 'video' satisfies Modality,
  provider: 'twilio_video' satisfies Provider,

  async createSession(
    input: CreateSessionInput,
    correlationId: string
  ): Promise<AdapterCreateResult> {
    const roomName = buildRoomName(input.appointmentId);
    const created = await createTwilioRoom(roomName, correlationId);
    if (!created) {
      throw new InternalError('Failed to create video room');
    }
    return { providerSessionId: created.roomSid };
  },

  async endSession(providerSessionId: string, correlationId: string): Promise<void> {
    await completeTwilioRoom(providerSessionId, correlationId);
  },

  async getJoinToken(
    input: AdapterGetJoinTokenInput,
    correlationId: string
  ): Promise<JoinToken> {
    const roomName = buildRoomName(input.appointmentId);
    const identity =
      input.role === 'doctor'
        ? `doctor-${input.doctorId}`
        : `patient-${input.appointmentId}`;

    const token = generateVideoAccessToken(identity, roomName, correlationId);
    if (!token) {
      throw new InternalError('Failed to generate video access token');
    }

    // Plan 06 · Task 37: fire a companion-chat "party joined" banner.
    // This covers BOTH video and voice modalities — the voice adapter's
    // `getJoinToken` delegates here, so emitting once at the video
    // layer gives single-source semantics (task-37 Notes #7). Token-
    // mint is the v1 join signal (vs. Twilio's `participantConnected`
    // webhook); documented trade-off. Skipped silently when the
    // facade did not supply a sessionId — no banner possible without
    // a session row to hang it off.
    if (input.sessionId) {
      void emitPartyJoined(input.sessionId, input.role);
    }

    return {
      token,
      expiresAt: new Date(Date.now() + VIDEO_TOKEN_TTL_SEC * 1000),
    };
  },
};
