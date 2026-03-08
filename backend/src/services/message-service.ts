/**
 * Message Service Functions
 *
 * Service functions for message-related database operations.
 * Messages contain PHI (content) which is encrypted at rest.
 */

import { getSupabaseAdminClient } from '../config/database';
import { Message, InsertMessage } from '../types';
import { InternalError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification, logDataAccess } from '../utils/audit-logger';

/**
 * Create a message or return existing if already stored (idempotent).
 * Used for webhooks: duplicate events or retries may try to insert the same message.
 * On unique violation (23505), fetches and returns the existing row.
 *
 * @param data - Message data to insert
 * @param correlationId - Request correlation ID
 * @returns Created or existing message
 */
export async function createMessage(
  data: InsertMessage,
  correlationId: string
): Promise<Message> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: message, error } = await supabaseAdmin
    .from('messages')
    .insert(data)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Row exists (duplicate insert); fetch it. Use maybeSingle() to avoid error on 0 rows.
      // Retry once after 150ms to handle replication lag (e.g. Supabase read replica).
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data: existing } = await supabaseAdmin
          .from('messages')
          .select('*')
          .eq('conversation_id', data.conversation_id)
          .eq('platform_message_id', data.platform_message_id)
          .maybeSingle();
        if (existing) return existing as Message;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
      }
    }
    handleSupabaseError(error, correlationId);
  }

  if (!message) throw new InternalError('Message create returned no data');

  await logDataModification(
    correlationId,
    undefined as any,
    'create',
    'message',
    message.id
  );

  return message as Message;
}

/**
 * Get all messages for a conversation
 * 
 * Retrieves all messages in a conversation, ordered by creation time.
 * 
 * @param conversationId - Conversation ID
 * @param correlationId - Request correlation ID
 * @returns Array of messages
 * 
 * @throws InternalError if database operation fails
 * 
 * Note: Uses service role client (webhook processing has no user context)
 */
export async function getConversationMessages(
  conversationId: string,
  correlationId: string
): Promise<Message[]> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log (read access)
  await logDataAccess(correlationId, undefined as any, 'message', conversationId);

  return (messages || []) as Message[];
}

/**
 * Get recent messages for a conversation (newest last), for AI context (e-task-3).
 * Caller must redact content before sending to AI.
 *
 * @param conversationId - Conversation ID
 * @param limit - Max number of messages (e.g. 10 for ~5 pairs)
 * @param correlationId - Request correlation ID
 * @returns Messages ordered by created_at ascending (oldest first, up to limit from end)
 */
export async function getRecentMessages(
  conversationId: string,
  limit: number,
  correlationId: string
): Promise<Message[]> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const list = (messages || []) as Message[];
  list.reverse(); // oldest first for AI context
  await logDataAccess(correlationId, undefined as any, 'message', conversationId);
  return list;
}

/**
 * Resolve Instagram sender ID from a stored message (by platform_message_id).
 * Used when Meta sends message_edit webhooks without sender/recipient so we can
 * still reply using the conversation we created from the original message.
 *
 * @param doctorId - Doctor ID (scope to this doctor's conversations)
 * @param platformMessageId - Platform message ID (e.g. message_edit.mid)
 * @param correlationId - Request correlation ID
 * @returns Sender ID (platform_conversation_id) or null if not found
 */
export async function getSenderIdByPlatformMessageId(
  doctorId: string,
  platformMessageId: string,
  correlationId: string
): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: message, error: msgError } = await supabaseAdmin
    .from('messages')
    .select('conversation_id')
    .eq('platform_message_id', platformMessageId)
    .limit(1)
    .maybeSingle();

  if (msgError || !message?.conversation_id) {
    return null;
  }

  const { data: conv, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('platform_conversation_id')
    .eq('id', message.conversation_id)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (convError || !conv?.platform_conversation_id) {
    return null;
  }

  await logDataAccess(correlationId, undefined as any, 'message', message.conversation_id);
  return conv.platform_conversation_id;
}
