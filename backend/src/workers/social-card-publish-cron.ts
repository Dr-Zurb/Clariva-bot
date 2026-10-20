/**
 * Wakes the scheduled Instagram send every minute.
 * The job itself reads due Ready cards. A restart still sees scheduled_at.
 * Off in NODE_ENV=test. Safe next to POST /cron/social-card-publish.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { runSocialCardPublishJob } from '../services/social-card-publish-service';

const INTERVAL_MS = 60_000;

export interface SocialCardPublishWorkerHandle {
  stop: () => void;
}

function isWorkerEnabled(): boolean {
  return env.NODE_ENV !== 'test';
}

export function startSocialCardPublishWorker(): SocialCardPublishWorkerHandle {
  if (!isWorkerEnabled()) {
    return { stop: () => undefined };
  }

  let stopped = false;
  let tickInFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const scheduledTick = (): void => {
    if (stopped || tickInFlight) return;
    tickInFlight = true;
    const correlationId = `social-card-publish-${Date.now()}`;
    void runSocialCardPublishJob(correlationId)
      .catch((err: unknown) => {
        logger.error(
          { correlationId, err: err instanceof Error ? err.message : String(err) },
          'social card publish: tick threw'
        );
      })
      .finally(() => {
        tickInFlight = false;
      });
  };

  logger.info({ intervalMs: INTERVAL_MS }, 'social card publish: started');
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
    },
  };
}
