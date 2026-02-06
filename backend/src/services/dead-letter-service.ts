/**
 * Dead Letter Queue Service Functions
 *
 * Service functions for dead letter queue operations.
 * Dead letter queue stores encrypted webhook payloads that failed after max retries.
 * Contains PHI/PII in encrypted payload (payload_encrypted).
 *
 * IMPORTANT:
 * - Payloads MUST be encrypted before storage
 * - Only log metadata (event_id, provider, correlation_id) - NEVER log payload
 * - Use service role client (bypasses RLS for system operations)
 * - All functions throw AppError (never return {error})
 */

import { getSupabaseAdminClient } from '../config/database';
import {
  DeadLetterQueue,
  DeadLetterQueueWithDecrypted,
  InsertDeadLetterQueue,
  WebhookProvider,
} from '../types';
import { handleSupabaseError } from '../utils/db-helpers';
import { encryptPayload, decryptPayload } from '../utils/encryption';
import { logAuditEvent } from '../utils/audit-logger';
import { NotFoundError, InternalError } from '../utils/errors';
import { logger } from '../config/logger';

// ============================================================================
// Store Functions
// ============================================================================

/**
 * Store failed webhook in dead letter queue
 *
 * Encrypts payload and stores in dead letter queue after max retries.
 * Logs to audit table (metadata only, no payload).
 *
 * @param eventId - Platform event ID or hash
 * @param provider - Webhook provider platform
 * @param payload - Webhook payload (will be encrypted)
 * @param errorMessage - Error message that caused failure
 * @param retryCount - Number of retry attempts
 * @param correlationId - Request correlation ID
 * @returns Created dead letter record ID
 *
 * @throws InternalError if encryption or database operation fails
 *
 * @example
 * ```typescript
 * const id = await storeDeadLetterWebhook(
 *   'event_123',
 *   'instagram',
 *   { message: '...' },
 *   'Processing failed',
 *   3,
 *   correlationId
 * );
 * ```
 */
export async function storeDeadLetterWebhook(
  eventId: string,
  provider: WebhookProvider,
  payload: unknown,
  errorMessage: string,
  retryCount: number,
  correlationId: string
): Promise<string> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  try {
    // Encrypt payload
    const payloadString = JSON.stringify(payload);
    const encryptedPayload = encryptPayload(payloadString, correlationId);

    // Prepare insert data
    const insertData: InsertDeadLetterQueue = {
      event_id: eventId,
      provider,
      correlation_id: correlationId,
      payload_encrypted: encryptedPayload,
      error_message: errorMessage,
      retry_count: retryCount,
    };

    // Insert into dead letter queue (service role - bypasses RLS)
    const { data, error } = await supabase
      .from('dead_letter_queue')
      .insert(insertData)
      .select('id')
      .single();

    if (error || !data) {
      handleSupabaseError(error, correlationId);
    }

    // Log to audit (metadata only - NEVER log payload)
    await logAuditEvent({
      correlationId,
      userId: undefined, // System operation (no user)
      action: 'dead_letter_stored',
      resourceType: 'dead_letter_queue',
      resourceId: data.id,
      status: 'success',
      metadata: {
        event_id: eventId,
        provider,
        retry_count: retryCount,
      },
    });

    // Log operation (metadata only)
    logger.info(
      {
        correlationId,
        event_id: eventId,
        provider,
        retry_count: retryCount,
        dead_letter_id: data.id,
      },
      'Dead letter webhook stored'
    );

    return data.id;
  } catch (error) {
    // Log error (without payload - contains PHI)
    logger.error(
      {
        error,
        correlationId,
        event_id: eventId,
        provider,
      },
      'Failed to store dead letter webhook'
    );

    // Re-throw if already AppError
    if (error instanceof InternalError || error instanceof NotFoundError) {
      throw error;
    }

    throw new InternalError('Failed to store dead letter webhook');
  }
}

// ============================================================================
// Retrieval Functions
// ============================================================================

/**
 * Get dead letter webhook by ID
 *
 * Retrieves dead letter record and decrypts payload for manual review.
 * Only authorized admin users should call this function.
 *
 * @param id - Dead letter record ID
 * @param correlationId - Request correlation ID
 * @returns Dead letter record with decrypted payload
 *
 * @throws NotFoundError if record not found
 * @throws InternalError if decryption fails
 *
 * @example
 * ```typescript
 * const deadLetter = await getDeadLetterWebhook(id, correlationId);
 * const payload = deadLetter.payload; // Decrypted payload
 * ```
 */
export async function getDeadLetterWebhook(
  id: string,
  correlationId: string
): Promise<DeadLetterQueueWithDecrypted> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  // Retrieve from database (service role - bypasses RLS)
  const { data, error } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    handleSupabaseError(error, correlationId);
  }

  try {
    // Decrypt payload
    const decryptedPayloadString = decryptPayload(data.payload_encrypted, correlationId);
    const decryptedPayload = JSON.parse(decryptedPayloadString);

    // Log access (metadata only - NEVER log payload)
    await logAuditEvent({
      correlationId,
      userId: undefined, // Will be set by caller if user context available
      action: 'dead_letter_accessed',
      resourceType: 'dead_letter_queue',
      resourceId: id,
      status: 'success',
      metadata: {
        event_id: data.event_id,
        provider: data.provider,
      },
    });

    return {
      ...data,
      payload: decryptedPayload,
    } as DeadLetterQueueWithDecrypted;
  } catch (error) {
    logger.error(
      {
        error,
        correlationId,
        dead_letter_id: id,
      },
      'Failed to decrypt dead letter payload'
    );

    throw new InternalError('Failed to decrypt dead letter payload');
  }
}

/**
 * List dead letter webhooks with optional filters
 *
 * Retrieves dead letter records matching filters (without decrypted payloads).
 * Use getDeadLetterWebhook to retrieve and decrypt individual records.
 *
 * @param correlationId - Request correlation ID
 * @param filters - Optional filters (provider, startDate, endDate)
 * @returns Array of dead letter records (without decrypted payloads)
 *
 * @throws InternalError if database operation fails
 *
 * @example
 * ```typescript
 * const deadLetters = await listDeadLetterWebhooks(correlationId, {
 *   provider: 'instagram',
 *   startDate: new Date('2026-01-01'),
 *   endDate: new Date('2026-01-31'),
 * });
 * ```
 */
export async function listDeadLetterWebhooks(
  correlationId: string,
  filters?: {
    provider?: WebhookProvider;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<DeadLetterQueue[]> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  let query = supabase.from('dead_letter_queue').select('*');

  // Apply filters
  if (filters?.provider) {
    query = query.eq('provider', filters.provider);
  }

  if (filters?.startDate) {
    query = query.gte('failed_at', filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query = query.lte('failed_at', filters.endDate.toISOString());
  }

  // Order by failed_at descending (most recent first)
  query = query.order('failed_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  // Log access (metadata only)
  await logAuditEvent({
    correlationId,
    userId: undefined, // Will be set by caller if user context available
    action: 'dead_letter_listed',
    resourceType: 'dead_letter_queue',
    status: 'success',
    metadata: {
      filter_provider: filters?.provider,
      filter_start_date: filters?.startDate?.toISOString(),
      filter_end_date: filters?.endDate?.toISOString(),
      result_count: data?.length || 0,
    },
  });

  return (data || []) as DeadLetterQueue[];
}

// ============================================================================
// Recovery Functions
// ============================================================================

/**
 * Reprocess dead letter webhook
 *
 * Retrieves dead letter record, decrypts payload, and re-queues for processing.
 * This function is a placeholder - actual re-queuing will be implemented when
 * webhook queue is available (Task 6).
 *
 * @param id - Dead letter record ID
 * @param correlationId - Request correlation ID
 * @returns Promise that resolves when reprocessing is queued
 *
 * @throws NotFoundError if record not found
 * @throws InternalError if decryption or re-queuing fails
 *
 * @example
 * ```typescript
 * await reprocessDeadLetterWebhook(id, correlationId);
 * ```
 */
export async function reprocessDeadLetterWebhook(
  id: string,
  correlationId: string
): Promise<void> {
  // Retrieve dead letter record
  const deadLetter = await getDeadLetterWebhook(id, correlationId);

  // TODO: Re-queue for processing (Task 6: Webhook Processing Queue & Worker).
  // Re-queue from dead letter is planned; not yet implemented.
  // This will be implemented when webhook queue is available
  // await webhookQueue.add({
  //   eventId: deadLetter.event_id,
  //   provider: deadLetter.provider,
  //   payload: deadLetter.payload,
  //   correlationId: deadLetter.correlation_id,
  // });

  // For now, log that reprocessing was requested
  logger.info(
    {
      correlationId,
      dead_letter_id: id,
      event_id: deadLetter.event_id,
      provider: deadLetter.provider,
    },
    'Dead letter webhook reprocessing requested (queue not yet implemented)'
  );

  // Log reprocessing request
  await logAuditEvent({
    correlationId,
    userId: undefined, // System operation
    action: 'dead_letter_reprocess_requested',
    resourceType: 'dead_letter_queue',
    resourceId: id,
    status: 'success',
    metadata: {
      event_id: deadLetter.event_id,
      provider: deadLetter.provider,
    },
  });

  // Note: We don't delete the record yet - it should be deleted after successful reprocessing
  // This will be handled when webhook queue is implemented
}
