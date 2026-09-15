/**
 * Message Service Functions
 *
 * Service functions for message-related database operations.
 * Messages contain PHI (content) which is encrypted at rest.
 */

import { getSupabaseAdminClient } from '../config/database';
import { Message, InsertMessage } from '../types';
import { InternalError, NotFoundError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification, logDataAccess } from '../utils/audit-logger';

/** Doctor-facing message row (PHI content; never log). */
export interface InteractionMessageDto {
  id: string;
  conversation_id: string;
  sender_type: Message['sender_type'];
  content: string;
  intent: string | null;
  created_at: string;
}

/**
 * Create a message or return existing if already stored (idempotent).
 * On 23505 (race), fetches existing with retries for replication lag.
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
      const delays = [100, 300, 700, 1500];
      for (let i = 0; i <= delays.length; i++) {
        const { data: existing } = await supabaseAdmin
          .from('messages')
          .select('*')
          .eq('conversation_id', data.conversation_id)
          .eq('platform_message_id', data.platform_message_id)
          .maybeSingle();
        if (existing) return existing as Message;
        if (i < delays.length) await new Promise((r) => setTimeout(r, delays[i]));
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

export interface DoctorMessagesPage {
  messages: InteractionMessageDto[];
  /** True when older messages exist beyond this page (scroll-up / Load older). */
  hasMoreOlder: boolean;
}

const DOCTOR_MESSAGES_DEFAULT_LIMIT = 50;
const DOCTOR_MESSAGES_MAX_LIMIT = 100;

/**
 * Doctor-scoped conversation messages (ibi-03).
 * Verifies conversation ownership before reading PHI. Wrong doctor → NotFound (no leak).
 * Returns the newest `limit` messages (or older page when `before` is set). Ascending for UI.
 */
export async function getConversationMessagesForDoctor(
  doctorId: string,
  conversationId: string,
  correlationId: string,
  opts: { limit?: number; before?: string } = {}
): Promise<DoctorMessagesPage> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (convError) {
    handleSupabaseError(convError, correlationId);
  }

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const limit = Math.min(
    Math.max(opts.limit ?? DOCTOR_MESSAGES_DEFAULT_LIMIT, 1),
    DOCTOR_MESSAGES_MAX_LIMIT
  );

  let q = supabaseAdmin
    .from('messages')
    .select('id, conversation_id, sender_type, content, intent, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (opts.before) {
    q = q.lt('created_at', opts.before);
  }

  const { data: messages, error } = await q;

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, doctorId, 'message', conversationId);

  const rows = messages || [];
  const hasMoreOlder = rows.length > limit;
  const page = hasMoreOlder ? rows.slice(0, limit) : rows;
  // Newest-first from DB → chronological for the thread UI.
  page.reverse();

  return {
    messages: page.map((row) => ({
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      sender_type: row.sender_type as Message['sender_type'],
      content: row.content as string,
      intent: (row.intent as string | null) ?? null,
      created_at:
        typeof row.created_at === 'string'
          ? row.created_at
          : new Date(row.created_at as string | Date).toISOString(),
    })),
    hasMoreOlder,
  };
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
