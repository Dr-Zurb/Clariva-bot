/**
 * Dashboard-events retention sweep (Alerts v2 · alr2-05 / ALR2-D8).
 *
 * Deletes **acknowledged** `doctor_dashboard_events` older than
 * `DASHBOARD_EVENTS_RETENTION_DAYS` (OQ-3 LOCKED: default 90). Promotes
 * the parked retention intent from migration 066 ("swept by a future
 * retention worker").
 *
 * Predicate (load-bearing — unread is sacred):
 *   `acknowledged_at IS NOT NULL AND acknowledged_at < now() - N days`
 *
 * Never deletes based on `created_at` alone. An old-but-unread alert
 * must survive.
 *
 * RLS: service-role admin client **bypasses RLS**. Migration 066
 * intentionally has no DELETE policy (doctor self-select/update only;
 * INSERT + DELETE are service-role). No policy change is required for
 * this sweep.
 *
 * Mounted at `POST /cron/dashboard-events-retention`. Schedule daily
 * (e.g. ~03:00 IST, after recording-archival at 02:45).
 *
 * @see backend/migrations/066_doctor_dashboard_events.sql
 * @see docs/Work/Daily-plans/July 2026/21-07-2026/alerts-v2/Tasks/task-alr2-05-retention-sweep-worker.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

/** Bound the delete statement so a backlog drain can't hold long locks. */
const BATCH_SIZE_CAP = 200;

export interface DashboardEventsRetentionJobResult {
  /** Retention window (days) used for this tick. */
  retentionDays: number;
  /** Candidate ids selected this tick (≤ BATCH_SIZE_CAP). */
  scanned: number;
  /** Rows successfully deleted. */
  deleted: number;
  /** 1 if the scan or delete failed hard; per-tick otherwise 0. */
  errors: number;
}

function emptyResult(retentionDays: number): DashboardEventsRetentionJobResult {
  return { retentionDays, scanned: 0, deleted: 0, errors: 0 };
}

/**
 * Delete a bounded batch of acknowledged dashboard events older than N days.
 * Safe under concurrent ticks (re-selecting the same ids is a no-op delete).
 */
export async function runDashboardEventsRetentionJob(
  correlationId: string,
): Promise<DashboardEventsRetentionJobResult> {
  const retentionDays = env.DASHBOARD_EVENTS_RETENTION_DAYS;
  const result = emptyResult(retentionDays);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'dashboard-events-retention: no admin client — tick skipped',
    );
    return result;
  }

  const cutoffIso = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows, error: scanErr } = await admin
    .from('doctor_dashboard_events')
    .select('id')
    .not('acknowledged_at', 'is', null)
    .lt('acknowledged_at', cutoffIso)
    .order('acknowledged_at', { ascending: true })
    .limit(BATCH_SIZE_CAP);

  if (scanErr) {
    logger.warn(
      { correlationId, error: scanErr.message, retentionDays, cutoffIso },
      'dashboard-events-retention: scan failed',
    );
    result.errors = 1;
    return result;
  }

  const ids = ((rows ?? []) as Array<{ id: string }>)
    .map((r) => r.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
  result.scanned = ids.length;

  if (ids.length === 0) {
    logger.info(
      { correlationId, ...result, cutoffIso },
      'dashboard-events-retention: tick complete (nothing to delete)',
    );
    return result;
  }

  const { error: delErr, count } = await admin
    .from('doctor_dashboard_events')
    .delete({ count: 'exact' })
    .in('id', ids);

  if (delErr) {
    logger.warn(
      {
        correlationId,
        error: delErr.message,
        candidateCount: ids.length,
        retentionDays,
        cutoffIso,
      },
      'dashboard-events-retention: delete failed',
    );
    result.errors = 1;
    return result;
  }

  // Prefer the exact count when PostgREST returns it; fall back to the
  // selected batch size (all ids matched the predicate at select time).
  result.deleted = typeof count === 'number' ? count : ids.length;

  logger.info(
    { correlationId, ...result, cutoffIso },
    'dashboard-events-retention: tick complete',
  );
  return result;
}

/** @internal — tests only. */
export const __testInternals = {
  BATCH_SIZE_CAP,
};
