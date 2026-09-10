/**
 * In-process 5s poll for the two video-escalation durable jobs:
 * consent-window timeout and grant expiry (rec-22 / rec-27).
 *
 * The jobs themselves are DB-polling; this interval only *wakes* them.
 * A pod restart does not leave video recording — the next tick still
 * sees `grant_expires_at`. Concurrent HTTP `/cron/*` ticks are safe
 * (atomic stamps). Off in `NODE_ENV=test`.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { runVideoEscalationTimeoutJob } from './video-escalation-timeout-worker';
import { runVideoGrantExpiryJob } from './video-grant-expiry-worker';

const INTERVAL_MS = 5_000;

export interface VideoEscalationPollHandle {
  stop: () => void;
  runOnce: (correlationId?: string) => Promise<void>;
}

function isWorkerEnabled(): boolean {
  return env.NODE_ENV !== 'test';
}

export function startVideoEscalationPollWorker(): VideoEscalationPollHandle {
  if (!isWorkerEnabled()) {
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
