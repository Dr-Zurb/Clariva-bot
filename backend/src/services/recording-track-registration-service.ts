/**
 * Raw track registration sweep (cost-cut step 7).
 *
 * Sibling of `twilio-composition-status-service.ts`. That module reacts
 * to one composition webhook; this one walks a room's raw `RT…`
 * Recordings and registers every finished track.
 *
 * ## Why a sweep instead of a webhook
 *
 * Twilio's per-recording status callback is configured account-wide in
 * Video Recording Settings, not per room from code, and this repo has
 * no handler for `recording-completed`. Compositions get a webhook
 * because the account-level Composition Hook carries a callback URL;
 * raw tracks do not. So tracks are discovered by listing.
 *
 * ## Why registration exists at all
 *
 * Not for replay. On-demand composition only needs the room SID, which
 * the session already carries. These rows exist so **governance can
 * find the raw media**: the archival worker's retention delete and the
 * DPDP erasure path both walk `recording_artifact_index`, and media
 * that was never indexed is media that never gets deleted.
 *
 * That makes timing forgiving — archival runs nightly — but coverage
 * unforgiving. Hence two call sites, both idempotent through rec-02's
 * UNIQUE constraint:
 *
 *   1. `room-ended` — cheap first attempt. Most tracks are still
 *      `processing` at this moment and get skipped.
 *   2. the transcription worker — already polls with backoff until
 *      media is ready, so it is the one that actually catches them.
 *
 * Never throws. A registration failure must not fail a webhook or a
 * transcription job; an unregistered track is a governance gap to
 * retry, not a reason to drop the consult.
 */

import { logger } from '../config/logger';
import { registerFinalisedRecording } from './recording-artifact-service';
import { listRecordingsForRoom } from './twilio-recordings';

export interface RegisterSessionRecordingsInput {
  sessionId:     string;
  roomSid:       string;
  correlationId: string;
}

export interface RegisterSessionRecordingsResult {
  listed:              number;
  registered:          number;
  alreadyPresent:      number;
  skippedNotCompleted: number;
  skippedNonMedia:     number;
  failed:              number;
}

function emptyResult(): RegisterSessionRecordingsResult {
  return {
    listed:              0,
    registered:          0,
    alreadyPresent:      0,
    skippedNotCompleted: 0,
    skippedNonMedia:     0,
    failed:              0,
  };
}

/**
 * Register every completed raw track for a room. Safe to call
 * repeatedly; safe to call while Twilio is still finalising media.
 */
export async function registerSessionRecordings(
  input: RegisterSessionRecordingsInput,
): Promise<RegisterSessionRecordingsResult> {
  const sessionId = input.sessionId?.trim();
  const roomSid = input.roomSid?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';
  const result = emptyResult();

  if (!sessionId || !roomSid) {
    logger.warn(
      { correlationId, sessionId, roomSid },
      'recording-track-registration: missing sessionId or roomSid — skipped',
    );
    return result;
  }

  let recordings;
  try {
    recordings = await listRecordingsForRoom(roomSid);
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        roomSid,
        error: err instanceof Error ? err.message : String(err),
      },
      'recording-track-registration: list-by-room failed — nothing registered',
    );
    return result;
  }

  result.listed = recordings.length;

  for (const recording of recordings) {
    if (recording.type === 'data') {
      result.skippedNonMedia += 1;
      continue;
    }
    if (recording.status !== 'completed') {
      result.skippedNotCompleted += 1;
      continue;
    }

    try {
      const registered = await registerFinalisedRecording({
        sessionId,
        recordingSid: recording.recordingSid,
        correlationId,
      });
      if (registered.created) result.registered += 1;
      else result.alreadyPresent += 1;
    } catch (err) {
      result.failed += 1;
      logger.warn(
        {
          correlationId,
          sessionId,
          roomSid,
          recordingSid: recording.recordingSid,
          error: err instanceof Error ? err.message : String(err),
        },
        'recording-track-registration: track register failed (retried on the next sweep)',
      );
    }
  }

  logger.info(
    { correlationId, sessionId, roomSid, ...result },
    'recording-track-registration: sweep complete',
  );

  return result;
}
