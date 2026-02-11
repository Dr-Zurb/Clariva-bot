/**
 * Conversation Service Functions
 *
 * Service functions for conversation-related database operations.
 * Conversations link patients to doctors via platform conversations.
 * State is stored in conversations.metadata (e-task-3; no PHI).
 */

import { getSupabaseAdminClient } from '../config/database';
import {
  Conversation,
  InsertConversation,
  ConversationStatus,
  ConversationState,
} from '../types';
import { InternalError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification } from '../utils/audit-logger';

/**
 * Find conversation by platform conversation ID
 * 
 * Used to look up existing conversations when processing webhooks.
 * 
 * @param doctorId - Doctor ID
 * @param platform - Platform name
 * @param platformConversationId - Platform-specific conversation ID
 * @param correlationId - Request correlation ID
 * @returns Conversation or null if not found
 * 
 * @throws InternalError if database operation fails
 */
export async function findConversationByPlatformId(
  doctorId: string,
  platform: string,
  platformConversationId: string,
  correlationId: string
): Promise<Conversation | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('platform', platform)
    .eq('platform_conversation_id', platformConversationId)
    .single();

  if (error) {
    // Not found is OK (return null)
    if (error.code === 'PGRST116') {
      return null;
    }
    handleSupabaseError(error, correlationId);
  }

  return data as Conversation | null;
}

/**
 * When the doctor has exactly one Instagram conversation, return its platform_conversation_id (sender ID).
 * Used as fallback for message_edit webhooks that have no sender in payload and no stored message with the given mid.
 *
 * @param doctorId - Doctor UUID
 * @param correlationId - For audit
 * @returns Sender ID (platform_conversation_id) or null if 0 or 2+ conversations
 */
export async function getOnlyInstagramConversationSenderId(
  doctorId: string,
  correlationId: string
): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('platform_conversation_id')
    .eq('doctor_id', doctorId)
    .eq('platform', 'instagram')
    .limit(2);
  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data || data.length !== 1) return null;
  return (data[0] as { platform_conversation_id: string }).platform_conversation_id ?? null;
}

/**
 * Create a new conversation
 * 
 * Creates conversation record when processing webhooks.
 * Returns existing conversation if one already exists with the same platform conversation ID.
 * 
 * @param data - Conversation data to insert
 * @param correlationId - Request correlation ID
 * @returns Created or existing conversation
 * 
 * @throws InternalError if database operation fails
 * 
 * Note: Uses service role client (webhook processing has no user context)
 */
export async function createConversation(
  data: InsertConversation,
  correlationId: string
): Promise<Conversation> {
  // Check if conversation already exists
  const existing = await findConversationByPlatformId(
    data.doctor_id,
    data.platform,
    data.platform_conversation_id,
    correlationId
  );

  if (existing) {
    return existing; // Return existing instead of creating duplicate
  }

  // Create conversation (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .insert(data)
    .select()
    .single();

  if (error || !conversation) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log (system operation - no user)
  await logDataModification(
    correlationId,
    undefined as any, // System operation
    'create',
    'conversation',
    conversation.id
  );

  return conversation as Conversation;
}

/**
 * Update conversation status
 * 
 * Updates conversation status (e.g., active, archived, closed).
 * 
 * @param id - Conversation ID
 * @param status - New conversation status
 * @param correlationId - Request correlation ID
 * @returns Updated conversation
 * 
 * @throws InternalError if database operation fails
 * 
 * Note: Uses service role client (webhook processing has no user context)
 */
export async function updateConversationStatus(
  id: string,
  status: ConversationStatus,
  correlationId: string
): Promise<Conversation> {
  // Update conversation (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: updated, error } = await supabaseAdmin
    .from('conversations')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log (system operation - no user)
  await logDataModification(
    correlationId,
    undefined as any, // System operation
    'update',
    'conversation',
    id,
    ['status']
  );

  return updated as Conversation;
}

/**
 * Get conversation state from metadata (e-task-3).
 *
 * @param conversationId - Conversation ID
 * @param correlationId - Request correlation ID
 * @returns Current state or empty object if none
 */
export async function getConversationState(
  conversationId: string,
  correlationId: string
): Promise<ConversationState> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {};
    }
    handleSupabaseError(error, correlationId);
  }

  const meta = (data as { metadata?: ConversationState } | null)?.metadata;
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  return meta as ConversationState;
}

/**
 * Update conversation state (metadata only; no PHI).
 *
 * @param conversationId - Conversation ID
 * @param state - New state to merge/store
 * @param correlationId - Request correlation ID
 * @returns Updated conversation
 */
export async function updateConversationState(
  conversationId: string,
  state: ConversationState,
  correlationId: string
): Promise<Conversation> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const metadata = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  const { data: updated, error } = await supabaseAdmin
    .from('conversations')
    .update({ metadata })
    .eq('id', conversationId)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(
    correlationId,
    undefined as any,
    'update',
    'conversation',
    conversationId,
    ['metadata']
  );

  return updated as Conversation;
}
