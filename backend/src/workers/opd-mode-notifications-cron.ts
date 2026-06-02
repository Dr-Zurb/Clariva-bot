/**
 * In-process 60s cron for debounced OPD mode-change patient notifications (pdm-06).
 *
 * Mirrors `auto-no-show-worker` lifecycle: `startOpdModeNotificationsWorker`
 * returns `{ stop, runOnce }` for graceful shutdown and tests.
 *
 * @see backend/src/services/opd/opd-mode-notifications-service.ts
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { drainOpdPendingModeNotifications } from '../services/opd/opd-mode-notifications-service';

const DEFAULT_INTERVAL_MS = 60 * 1000;

export interface OpdModeNotificationsWorkerHandle {
  stop: () => void;
  runOnce: (correlationId?: string) => Promise<{ dispatched: number; skipped: number }>;
}

function isWorkerEnabled(): boolean {
  if (env.OPD_MODE_NOTIFICATIONS_WORKER_ENABLED === true) return true;
  if (env.OPD_MODE_NOTIFICATIONS_WORKER_ENABLED === false) return false;
  return env.NODE_ENV === 'production';
}

export async function runOpdModeNotificationsCron(
  correlationId = `opd-mode-notifications-${Date.now()}`
): Promise<{ dispatched: number; skipped: number }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    logger.warn({ correlationId }, 'opd_mode_notifications_cron_skipped_no_admin');
    return { dispatched: 0, skipped: 0 };
  }
  try {
    const summary = await drainOpdPendingModeNotifications(supabase);
    if (summary.dispatched > 0 || summary.skipped > 0) {
      logger.info(
        {
          correlationId,
          dispatched: summary.dispatched,
          skipped: summary.skipped,
        },
        'opd_mode_notifications_cron_complete'
      );
    }
    return summary;
  } catch (err) {
    logger.error(
      {
        correlationId,
        err: err instanceof Error ? err.message : String(err),
      },
      'opd_mode_notifications_cron_failed'
    );
    return { dispatched: 0, skipped: 0 };
  }
}

export function startOpdModeNotificationsWorker(opts?: {
  intervalMs?: number;
  getAdminClient?: typeof getSupabaseAdminClient;
}): OpdModeNotificationsWorkerHandle {
  const intervalMs = Math.max(1_000, opts?.intervalMs ?? DEFAULT_INTERVAL_MS);

  if (!isWorkerEnabled()) {
    logger.info({ intervalMs }, 'opd-mode-notifications-worker: disabled by env');
    return {
      stop: () => undefined,
      runOnce: async () => ({ dispatched: 0, skipped: 0 }),
    };
  }

  let stopped = false;
  let tickInFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runTick = async (correlationId: string) => {
    if (stopped) return { dispatched: 0, skipped: 0 };
    if (tickInFlight) {
      logger.warn({ correlationId }, 'opd-mode-notifications-worker: tick skipped (in flight)');
      return { dispatched: 0, skipped: 0 };
    }
    tickInFlight = true;
    try {
      return await runOpdModeNotificationsCron(correlationId);
    } finally {
      tickInFlight = false;
    }
  };

  const scheduledTick = (): void => {
    const correlationId = `opd-mode-notifications-tick-${Date.now()}`;
    void runTick(correlationId).catch((err) => {
      logger.error(
        { correlationId, err: err instanceof Error ? err.message : String(err) },
        'opd-mode-notifications-worker: tick threw unexpectedly'
      );
    });
  };

  logger.info({ intervalMs }, 'opd-mode-notifications-worker: started');
  timer = setInterval(scheduledTick, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logger.info('opd-mode-notifications-worker: stopped');
    },
    runOnce: (correlationId = `opd-mode-notifications-runonce-${Date.now()}`) =>
      runTick(correlationId),
  };
}
