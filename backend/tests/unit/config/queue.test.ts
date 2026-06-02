/**
 * Unit tests for webhook queue configuration (Task 6: 5.1–5.4 verification).
 *
 * Tests queue setup when REDIS_URL is not set (placeholder path):
 * - isQueueEnabled, WEBHOOK_QUEUE_NAME, getWebhookQueue, webhookQueue.add
 *
 * Full Redis/worker tests (connection, worker process, retry, dead letter)
 * are covered in e-task-7 integration tests.
 */

import {
  isQueueEnabled,
  getWebhookQueue,
  WEBHOOK_QUEUE_NAME,
  webhookQueue,
  DEFAULT_JOB_OPTIONS,
} from '../../../src/config/queue';
import type { WebhookJobData } from '../../../src/types/queue';

// Mock env so REDIS_URL is unset -> placeholder queue (no Redis required)
jest.mock('../../../src/config/env', () => ({
  env: {
    REDIS_URL: '',
    WEBHOOK_WORKER_CONCURRENCY: 5,
  },
}));

// Mock logger to avoid log noise
jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

describe('Queue configuration (webhook-processing)', () => {
  describe('5.1 Queue setup (placeholder when REDIS_URL unset)', () => {
    it('5.1.1 isQueueEnabled returns false when REDIS_URL is not set', () => {
      expect(isQueueEnabled()).toBe(false);
    });

    it('5.1.2 queue name is webhook-processing', () => {
      expect(WEBHOOK_QUEUE_NAME).toBe('webhook-processing');
    });

    it('5.1.3 getWebhookQueue returns placeholder (object with add) when disabled', () => {
      const queue = getWebhookQueue();
      expect(queue).toBeDefined();
      expect(typeof (queue as { add?: unknown }).add).toBe('function');
    });
  });

  describe('5.2 Webhook processing (placeholder add)', () => {
    it('5.2.1 webhookQueue.add does not throw and accepts valid job data', async () => {
      const jobData: WebhookJobData = {
        eventId: 'evt-test-1',
        provider: 'instagram',
        payload: { object: 'instagram', entry: [] },
        correlationId: 'corr-test-1',
      };
      await expect(webhookQueue.add('processInstagramWebhook', jobData)).resolves.not.toThrow();
    });
  });

  describe('5.4 Error handling', () => {
    it('5.4.2 getWebhookQueue does not throw when REDIS_URL unset', () => {
      expect(() => getWebhookQueue()).not.toThrow();
    });
  });

  describe('3.3.3 / 4.1.2–4.1.3 Retry logic (attempts, exponential backoff)', () => {
    it('4.1.2 DEFAULT_JOB_OPTIONS has 3 retry attempts', () => {
      expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    });

    it('4.1.3 DEFAULT_JOB_OPTIONS has exponential backoff (1 min initial delay)', () => {
      expect(DEFAULT_JOB_OPTIONS.backoff).toBeDefined();
      expect(DEFAULT_JOB_OPTIONS.backoff?.type).toBe('exponential');
      expect(DEFAULT_JOB_OPTIONS.backoff?.delay).toBe(60_000);
    });
  });
});
