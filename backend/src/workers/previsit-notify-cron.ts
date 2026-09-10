/**
 * In-process cron for the previsit notify ladder (T−24h / T−30 / T−15 / T−5).
 *
 * Mirrors `opd-mode-notifications-cron` lifecycle: `startPrevisitNotifyWorker`
 * returns `{ stop, runOnce }` for graceful shutdown and tests.
 *
 * Default: on in production, off elsewhere unless
 * `PREVISIT_NOTIFY_WORKER_ENABLED=true`. Safe alongside Render Cron /
 * manual `POST /cron/consultation-checkin` — stage stamps are claim-first.
 *
 * @see backend/src/services/consultation-checkin-job.ts
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  runConsultationCheckinJob,
  type CheckinJobResult,
} from '../services/consultation-checkin-job';

const DEFAULT_INTERVAL_MS = 60_000;

export interface PrevisitNotifyWorkerHandle {
  stop: () => void;
  runOnce: (correlationId?: string) => Promise<CheckinJobResult>;
}

function emptyResult(): CheckinJobResult {
  const now = new Date().toISOString();
  return {
    ranAt: now,
    windowStart: now,
    windowEnd: now,
    candidatesFound: 0,
    notificationsFired: 0,
    errors: 0,
    byStage: {
      reminder_24h: 0,
      checkin_30: 0,
      nudge_15: 0,
      nudge_5: 0,
      starting_now: 0,
    },
  };
}

function isWorkerEnabled(): boolean {
  if (env.PREVISIT_NOTIFY_WORKER_ENABLED === true) return true;
  if (env.PREVISIT_NOTIFY_WORKER_ENABLED === false) return false;
  return env.NODE_ENV === 'production';
}

export function startPrevisitNotifyWorker(opts?: {
  intervalMs?: number;
}): PrevisitNotifyWorkerHandle {
  const intervalMs = Math.max(
    5_000,
    opts?.intervalMs ?? env.PREVISIT_NOTIFY_WORKER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS
  );

  if (!isWorkerEnabled()) {
    logger.info({ intervalMs }, 'previsit-notify-worker: disabled by env');
    return {
      stop: () => undefined,
      runOnce: async () => emptyResult(),
    };
  }

  let stopped = false;
  let tickInFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runTick = async (correlationId: string): Promise<CheckinJobResult> => {
    if (stopped) return emptyResult();
    if (tickInFlight) {
      logger.warn(
        { correlationId },
        'previsit-notify-worker: tick skipped (in flight)'
      );
      return emptyResult();
    }
    tickInFlight = true;
    try {
      return await runConsultationCheckinJob(correlationId);
    } finally {
      tickInFlight = false;
    }
  };

  const scheduledTick = (): void => {
    const correlationId = `previsit-notify-tick-${Date.now()}`;
    void runTick(correlationId).catch((err) => {
      logger.error(
        {
          correlationId,
          err: err instanceof Error ? err.message : String(err),
        },
        'previsit-notify-worker: tick threw unexpectedly'
      );
    });
  };

  logger.info({ intervalMs }, 'previsit-notify-worker: started');
  // First tick soon after boot so local smoke doesn't wait a full interval.
  const bootDelay = Math.min(2_000, intervalMs);
  const bootTimer = setTimeout(scheduledTick, bootDelay);
  if (typeof bootTimer.unref === 'function') {
    bootTimer.unref();
  }
  timer = setInterval(scheduledTick, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      clearTimeout(bootTimer);
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logger.info('previsit-notify-worker: stopped');
    },
    runOnce: (correlationId = `previsit-notify-runonce-${Date.now()}`) =>
      runTick(correlationId),
  };
}

export const __testInternals = {
  isWorkerEnabled,
  emptyResult,
};
