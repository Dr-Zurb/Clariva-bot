/**
 * Account-deletion cron driver (Plan 02 · Task 33)
 * ------------------------------------------------
 *
 * Runs nightly. Each tick:
 *
 *   1. SELECT pending audit rows whose `grace_window_until < now()` and
 *      that are neither finalized nor cancelled. The partial index
 *      `idx_account_deletion_audit_pending_finalize` (migration 054)
 *      keeps this scan O(pending).
 *
 *   2. For each pending row, call `finalizeAccountDeletion`. The
 *      worker is idempotent, so concurrent cron runs (or a retried
 *      request) don't duplicate work.
 *
 *   3. Aggregate the results into a job summary the cron route
 *      returns (useful for Render Cron logs + ops dashboards).
 *
 * Failure posture: a per-row exception is logged and the loop
 * continues. We do NOT rethrow on a single-row failure because one
 * patient's bad state should not block the rest of the batch. The
 * route layer returns `success: true` with a `failures` count in the
 * payload; operators alert on `failures > 0` in their cron dashboard.
 *
 * Scheduling: 02:30 IST daily is a reasonable default (off-peak;
 * after the existing payout cron at 02:00). The specific schedule is
 * configured in Render Cron / infra, not here — this module only
 * provides the job entry point.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-33-account-deletion-revocation-list.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { finalizeAccountDeletion } from './account-deletion-worker';

export interface AccountDeletionCronResult {
  scanned: number;
  finalized: number;
  skipped: number;
  failed: number;
  failedPatientIds: string[];
}

/**
 * One tick of the account-deletion cron. Safe to run concurrently
 * (finalize is idempotent); safe to re-run (already-finalized rows
 * return `executed: false` and contribute to the `skipped` bucket).
 */
export async function runAccountDeletionFinalizeJob(
  correlationId: string,
): Promise<AccountDeletionCronResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId },
      'account_deletion_cron_skipped_no_admin_client',
    );
    return {
      scanned: 0,
      finalized: 0,
      skipped: 0,
      failed: 0,
      failedPatientIds: [],
    };
  }

  const nowIso = new Date().toISOString();
  const { data: pending, error } = await admin
    .from('account_deletion_audit')
    .select('id, patient_id')
    .is('finalized_at', null)
    .is('cancelled_at', null)
    .lt('grace_window_until', nowIso);

  if (error) {
    logger.error(
      { correlationId, error: error.message },
      'account_deletion_cron_scan_failed',
    );
    return {
      scanned: 0,
      finalized: 0,
      skipped: 0,
      failed: 0,
      failedPatientIds: [],
    };
  }

  const rows = pending ?? [];
  let finalized = 0;
  let skipped = 0;
  let failed = 0;
  const failedPatientIds: string[] = [];

  for (const row of rows) {
    const patientId = row.patient_id as string;
    try {
      const result = await finalizeAccountDeletion({
        patientId,
        correlationId,
      });
      if (result.executed) {
        finalized += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      failedPatientIds.push(patientId);
      logger.error(
        {
          correlationId,
          patientId,
          error: err instanceof Error ? err.message : String(err),
        },
        'account_deletion_cron_row_failed',
      );
    }
  }

  logger.info(
    {
      correlationId,
      scanned: rows.length,
      finalized,
      skipped,
      failed,
    },
    'account_deletion_cron_complete',
  );

  return {
    scanned: rows.length,
    finalized,
    skipped,
    failed,
    failedPatientIds,
  };
}
