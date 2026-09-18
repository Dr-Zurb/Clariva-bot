/**
 * Unit tests for `workers/previsit-notify-cron.ts`.
 *
 * Pins enable/disable + tick-in-flight behaviour; job body is covered by
 * consultation-checkin / stage-resolver tests.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

type JobResult = {
  ranAt: string;
  windowStart: string;
  windowEnd: string;
  candidatesFound: number;
  notificationsFired: number;
  errors: number;
  byStage: Record<string, number>;
};

const mockRunJob = jest.fn<(correlationId: string) => Promise<JobResult>>();

jest.mock('../../../src/services/consultation-checkin-job', () => ({
  runConsultationCheckinJob: (correlationId: string) => mockRunJob(correlationId),
}));

const mockEnv: {
  NODE_ENV: string;
  PREVISIT_NOTIFY_WORKER_ENABLED: boolean | undefined;
  PREVISIT_NOTIFY_WORKER_INTERVAL_MS: number;
} = {
  NODE_ENV: 'test',
  PREVISIT_NOTIFY_WORKER_ENABLED: undefined,
  PREVISIT_NOTIFY_WORKER_INTERVAL_MS: 60_000,
};

jest.mock('../../../src/config/env', () => ({
  env: mockEnv,
}));

import {
  startPrevisitNotifyWorker,
  __testInternals,
} from '../../../src/workers/previsit-notify-cron';

describe('previsit-notify-cron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.NODE_ENV = 'test';
    mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = undefined;
    mockEnv.PREVISIT_NOTIFY_WORKER_INTERVAL_MS = 60_000;
    mockRunJob.mockResolvedValue({
      ranAt: '2026-08-12T12:00:00.000Z',
      windowStart: '2026-08-12T12:00:00.000Z',
      windowEnd: '2026-08-13T12:00:00.000Z',
      candidatesFound: 1,
      notificationsFired: 1,
      errors: 0,
      byStage: {
        reminder_24h: 0,
        checkin_30: 1,
        nudge_15: 0,
        nudge_5: 0,
        starting_now: 0,
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isWorkerEnabled', () => {
    it('defaults off outside production when unset', () => {
      mockEnv.NODE_ENV = 'development';
      mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = undefined;
      expect(__testInternals.isWorkerEnabled()).toBe(false);
    });

    it('defaults on in production when unset', () => {
      mockEnv.NODE_ENV = 'production';
      mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = undefined;
      expect(__testInternals.isWorkerEnabled()).toBe(true);
    });

    it('honours explicit true in development', () => {
      mockEnv.NODE_ENV = 'development';
      mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = true;
      expect(__testInternals.isWorkerEnabled()).toBe(true);
    });

    it('honours explicit false in production', () => {
      mockEnv.NODE_ENV = 'production';
      mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = false;
      expect(__testInternals.isWorkerEnabled()).toBe(false);
    });
  });

  describe('startPrevisitNotifyWorker', () => {
    it('returns a no-op handle when disabled', async () => {
      mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = false;
      const handle = startPrevisitNotifyWorker({ intervalMs: 60_000 });
      const result = await handle.runOnce('test-cid');
      expect(result.notificationsFired).toBe(0);
      expect(mockRunJob).not.toHaveBeenCalled();
      handle.stop();
    });

    it('runOnce invokes the check-in job when enabled', async () => {
      mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = true;
      const handle = startPrevisitNotifyWorker({ intervalMs: 60_000 });
      const result = await handle.runOnce('test-cid');
      expect(mockRunJob).toHaveBeenCalledWith('test-cid');
      expect(result.notificationsFired).toBe(1);
      handle.stop();
    });

    it('skips overlapping ticks while one is in flight', async () => {
      mockEnv.PREVISIT_NOTIFY_WORKER_ENABLED = true;
      let resolveJob!: (v: JobResult) => void;
      mockRunJob.mockImplementation(
        () =>
          new Promise<JobResult>((resolve) => {
            resolveJob = resolve;
          })
      );

      const handle = startPrevisitNotifyWorker({ intervalMs: 60_000 });
      const first = handle.runOnce('first');
      const second = await handle.runOnce('second');

      expect(second.candidatesFound).toBe(0);
      expect(mockRunJob).toHaveBeenCalledTimes(1);

      resolveJob({
        ranAt: 'x',
        windowStart: 'x',
        windowEnd: 'x',
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
      });
      await first;
      handle.stop();
    });
  });
});
