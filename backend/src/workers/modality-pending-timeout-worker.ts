/**
 * Modality-change pending-timeout worker (Plan 09 · Task 47).
 *
 * Polling worker that closes `modality_change_pending_requests` rows
 * whose approval / consent window has elapsed without a counter-party
 * response. Mirrors `video-escalation-timeout-worker.ts` shape — a
 * single `runModalityPendingTimeoutJob(correlationId)` export hooked
 * into `routes/cron.ts`.
 *
 * **Why DB-polling and not setTimeout:**
 *   · Pod crash / restart would lose an in-process timer; the pending
 *     row would sit `response IS NULL` forever, the state machine's
 *     Step 7 "is there a pending request?" guard would reject all
 *     future requests for the session, and the counter-party UI
 *     would never collapse its modal.
 *   · Two pods running the worker concurrently is safe: the atomic
 *     UPDATE uses `response IS NULL` as a predicate so only one
 *     UPDATE actually lands. The other pod's UPDATE returns 0 rows
 *     and the tick is a no-op.
 *   · 5s polling fuzz (worst case 95s wall time on a 90s window) is
 *     acceptable — task-47 Notes doctrine inherited from Plan 08 Task
 *     41.
 *
 * **Race with a fast counter-party:**
 *   Doctor clicks Approve at 89.5s; worker tick lands at 90.0s. The
 *   state-machine's approve path has the same `response IS NULL` guard;
 *   whichever UPDATE evaluates the predicate first wins. The loser
 *   sees 0 rows returned and treats it as a no-op. Unit test pins
 *   this race.
 *
 * **Realtime fan-out:** none here. Clients subscribe to Postgres-changes
 * on `modality_change_pending_requests` UPDATE (RLS participant-scoped
 * SELECT policy in Migration 076); the service-role UPDATE this worker
 * performs fires that channel automatically. Both the patient / doctor
 * modals collapse correctly without the worker publishing custom
 * events.
 *
 * @see backend/src/services/modality-change-service.ts
 * @see backend/migrations/076_modality_change_pending_requests.sql
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { fetchExpiredPendingRequests, resolvePendingRequest } from '../services/modality-pending-requests-queries';

// ============================================================================
// Constants
// ============================================================================

/**
 * Cap per tick so a backlog after a cron outage doesn't starve the
 * worker on a single pod. 100 is overkill for steady-state (most ticks
 * process 0-1 rows) but keeps the worker correct under backlog.
 */
const BATCH_SIZE_CAP = 100;

// ============================================================================
// Public result shape
// ============================================================================

export interface ModalityPendingTimeoutJobResult {
  /** How many pending-expired rows we scanned. */
  scanned:   number;
  /** How many rows this tick actually flipped to 'timeout'. */
  timedOut:  number;
  /** How many UPDATEs returned 0 rows (race with a counter-party response
   *  or another pod already claimed it). Expected ≥0 in healthy state. */
  raced:     number;
  errors:    string[];
}

// ============================================================================
// Public: runModalityPendingTimeoutJob
// ============================================================================

export async function runModalityPendingTimeoutJob(
  correlationId: string,
): Promise<ModalityPendingTimeoutJobResult> {
  const result: ModalityPendingTimeoutJobResult = {
    scanned:  0,
    timedOut: 0,
    raced:    0,
    errors:   [],
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'modality-pending-timeout-worker: no admin client — tick skipped',
    );
    return result;
  }

  const cutoffIso = new Date().toISOString();
  let expiredRows;
  try {
    expiredRows = await fetchExpiredPendingRequests(admin, cutoffIso, BATCH_SIZE_CAP);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, error: message },
      'modality-pending-timeout-worker: scan query failed',
    );
    result.errors.push(message);
    return result;
  }

  if (expiredRows.length === 0) {
    logger.debug(
      { correlationId },
      'modality-pending-timeout-worker: no expired pending rows',
    );
    return result;
  }

  result.scanned = expiredRows.length;

  for (const row of expiredRows) {
    const rowCorrelationId = row.correlationId ?? correlationId;
    try {
      const resolved = await resolvePendingRequest(admin, {
        id:          row.id,
        response:    'timeout',
        respondedAt: new Date().toISOString(),
      });
      if (!resolved) {
        result.raced += 1;
        logger.debug(
          { correlationId: rowCorrelationId, pendingId: row.id, sessionId: row.sessionId },
          'modality-pending-timeout-worker: UPDATE raced — row already resolved',
        );
        continue;
      }
      result.timedOut += 1;
      logger.info(
        {
          correlationId: rowCorrelationId,
          pendingId: row.id,
          sessionId: row.sessionId,
          initiatedBy: row.initiatedBy,
        },
        'modality-pending-timeout-worker: pending request timed out (row closed)',
      );
      // No system-message emit on timeout — matches Plan 08 Task 41
      // doctrine (patient-pressure: don't shame the counter-party in
      // chat for missing a 60s/90s window). The UPDATE fires the
      // Realtime channel; UI closes the modal.
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          correlationId: rowCorrelationId,
          pendingId: row.id,
          sessionId: row.sessionId,
          error: message,
        },
        'modality-pending-timeout-worker: unexpected error processing row',
      );
      result.errors.push(message);
    }
  }

  logger.info(
    {
      correlationId,
      scanned:  result.scanned,
      timedOut: result.timedOut,
      raced:    result.raced,
      errors:   result.errors.length,
    },
    'modality-pending-timeout-worker: tick complete',
  );

  return result;
}
