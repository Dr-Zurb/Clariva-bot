/**
 * Consultation Room Service (Teleconsultation - e-task-2)
 *
 * Creates Twilio Video rooms and generates access tokens for doctor and patient.
 * Uses Twilio REST API for rooms; JWT AccessToken with VideoGrant for tokens.
 *
 * @see TELECONSULTATION_PLAN.md
 * @see COMPLIANCE.md - No PHI in logs
 */

import Twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError, ValidationError } from '../utils/errors';

// ============================================================================
// Types
// ============================================================================

export interface CreateRoomResult {
  roomSid: string;
  roomName: string;
}

// ============================================================================
// Helpers
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

// ============================================================================
// API
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
 * Check if Twilio Video is fully configured (rooms + tokens).
 */
export function isTwilioVideoConfigured(): boolean {
  return !!(
    getTwilioClient() &&
    isVideoConfigured()
  );
}
