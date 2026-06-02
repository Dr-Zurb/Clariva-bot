/**
 * Webhook Idempotency Service
 *
 * Service functions for managing webhook idempotency to prevent duplicate processing.
 * Uses webhook_idempotency table to track processed webhooks.
 *
 * IMPORTANT:
 * - Idempotency checking is MANDATORY before processing webhooks
 * - Only log metadata (event_id, provider, correlation_id) - NEVER log payloads
 * - Use service role client (bypasses RLS for system operations)
 * - All functions throw AppError (never return {error})
 *
 * Idempotency Flow:
 * 1. Check if webhook already processed (isWebhookProcessed)
 * 2. If not processed, mark as "pending" (markWebhookProcessing)
 * 3. Process webhook
 * 4. Mark as "processed" (markWebhookProcessed) or "failed" (markWebhookFailed)
 *
 * @see WEBHOOKS.md - Idempotency strategy
 */

import { getSupabaseAdminClient } from '../config/database';
import type {
  WebhookProvider,
  WebhookIdempotency,
  WebhookStatus,
  InsertWebhookIdempotency,
  UpdateWebhookIdempotency,
} from '../types';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import { logger } from '../config/logger';

// ============================================================================
// Idempotency Checking
// ============================================================================

/**
 * Check if webhook has already been processed
 *
 * Queries webhook_idempotency table to determine if a webhook with the given
 * event_id and provider has already been processed.
 *
 * @param eventId - Platform event ID or hash
 * @param provider - Webhook provider ('facebook', 'instagram', 'whatsapp')
 * @returns Existing idempotency record if found, null if not found
 *
 * @throws InternalError if database query fails
 *
 * @example
 * ```typescript
 * const existing = await isWebhookProcessed(eventId, 'instagram');
 * if (existing?.status === 'processed') {
 *   // Already processed - return 200 OK (idempotent)
 *   return;
 * }
 * ```
 */
export async function isWebhookProcessed(
  eventId: string,
  provider: WebhookProvider
): Promise<WebhookIdempotency | null> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  try {
    const { data, error } = await supabase
      .from('webhook_idempotency')
      .select('*')
      .eq('event_id', eventId)
      .eq('provider', provider)
      .single();

    // PGRST116 = not found (expected for new webhooks)
    if (error && error.code !== 'PGRST116') {
      logger.error(
        { error, eventId, provider },
        'Failed to check webhook idempotency'
      );
      throw handleSupabaseError(error, 'Failed to check webhook idempotency');
    }

    if (!data) {
      return null;
    }

    // Map database record to WebhookIdempotency type
    return {
      event_id: data.event_id,
      provider: data.provider as WebhookProvider,
      received_at: new Date(data.received_at),
      status: data.status as WebhookStatus,
      processed_at: data.processed_at ? new Date(data.processed_at) : undefined,
      correlation_id: data.correlation_id,
      error_message: data.error_message || undefined,
      retry_count: data.retry_count,
    };
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof InternalError) {
      throw error;
    }

    // Wrap unexpected errors
    logger.error(
      { error, eventId, provider },
      'Unexpected error checking webhook idempotency'
    );
    throw new InternalError('Failed to check webhook idempotency');
  }
}

// ============================================================================
// Idempotency Marking
// ============================================================================

/**
 * Mark webhook as processing (pending)
 *
 * Inserts or updates webhook_idempotency record with status 'pending'.
 * This should be called immediately after idempotency check and before processing.
 *
 * @param eventId - Platform event ID or hash
 * @param provider - Webhook provider
 * @param correlationId - Request correlation ID
 * @returns Created or updated idempotency record
 *
 * @throws InternalError if database operation fails
 *
 * @example
 * ```typescript
 * await markWebhookProcessing(eventId, 'instagram', correlationId);
 * // Then process webhook...
 * ```
 */
export async function markWebhookProcessing(
  eventId: string,
  provider: WebhookProvider,
  correlationId: string
): Promise<WebhookIdempotency> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  try {
    const insertData: InsertWebhookIdempotency = {
      event_id: eventId,
      provider,
      correlation_id: correlationId,
      status: 'pending',
      retry_count: 0, // Default to 0 for new records
      // received_at is omitted (has default in database)
    };

    // Upsert (insert or update if exists)
    // Note: event_id is PRIMARY KEY, so upsert on event_id only
    const { data, error } = await supabase
      .from('webhook_idempotency')
      .upsert(insertData, {
        onConflict: 'event_id',
      })
      .select()
      .single();

    if (error || !data) {
      logger.error(
        { error, eventId, provider, correlationId },
        'Failed to mark webhook as processing'
      );
      throw handleSupabaseError(error, 'Failed to mark webhook as processing');
    }

    logger.info(
      { eventId, provider, correlationId, status: 'pending' },
      'Webhook marked as processing'
    );

    // Map database record to WebhookIdempotency type
    return {
      event_id: data.event_id,
      provider: data.provider as WebhookProvider,
      received_at: new Date(data.received_at),
      status: data.status as WebhookStatus,
      processed_at: data.processed_at ? new Date(data.processed_at) : undefined,
      correlation_id: data.correlation_id,
      error_message: data.error_message || undefined,
      retry_count: data.retry_count,
    };
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof InternalError) {
      throw error;
    }

    // Wrap unexpected errors
    logger.error(
      { error, eventId, provider, correlationId },
      'Unexpected error marking webhook as processing'
    );
    throw new InternalError('Failed to mark webhook as processing');
  }
}

/**
 * Mark webhook as processed (completed successfully)
 *
 * Updates webhook_idempotency record status to 'processed' and sets processed_at timestamp.
 * This should be called after webhook processing completes successfully.
 *
 * @param eventId - Platform event ID or hash
 * @param provider - Webhook provider
 * @returns Updated idempotency record
 *
 * @throws InternalError if database operation fails
 *
 * @example
 * ```typescript
 * await processWebhook(req);
 * await markWebhookProcessed(eventId, 'instagram');
 * ```
 */
export async function markWebhookProcessed(
  eventId: string,
  provider: WebhookProvider
): Promise<WebhookIdempotency> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  try {
    // UpdateWebhookIdempotency requires event_id, but we use it in WHERE clause
    // So we create a partial update object without event_id
    const updateData: Omit<UpdateWebhookIdempotency, 'event_id'> = {
      status: 'processed',
      processed_at: new Date(),
    };

    const { data, error } = await supabase
      .from('webhook_idempotency')
      .update(updateData)
      .eq('event_id', eventId)
      .eq('provider', provider)
      .select()
      .single();

    if (error || !data) {
      logger.error(
        { error, eventId, provider },
        'Failed to mark webhook as processed'
      );
      throw handleSupabaseError(error, 'Failed to mark webhook as processed');
    }

    logger.info(
      { eventId, provider, status: 'processed' },
      'Webhook marked as processed'
    );

    // Map database record to WebhookIdempotency type
    return {
      event_id: data.event_id,
      provider: data.provider as WebhookProvider,
      received_at: new Date(data.received_at),
      status: data.status as WebhookStatus,
      processed_at: data.processed_at ? new Date(data.processed_at) : undefined,
      correlation_id: data.correlation_id,
      error_message: data.error_message || undefined,
      retry_count: data.retry_count,
    };
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof InternalError) {
      throw error;
    }

    // Wrap unexpected errors
    logger.error(
      { error, eventId, provider },
      'Unexpected error marking webhook as processed'
    );
    throw new InternalError('Failed to mark webhook as processed');
  }
}

/**
 * Mark webhook as failed
 *
 * Updates webhook_idempotency record status to 'failed', stores error message,
 * and increments retry_count. This should be called when webhook processing fails.
 *
 * @param eventId - Platform event ID or hash
 * @param provider - Webhook provider
 * @param errorMessage - Error message describing the failure
 * @returns Updated idempotency record
 *
 * @throws InternalError if database operation fails
 *
 * @example
 * ```typescript
 * try {
 *   await processWebhook(req);
 *   await markWebhookProcessed(eventId, 'instagram');
 * } catch (error) {
 *   await markWebhookFailed(eventId, 'instagram', error.message);
 * }
 * ```
 */
export async function markWebhookFailed(
  eventId: string,
  provider: WebhookProvider,
  errorMessage: string
): Promise<WebhookIdempotency> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  try {
    // Get current retry_count
    const existing = await isWebhookProcessed(eventId, provider);
    const currentRetryCount = existing?.retry_count || 0;

    // UpdateWebhookIdempotency requires event_id, but we use it in WHERE clause
    // So we create a partial update object without event_id
    const updateData: Omit<UpdateWebhookIdempotency, 'event_id'> = {
      status: 'failed',
      error_message: errorMessage,
      retry_count: currentRetryCount + 1,
    };

    const { data, error } = await supabase
      .from('webhook_idempotency')
      .update(updateData)
      .eq('event_id', eventId)
      .eq('provider', provider)
      .select()
      .single();

    if (error || !data) {
      logger.error(
        { error, eventId, provider, errorMessage },
        'Failed to mark webhook as failed'
      );
      throw handleSupabaseError(error, 'Failed to mark webhook as failed');
    }

    logger.warn(
      { eventId, provider, errorMessage, retry_count: updateData.retry_count },
      'Webhook marked as failed'
    );

    // Map database record to WebhookIdempotency type
    return {
      event_id: data.event_id,
      provider: data.provider as WebhookProvider,
      received_at: new Date(data.received_at),
      status: data.status as WebhookStatus,
      processed_at: data.processed_at ? new Date(data.processed_at) : undefined,
      correlation_id: data.correlation_id,
      error_message: data.error_message || undefined,
      retry_count: data.retry_count,
    };
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof InternalError) {
      throw error;
    }

    // Wrap unexpected errors
    logger.error(
      { error, eventId, provider, errorMessage },
      'Unexpected error marking webhook as failed'
    );
    throw new InternalError('Failed to mark webhook as failed');
  }
}
