/**
 * Webhook Queue Configuration
 *
 * BullMQ queue for async webhook processing.
 * When REDIS_URL is set, uses real BullMQ; otherwise placeholder (log only).
 *
 * IMPORTANT:
 * - NEVER log payload content (contains PII/PHI)
 * - Retry: 3 attempts, exponential backoff (1 min initial per WEBHOOKS.md)
 * - Queue name: webhook-processing (same as worker)
 *
 * @see WEBHOOKS.md - Async processing, retry strategy
 * @see types/queue.ts - WebhookJobData
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import { logger } from './logger';
import type { WebhookJobData } from '../types/queue';

// ============================================================================
// Constants
// ============================================================================

export const WEBHOOK_QUEUE_NAME = 'webhook-processing';

/** Default job options: 3 attempts, exponential backoff (1 min initial). Exported for tests (Task 7 §3.3.3). */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 60_000, // 1 minute (WEBHOOKS.md: first retry 1 min)
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: false, // Keep failed jobs for dead-letter handling
};

// ============================================================================
// Redis Connection (when REDIS_URL set)
// ============================================================================

let redisConnection: IORedis | null = null;
let queueInstance: Queue<WebhookJobData> | null = null;

/**
 * Whether the real queue is enabled (REDIS_URL set and valid).
 */
export function isQueueEnabled(): boolean {
  const url = env.REDIS_URL?.trim();
  return !!url && url.length > 0;
}

/**
 * Get Redis connection for worker. Only valid when isQueueEnabled() is true.
 * Caller must not close this connection (shared by queue and worker).
 */
export function getQueueConnection(): IORedis | null {
  return redisConnection;
}

/**
 * Create Redis connection from REDIS_URL.
 * Used by both Queue and Worker.
 */
function createConnection(): IORedis {
  const url = env.REDIS_URL?.trim();
  if (!url) {
    throw new Error('REDIS_URL is required for queue connection');
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  });
}

// ============================================================================
// Queue Instance (real or placeholder)
// ============================================================================

/**
 * Placeholder queue when REDIS_URL is not set.
 * Logs only; no jobs are processed.
 */
const placeholderQueue = {
  async add(jobName: string, jobData: WebhookJobData): Promise<void> {
    logger.info(
      {
        jobName,
        eventId: jobData.eventId,
        provider: jobData.provider,
        correlationId: jobData.correlationId,
      },
      'Webhook queued for processing (placeholder - REDIS_URL not set)'
    );
  },
};

/**
 * Get the webhook queue instance (real BullMQ or placeholder).
 * Use this for adding jobs from the controller.
 */
export function getWebhookQueue(): Queue<WebhookJobData> | typeof placeholderQueue {
  if (queueInstance) {
    return queueInstance;
  }
  if (!isQueueEnabled()) {
    return placeholderQueue;
  }
  try {
    redisConnection = createConnection();
    queueInstance = new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    logger.info(
      { queueName: WEBHOOK_QUEUE_NAME },
      'Webhook queue connected (BullMQ)'
    );
    return queueInstance;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to create webhook queue; using placeholder'
    );
    return placeholderQueue;
  }
}

/**
 * Webhook queue: add jobs via .add(jobName, jobData).
 * When REDIS_URL is set, uses BullMQ; otherwise placeholder (log only).
 *
 * @example
 * await webhookQueue.add('processInstagramWebhook', { eventId, provider: 'instagram', payload, correlationId });
 */
export const webhookQueue = {
  async add(jobName: string, jobData: WebhookJobData): Promise<void> {
    const queue = getWebhookQueue();
    if (queue instanceof Queue) {
      await queue.add(jobName, jobData, DEFAULT_JOB_OPTIONS);
    } else {
      await queue.add(jobName, jobData);
    }
  },
};

/**
 * Try to acquire a content-based dedup lock for Instagram messages.
 * Meta sends multiple "message" webhooks with different mids for the same user message.
 * Key = ig:dedup:{pageId}:{senderId}:{textHash}:{minuteBucket}. TTL 120s.
 * Returns true if we acquired (first to process), false if duplicate (skip queueing).
 * Fail-open: returns true if Redis unavailable (allow through).
 */
export async function tryAcquireInstagramDedupLock(
  pageId: string,
  senderId: string,
  textHash: string
): Promise<boolean> {
  if (!isQueueEnabled()) return true; // fail-open when queue disabled
  getWebhookQueue(); // ensure Redis connection exists
  const conn = getQueueConnection();
  if (!conn) return true; // fail-open
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const key = `ig:dedup:${pageId}:${senderId}:${textHash}:${minuteBucket}`;
  try {
    const result = await conn.set(key, '1', 'EX', 120, 'NX');
    return result === 'OK'; // true if we set it, false if key existed
  } catch {
    return true; // fail-open on Redis error
  }
}

/**
 * Close queue and Redis connection (for graceful shutdown).
 */
export async function closeQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
  logger.info('Webhook queue connection closed');
}
