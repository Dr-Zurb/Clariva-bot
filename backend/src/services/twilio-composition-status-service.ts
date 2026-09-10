/**
 * Twilio composition-status handler (recording-governance-v2 · rec-01).
 *
 * The webhook payload is a notification, not trusted data. Kind comes
 * from `listCompositionsForRoom` (`includeVideo`). Status and size are
 * re-read by `registerFinalisedComposition` via `fetchCompositionMetadata`.
 * Idempotency is rec-02's UNIQUE constraint — this module does not add
 * a second one.
 */

import { logger } from '../config/logger';
import { findSessionByProviderSessionId } from './consultation-session-service';
import { registerFinalisedComposition } from './recording-artifact-service';
import { listCompositionsForRoom } from './twilio-compositions';

const COMPOSITION_SID_RE = /^CJ[a-zA-Z0-9]{10,}$/;
const ROOM_SID_RE = /^RM[a-zA-Z0-9]{10,}$/;

export interface CompositionStatusPayload {
  compositionSid: string;
  roomSid: string;
  statusCallbackEvent?: string;
  status?: string;
}

type StatusClass = 'completed' | 'failed' | 'other';

function classifyStatus(payload: CompositionStatusPayload): StatusClass {
  const event = (payload.statusCallbackEvent ?? '').trim().toLowerCase();
  const status = (payload.status ?? '').trim().toLowerCase();

  if (event === 'composition-failed' || status === 'failed') {
    return 'failed';
  }
  if (
    event === 'composition-available' ||
    event === 'composition-completed' ||
    status === 'completed' ||
    status === 'available'
  ) {
    return 'completed';
  }
  return 'other';
}

async function resolveSessionIdForRoom(
  roomSid: string,
  correlationId: string
): Promise<string | null> {
  const video = await findSessionByProviderSessionId('twilio_video', roomSid);
  if (video) return video.id;
  const voice = await findSessionByProviderSessionId('twilio_video_audio', roomSid);
  if (voice) return voice.id;
  logger.info(
    { correlationId, roomSid },
    'twilio-composition-status: no consultation session for room — dropped'
  );
  return null;
}

async function resolveArtifactKind(
  roomSid: string,
  compositionSid: string,
  correlationId: string
): Promise<'audio_composition' | 'video_composition'> {
  try {
    const listed = await listCompositionsForRoom(roomSid);
    const match = listed.find((row) => row.compositionSid === compositionSid);
    if (match) {
      return match.includeVideo ? 'video_composition' : 'audio_composition';
    }
    logger.info(
      { correlationId, roomSid, compositionSid },
      'twilio-composition-status: composition not in room list — defaulting to audio_composition'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { correlationId, roomSid, compositionSid, error: message },
      'twilio-composition-status: list-by-room failed — defaulting to audio_composition'
    );
  }
  return 'audio_composition';
}

/**
 * Process a verified, Zod-parsed composition-status callback.
 * Never throws to the caller for "drop" cases (unresolved session,
 * non-completed event). Registration failures propagate so the
 * controller's `setImmediate` catch can log them after the 200.
 */
export async function handleCompositionStatusCallback(
  payload: CompositionStatusPayload,
  correlationId: string
): Promise<void> {
  const compositionSid = payload.compositionSid.trim();
  const roomSid = payload.roomSid.trim();
  const cid = correlationId.trim() || 'unknown';

  if (!COMPOSITION_SID_RE.test(compositionSid) || !ROOM_SID_RE.test(roomSid)) {
    logger.info(
      { correlationId: cid, compositionSid, roomSid },
      'twilio-composition-status: SID shape invalid after parse — dropped'
    );
    return;
  }

  const classified = classifyStatus(payload);
  if (classified !== 'completed') {
    logger.info(
      {
        correlationId: cid,
        compositionSid,
        roomSid,
        statusCallbackEvent: payload.statusCallbackEvent,
        status: payload.status,
        classified,
      },
      'twilio-composition-status: non-completed event — acknowledged, not registered'
    );
    return;
  }

  const sessionId = await resolveSessionIdForRoom(roomSid, cid);
  if (!sessionId) return;

  const artifactKind = await resolveArtifactKind(roomSid, compositionSid, cid);
  const result = await registerFinalisedComposition({
    sessionId,
    compositionSid,
    artifactKind,
    correlationId: cid,
  });

  logger.info(
    {
      correlationId: cid,
      sessionId,
      compositionSid,
      roomSid,
      artifactKind,
      created: result.created,
      artifactId: result.artifactId,
    },
    result.created
      ? 'twilio-composition-status: artifact registered'
      : 'twilio-composition-status: artifact already present (idempotent)'
  );
}
