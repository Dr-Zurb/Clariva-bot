/**
 * Recording-archival cron driver (Plan 02 · Task 34)
 * --------------------------------------------------
 *
 * Runs nightly. Each tick runs both phases of the archival worker:
 *
 *   1. `runHidePhase`         — flips `patient_self_serve_visible` on
 *                               artifacts past their 90-day TTL. Always
 *                               real (non-dry-run) — reversible.
 *
 *   2. `runHardDeletePhase`   — hard-deletes artifacts past the
 *                               regulatory retention window.
 *                               **Gated by `ARCHIVAL_HARD_DELETE_ENABLED`.**
 *                               When unset / 'false' (default), runs in
 *                               dry-run mode only: scans + logs, no
 *                               mutation.
 *
 * Failure posture:
 *
 *   * The hide phase and delete phase are independent — a delete-phase
 *     failure must not skip the hide phase on the next tick (and vice
 *     versa). We call them sequentially and catch each separately.
 *
 *   * Per-row failures are logged by the worker itself (not here) and
 *     counted in the phase's return payload. The cron returns HTTP 200
 *     with the totals so Render Cron doesn't spam failure alerts on
 *     individual bad rows; ops dashboards alert on `hideCandidates > 0
 *     && hidden == 0` or `deleteCandidates > 0 && deleted == 0`.
 *
 * Scheduling: 02:45 IST is a reasonable default (off-peak, after
 * payouts at 02:00 and account-deletion-finalize at 02:30). The
 * specific schedule is configured in infra (Render Cron), not here.
 *
 * ## Env-flag flip ritual
 *
 * Per task-34 Note 3, production ships with
 * `ARCHIVAL_HARD_DELETE_ENABLED=false` for the first 30 days
 * post-deploy. During that window, the hard-delete phase emits dry-run
 * logs every night; ops reviews them via the admin-preview API. Once
 * the dry-run output has been stable and the seed policy values have
 * been legal-reviewed, ops flips the env var to `'true'` and the worker
 * starts actually deleting. Rollback: set back to `'false'`.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-34-regulatory-retention-policy-and-archival-worker.md
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { runHardDeletePhase, runHidePhase } from './recording-archival-worker';

export interface RecordingArchivalCronResult {
  hidePhase: { candidates: number; hidden: number; error?: string };
  deletePhase: {
    candidates: number;
    deleted: number;
    bytesFreed: number;
    dryRun: boolean;
    error?: string;
  };
}

export async function runRecordingArchivalJob(
  correlationId: string,
): Promise<RecordingArchivalCronResult> {
  const hardDeleteEnabled = env.ARCHIVAL_HARD_DELETE_ENABLED === true;

  const result: RecordingArchivalCronResult = {
    hidePhase: { candidates: 0, hidden: 0 },
    deletePhase: {
      candidates: 0,
      deleted: 0,
      bytesFreed: 0,
      dryRun: !hardDeleteEnabled,
    },
  };

  // Phase 1 — hide. Always real. Never dry-run. Reversible anyway.
  try {
    const hide = await runHidePhase({
      dryRun: false,
      correlationId,
    });
    result.hidePhase = { candidates: hide.candidates, hidden: hide.hidden };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, error: msg },
      'recording_archival_cron_hide_phase_failed',
    );
    result.hidePhase = { candidates: 0, hidden: 0, error: msg };
  }

  // Phase 2 — delete. Dry-run unless the env flag is flipped.
  try {
    const del = await runHardDeletePhase({
      dryRun: !hardDeleteEnabled,
      correlationId,
    });
    result.deletePhase = {
      candidates: del.candidates,
      deleted: del.deleted,
      bytesFreed: del.bytesFreed,
      dryRun: !hardDeleteEnabled,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId, error: msg },
      'recording_archival_cron_delete_phase_failed',
    );
    result.deletePhase = {
      candidates: 0,
      deleted: 0,
      bytesFreed: 0,
      dryRun: !hardDeleteEnabled,
      error: msg,
    };
  }

  logger.info(
    {
      correlationId,
      hardDeleteEnabled,
      hidePhase: result.hidePhase,
      deletePhase: result.deletePhase,
    },
    'recording_archival_cron_complete',
  );

  return result;
}
