/**
 * Safety sweep for the two video-escalation durable jobs:
 * consent-window timeout and grant expiry (rec-22 / rec-27).
 *
 * An in-process timer fires at the exact deadline. This sweep is the
 * restart path: the first tick is 2s after boot, then every 60s, and it
 * still sees `grant_expires_at` if the timer was lost. Concurrent HTTP
 * `/cron/*` ticks are safe (atomic stamps).
 *
 * Unset `VIDEO_ESCALATION_WORKER_ENABLED` is on in production only, so a
 * local dev server does not scan Supabase. POST /cron/video-* still runs.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { runVideoEscalationTimeoutJob } from './video-escalation-timeout-worker';
import { runVideoGrantExpiryJob } from './video-grant-expiry-worker';

const INTERVAL_MS = 60_000;

export interface VideoEscalationPollHandle {
  stop: () => void;
  runOnce: (correlationId?: string) => Promise<void>;
}

function isWorkerEnabled(): boolean {
  if (env.VIDEO_ESCALATION_WORKER_ENABLED === true) return true;
  if (env.VIDEO_ESCALATION_WORKER_ENABLED === false) return false;
  return env.NODE_ENV === 'production';
}

export function startVideoEscalationPollWorker(): VideoEscalationPollHandle {
  if (!isWorkerEnabled()) {
    logger.info('video-escalation-poll: disabled by env');
    return {
      stop: () => undefined,
      runOnce: async () => undefined,
    };
  }

  let stopped = false;
  let tickInFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runTick = async (correlationId: string): Promise<void> => {
    if (stopped) return;
    if (tickInFlight) {
      logger.warn({ correlationId }, 'video-escalation-poll: tick skipped (in flight)');
      return;
    }
    tickInFlight = true;
    try {
      await runVideoEscalationTimeoutJob(`${correlationId}-timeout`);
      await runVideoGrantExpiryJob(`${correlationId}-grant`);
    } finally {
      tickInFlight = false;
    }
  };

  const scheduledTick = (): void => {
    const correlationId = `video-escalation-poll-${Date.now()}`;
    void runTick(correlationId).catch((err) => {
      logger.error(
        {
          correlationId,
          err: err instanceof Error ? err.message : String(err),
        },
        'video-escalation-poll: tick threw unexpectedly',
      );
    });
  };

  logger.info({ intervalMs: INTERVAL_MS }, 'video-escalation-poll: started');
  const bootTimer = setTimeout(scheduledTick, 2_000);
  if (typeof bootTimer.unref === 'function') bootTimer.unref();
  timer = setInterval(scheduledTick, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      clearTimeout(bootTimer);
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logger.info('video-escalation-poll: stopped');
    },
    runOnce: (correlationId = `video-escalation-poll-runonce-${Date.now()}`) =>
      runTick(correlationId),
  };
}

export const __testInternals = { isWorkerEnabled, INTERVAL_MS };
