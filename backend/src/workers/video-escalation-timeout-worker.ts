/**
 * Video-escalation timeout worker (Plan 08 · Task 41).
 *
 * Polling worker (every 5s via Render Cron / equivalent) that closes
 * `video_escalation_audit` rows whose 60s patient-consent window has
 * elapsed without a response. Mirrors the `voice-transcription-worker`
 * shape — a single `runVideoEscalationTimeoutJob(correlationId)` export
 * hooked into `routes/cron.ts`.
 *
 * **Why DB-polling and not setTimeout:**
 *   · Pod crash / restart would lose an in-process timer; the audit row
 *     would sit `pending` forever, the doctor UI would never transition
 *     from the waiting view, and the rate-limit counter would be stuck.
 *   · Two pods running the worker concurrently is safe: the atomic
 *     UPDATE uses `patient_response IS NULL` as a predicate so only one
 *     UPDATE actually lands. The other pod's `UPDATE` returns 0 rows
 *     and the tick is a no-op.
 *   · 5s polling fuzz (worst case 60–65s wall time) is acceptable for a
 *     60s policy. task-41 Notes #1 documents the trade-off.
 *
 * **Race with a fast patient:**
 *   Patient clicks Allow at 59.5s; worker tick lands at 60.0s. The
 *   patient-response UPDATE has a tighter predicate (same `IS NULL`
 *   plus the expiry guard); whichever UPDATE evaluates the predicate
 *   first wins. The "loser" sees 0 rows returned and treats it as a
 *   no-op. Unit test pins this race.
 *
 * **Realtime fan-out:** none here. The frontend subscribes to
 * Postgres-changes on `video_escalation_audit` UPDATE; the service-role
 * UPDATE this worker performs fires that channel automatically. Both
 * the doctor waiting view and the patient consent modal close
 * correctly without the worker publishing custom events.
 *
 * @see backend/src/services/recording-escalation-service.ts
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';

// ============================================================================
// Constants
// ============================================================================

/** 60s consent window, matches the service. */
const EXPIRY_SECONDS = 60;
/** Hard cap per tick so a backlog after a cron outage doesn't starve
 *  the worker on a single pod. */
const BATCH_SIZE_CAP = 100;

// ============================================================================
// Public result shape
// ============================================================================

export interface VideoEscalationTimeoutJobResult {
  /** How many pending-expired rows we scanned. */
  scanned:   number;
  /** How many rows this tick actually flipped to 'timeout'. */
  timedOut:  number;
  /** How many UPDATEs returned 0 rows (race with patient-response or
   *  another pod already claimed it). Expected ≥0 in healthy state. */
  raced:     number;
  errors:    string[];
}

// ============================================================================
// Public: runVideoEscalationTimeoutJob
// ============================================================================

export async function runVideoEscalationTimeoutJob(
  correlationId: string,
): Promise<VideoEscalationTimeoutJobResult> {
  const result: VideoEscalationTimeoutJobResult = {
    scanned:  0,
    timedOut: 0,
    raced:    0,
    errors:   [],
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'video-escalation-timeout-worker: no admin client — tick skipped',
    );
    return result;
  }

  // Scan for pending rows whose 60s window elapsed. Using a cutoff ISO
  // string rather than Postgres `now() - interval` so we can unit-test
  // against an in-memory cutoff without sharing the DB clock.
  const cutoffIso = new Date(Date.now() - EXPIRY_SECONDS * 1000).toISOString();

  const { data: scanRows, error: scanErr } = await admin
    .from('video_escalation_audit')
    .select('id, session_id, requested_at, correlation_id')
    .is('patient_response', null)
    .lte('requested_at', cutoffIso)
    .order('requested_at', { ascending: true })
    .limit(BATCH_SIZE_CAP);

  if (scanErr) {
    logger.error(
      { correlationId, error: scanErr.message },
      'video-escalation-timeout-worker: scan query failed',
    );
    result.errors.push(scanErr.message);
    return result;
  }

  if (!scanRows || scanRows.length === 0) {
    logger.debug(
      { correlationId },
      'video-escalation-timeout-worker: no expired pending rows',
    );
    return result;
  }

  result.scanned = scanRows.length;
  const nowIso = new Date().toISOString();

  for (const row of scanRows) {
    const requestId = row.id as string;
    const sessionId = row.session_id as string;
    const rowCorrelationId = (row.correlation_id as string | null) ?? correlationId;

    try {
      // Atomic UPDATE — guards against the patient-response path that
      // may be happening concurrently. If the patient response landed
      // first, `patient_response IS NULL` is no longer true and zero
      // rows return.
      const { data: updated, error: updErr } = await admin
        .from('video_escalation_audit')
        .update({
          patient_response: 'timeout',
          responded_at: nowIso,
        })
        .eq('id', requestId)
        .is('patient_response', null)
        .lte('requested_at', cutoffIso)
        .select('id')
        .maybeSingle();

      if (updErr) {
        logger.error(
          {
            correlationId: rowCorrelationId,
            requestId,
            sessionId,
            error: updErr.message,
          },
          'video-escalation-timeout-worker: atomic UPDATE failed',
        );
        result.errors.push(updErr.message);
        continue;
      }

      if (!updated) {
        result.raced += 1;
        logger.debug(
          { correlationId: rowCorrelationId, requestId, sessionId },
          'video-escalation-timeout-worker: UPDATE raced — row already resolved',
        );
        continue;
      }

      result.timedOut += 1;
      logger.info(
        { correlationId: rowCorrelationId, requestId, sessionId },
        'video-escalation-timeout-worker: request timed out (audit row closed)',
      );
      // No system-message emit — `video_escalation_timed_out` is in the
      // SystemEvent union but task-41 Notes #3 keeps it hidden from the
      // chat feed in v1 (patient-pressure doctrine). Doctor UI picks up
      // the UPDATE via the Postgres-changes Realtime channel.
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { correlationId: rowCorrelationId, requestId, sessionId, error: message },
        'video-escalation-timeout-worker: unexpected error processing row',
      );
      result.errors.push(message);
    }
  }

  logger.info(
    {
      correlationId,
      scanned: result.scanned,
      timedOut: result.timedOut,
      raced: result.raced,
      errors: result.errors.length,
    },
    'video-escalation-timeout-worker: tick complete',
  );

  return result;
}
