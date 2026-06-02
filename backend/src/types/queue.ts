/**
 * Queue Job Type Definitions
 *
 * TypeScript types for webhook queue jobs (BullMQ).
 * Used by queue config, webhook controller, and webhook worker.
 *
 * IMPORTANT:
 * - Job payload may contain PII/PHI - never log payload content
 * - Types match WEBHOOKS.md and RECIPES.md R-WEBHOOK-001
 */

import type { WebhookPayload, WebhookProvider } from './webhook';

// ============================================================================
// Webhook Job Data
// ============================================================================

/**
 * Webhook job data structure
 * Passed from controller to queue and consumed by worker.
 *
 * @see WEBHOOKS.md - Async processing
 * @see RECIPES.md - R-WEBHOOK-001
 */
export interface WebhookJobData {
  /** Platform event ID or fallback hash (idempotency key) */
  eventId: string;
  /** Webhook provider platform */
  provider: WebhookProvider;
  /** Webhook payload (transient - never persisted in regular DB) */
  payload: WebhookPayload;
  /** Request correlation ID for tracing */
  correlationId: string;
  /** Optional timestamp when job was queued (ISO string) */
  timestamp?: string;
}

/**
 * Job name for webhook processing
 * Used when adding jobs to the queue.
 */
export const WEBHOOK_JOB_NAME = 'processInstagramWebhook' as const;
