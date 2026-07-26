/**
 * Instagram token health sweep (ilr-04).
 *
 * Proactively re-checks Meta `debug_token` for connected doctors so expiry /
 * invalid tokens surface without waiting for a doctor to open Settings.
 * When reconnect is newly recommended, emails the doctor (transition-only
 * dedupe — no daily spam while stuck in warning/error).
 *
 * Page-token Graph refresh is not implemented in v1 (reconnect UX); health
 * nudge is the load-bearing control against silent 60-day acquisition death.
 *
 * Mounted at `POST /cron/instagram-token-health`. Schedule daily.
 *
 * @see docs/Work/Daily-plans/July 2026/25-07-2026/instagram-launch-readiness/p1-launch-critical/Tasks/task-ilr-04-token-lifecycle-health-sweep.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  forceRefreshInstagramHealth,
  type InstagramHealthSummary,
} from '../services/instagram-connect-service';
import { sendInstagramReconnectNudgeToDoctor } from '../services/notification-service';

/** Bound Meta API calls per tick. */
const BATCH_SIZE_CAP = 25;

export interface InstagramTokenHealthJobResult {
  scanned: number;
  refreshed: number;
  nudged: number;
  errors: number;
}

function emptyResult(): InstagramTokenHealthJobResult {
  return { scanned: 0, refreshed: 0, nudged: 0, errors: 0 };
}

function shouldNudgeReconnect(
  previousLevel: string | null,
  health: InstagramHealthSummary
): boolean {
  if (!health.reconnectRecommended) return false;
  // Transition into reconnect-needed, or escalate warning → error.
  if (
    previousLevel === 'ok' ||
    previousLevel === 'unknown' ||
    previousLevel == null ||
    previousLevel === ''
  ) {
    return true;
  }
  if (health.level === 'error' && previousLevel === 'warning') {
    return true;
  }
  return false;
}

/**
 * Refresh Instagram token health for a bounded batch of connected doctors.
 * Emails on transition into reconnectRecommended (OQ-2: email; dashboard
 * already surfaces health on Settings → Instagram).
 */
export async function runInstagramTokenHealthJob(
  correlationId: string
): Promise<InstagramTokenHealthJobResult> {
  const result = emptyResult();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'instagram-token-health: no admin client — tick skipped'
    );
    return result;
  }

  const { data: rows, error: scanErr } = await admin
    .from('doctor_instagram')
    .select('doctor_id, instagram_health_level')
    .not('instagram_access_token', 'is', null)
    .order('instagram_health_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE_CAP);

  if (scanErr) {
    logger.error(
      { correlationId, message: scanErr.message },
      'instagram-token-health: scan failed'
    );
    result.errors = 1;
    return result;
  }

  const list = rows ?? [];
  result.scanned = list.length;

  for (const row of list) {
    const doctorId = row.doctor_id as string;
    const previousLevel = (row.instagram_health_level as string | null) ?? null;
    try {
      const health = await forceRefreshInstagramHealth(doctorId, correlationId);
      if (!health) {
        result.errors += 1;
        continue;
      }
      result.refreshed += 1;

      if (shouldNudgeReconnect(previousLevel, health)) {
        const sent = await sendInstagramReconnectNudgeToDoctor(
          doctorId,
          health.message,
          correlationId
        );
        if (sent) result.nudged += 1;
      }
    } catch (err: unknown) {
      result.errors += 1;
      logger.warn(
        {
          correlationId,
          doctorId,
          message: err instanceof Error ? err.message : 'refresh failed',
        },
        'instagram-token-health: per-doctor refresh failed'
      );
    }
  }

  logger.info(
    {
      correlationId,
      scanned: result.scanned,
      refreshed: result.refreshed,
      nudged: result.nudged,
      errors: result.errors,
      batchCap: BATCH_SIZE_CAP,
      warnDays: 7,
    },
    'instagram-token-health: tick complete'
  );

  return result;
}

/** Test-only export. */
export const __test = {
  shouldNudgeReconnect,
  BATCH_SIZE_CAP,
};
