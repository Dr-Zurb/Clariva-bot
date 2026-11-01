/**
 * Wakes the scheduled Instagram send every minute.
 * The job itself reads due Ready cards. A restart still sees scheduled_at.
 * Unset `SOCIAL_CARD_PUBLISH_WORKER_ENABLED` is on in production only.
 * POST /cron/social-card-publish still runs the job.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { runSocialCardPublishJob } from '../services/social-card-publish-service';

const INTERVAL_MS = 60_000;

export interface SocialCardPublishWorkerHandle {
  stop: () => void;
}

function isWorkerEnabled(): boolean {
  if (env.SOCIAL_CARD_PUBLISH_WORKER_ENABLED === true) return true;
  if (env.SOCIAL_CARD_PUBLISH_WORKER_ENABLED === false) return false;
  return env.NODE_ENV === 'production';
}

export function startSocialCardPublishWorker(): SocialCardPublishWorkerHandle {
  if (!isWorkerEnabled()) {
    logger.info('social card publish: disabled by env');
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

export const __testInternals = { isWorkerEnabled };
