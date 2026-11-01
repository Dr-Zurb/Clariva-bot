/**
 * Fires the two video-escalation jobs at a consent or grant deadline.
 *
 * The 60s poll remains the restart path: this timer lives only in the
 * process that stamped the row. A lost timer does not leave recording on;
 * the sweep still sees `grant_expires_at` / a pending consent row.
 *
 * Same enable flag as the poll. Off in test and in local dev unless
 * `VIDEO_ESCALATION_WORKER_ENABLED=true`. Does not import the escalation
 * service (that service calls this module).
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { runVideoEscalationTimeoutJob } from './video-escalation-timeout-worker';
import { runVideoGrantExpiryJob } from './video-grant-expiry-worker';

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function workerEnabled(): boolean {
  if (env.VIDEO_ESCALATION_WORKER_ENABLED === true) return true;
  if (env.VIDEO_ESCALATION_WORKER_ENABLED === false) return false;
  return env.NODE_ENV === 'production';
}

export function scheduleVideoEscalationWake(key: string, deadlineIso: string): void {
  if (!workerEnabled()) return;
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(deadlineMs)) return;

  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  const delay = Math.max(0, deadlineMs - Date.now());
  const timer = setTimeout(() => {
    timers.delete(key);
    const correlationId = `video-escalation-wake-${key}-${Date.now()}`;
    void (async (): Promise<void> => {
      try {
        await runVideoEscalationTimeoutJob(`${correlationId}-timeout`);
        await runVideoGrantExpiryJob(`${correlationId}-grant`);
      } catch (err) {
        logger.error(
          {
            correlationId,
            err: err instanceof Error ? err.message : String(err),
          },
          'video-escalation-wake: tick threw',
        );
      }
    })();
  }, delay);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(key, timer);
}

/** @internal Drop pending timers between tests. */
export function clearVideoEscalationWakesForTests(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
