/**
 * Recording auto-resume worker (recording-governance-v2 · rec-16).
 *
 * Polling worker that resumes pauses whose server-owned deadline has
 * passed. Mirrors `video-escalation-timeout-worker.ts`: DB-polling, not
 * setTimeout (REC3-D7). A pod restart must not change when a pause
 * resumes — the deadline lives on `consultation_recording_audit.auto_resume_at`.
 *
 * **Why DB-polling and not setTimeout:**
 *   · Pod crash / restart would lose an in-process timer; the pause
 *     would sit open for the rest of the consult and the artifact would
 *     look complete.
 *   · Two pods are safe: the claim is an atomic UPDATE whose predicate
 *     is "still open and unclaimed". The loser sees zero rows and the
 *     tick is a no-op.
 *   · Tick cadence is 15s (see cron route). A 5-minute policy tolerates
 *     a 15s worst-case overshoot.
 *
 * Resume goes through `resumeRecordingAsSystem` — rec-14's restore path,
 * attributed to the all-zeros system actor, `pause_closed_as = auto_resume`.
 * A Twilio failure clears the claim and leaves the pause open for the
 * next tick. A session that is no longer live is stamped
 * `session_ended_while_paused` and never hit Twilio.
 *
 * Uses `idx_recording_audit_auto_resume_due` (196): completed pause,
 * deadline set, not yet closed.
 *
 * @see backend/src/services/recording-pause-service.ts
 * @see backend/migrations/196_recording_pause_reason_codes_and_auto_resume_stamps.sql
 */

import { logger } from '../config/logger';
import { findSessionById } from '../services/consultation-session-service';
import {
  claimPauseForAutoResume,
  clearAutoResumeClaim,
  releaseStaleAutoResumeClaims,
  resumeRecordingAsSystem,
  scanDueAutoResumePauses,
  stampDanglingPausesForEndedSession,
} from '../services/recording-pause-service';
import {
  RECORDING_AUTO_RESUME_CLAIM_STALE_MS,
  RECORDING_AUTO_RESUME_TICK_SECONDS,
} from '../types/consultation-recording-audit';
import { TwilioRoomNotFoundError } from '../services/twilio-recording-rules';

export interface RecordingAutoResumeJobResult {
  scanned: number;
  resumed: number;
  raced: number;
  errors: string[];
}

export async function runRecordingAutoResumeJob(
  correlationId: string,
  nowMs: number = Date.now()
): Promise<RecordingAutoResumeJobResult> {
  const result: RecordingAutoResumeJobResult = {
    scanned: 0,
    resumed: 0,
    raced: 0,
    errors: [],
  };

  const cutoffIso = new Date(nowMs).toISOString();
  const staleBeforeIso = new Date(nowMs - RECORDING_AUTO_RESUME_CLAIM_STALE_MS).toISOString();

  try {
    await releaseStaleAutoResumeClaims(staleBeforeIso);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ correlationId, error: message }, 'recording-auto-resume-worker: stale-claim release failed');
  }

  let rows;
  try {
    rows = await scanDueAutoResumePauses(cutoffIso);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: message }, 'recording-auto-resume-worker: scan failed');
    result.errors.push(message);
    return result;
  }

  if (rows.length === 0) {
    logger.debug({ correlationId }, 'recording-auto-resume-worker: no due pauses');
    return result;
  }

  result.scanned = rows.length;

  for (const row of rows) {
    const rowCorrelationId = `${correlationId}:${row.id}`;
    try {
      const session = await findSessionById(row.sessionId);
      const live = session?.status === 'live';

      const claimed = await claimPauseForAutoResume(row.id, rowCorrelationId, cutoffIso);
      if (!claimed) {
        result.raced += 1;
        logger.debug(
          { correlationId: rowCorrelationId, sessionId: row.sessionId, pauseRowId: row.id },
          'recording-auto-resume-worker: claim raced'
        );
        continue;
      }

      if (!live) {
        await stampDanglingPausesForEndedSession(row.sessionId, rowCorrelationId);
        result.resumed += 1;
        continue;
      }

      try {
        await resumeRecordingAsSystem({
          sessionId: row.sessionId,
          correlationId: rowCorrelationId,
        });
        result.resumed += 1;
      } catch (err) {
        if (err instanceof TwilioRoomNotFoundError) {
          await stampDanglingPausesForEndedSession(row.sessionId, rowCorrelationId);
          result.resumed += 1;
          continue;
        }
        await clearAutoResumeClaim(row.id);
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { correlationId: rowCorrelationId, sessionId: row.sessionId, pauseRowId: row.id, error: message },
          'recording-auto-resume-worker: resume failed — pause left open'
        );
        result.errors.push(message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { correlationId: rowCorrelationId, sessionId: row.sessionId, pauseRowId: row.id, error: message },
        'recording-auto-resume-worker: unexpected error processing row'
      );
      result.errors.push(message);
    }
  }

  logger.info(
    {
      correlationId,
      scanned: result.scanned,
      resumed: result.resumed,
      raced: result.raced,
      errors: result.errors.length,
      tickSeconds: RECORDING_AUTO_RESUME_TICK_SECONDS,
    },
    'recording-auto-resume-worker: tick complete'
  );

  return result;
}
