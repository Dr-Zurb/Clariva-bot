/**
 * Refreshes stored Instagram numbers once an hour.
 * Off in NODE_ENV=test. The Analytics tab does not call Instagram itself.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { runSocialInsightsJob } from '../services/social-insights-service';

const INTERVAL_MS = 60 * 60 * 1000;
const FIRST_TICK_MS = 30_000;

export interface SocialInsightsWorkerHandle {
  stop: () => void;
}

function isWorkerEnabled(): boolean {
  return env.NODE_ENV !== 'test';
}

export function startSocialInsightsWorker(): SocialInsightsWorkerHandle {
  if (!isWorkerEnabled()) {
    return { stop: () => undefined };
  }

  let stopped = false;
  let tickInFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const scheduledTick = (): void => {
    if (stopped || tickInFlight) return;
    tickInFlight = true;
    const correlationId = `social-insights-${Date.now()}`;
    void runSocialInsightsJob(correlationId)
      .catch(() => {
        logger.warn({ correlationId }, 'social insights: tick skipped');
      })
      .finally(() => {
        tickInFlight = false;
      });
  };

  logger.info({ intervalMs: INTERVAL_MS }, 'social insights: started');
  const bootTimer = setTimeout(scheduledTick, FIRST_TICK_MS);
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
