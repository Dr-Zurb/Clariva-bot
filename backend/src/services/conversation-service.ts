/**
 * Conversation Service Functions
 *
 * Service functions for conversation-related database operations.
 * Conversations link patients to doctors via platform conversations.
 * State is stored in conversations.metadata (e-task-3; no PHI).
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  Conversation,
  InsertConversation,
  ConversationStatus,
  ConversationState,
  readConversationState,
  writeConversationState,
} from '../types';
import { InternalError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification } from '../utils/audit-logger';
import type { ConversationLanguage } from '../utils/conversation-language';

const CONVERSATION_LANGUAGE_CODES: ReadonlySet<string> = new Set([
  'en',
  'hi',
  'hi-Latn',
  'pa',
  'pa-Latn',
  'other',
]);

/**
 * Coerce a stored / raw language value to a valid ConversationLanguage.
 * Invalid or nullish → `'en'` (LANG-D1 / LANG3-D3).
 */
export function coerceConversationLanguage(raw: unknown): ConversationLanguage {
  if (typeof raw === 'string' && CONVERSATION_LANGUAGE_CODES.has(raw)) {
    return raw as ConversationLanguage;
  }
  return 'en';
}

/**
 * Read sticky reply language for out-of-band DMs (lang-11).
 * Never throws — missing row / NULL / invalid → `'en'` + WARN.
 */
export async function getConversationLanguage(
  conversationId: string,
  correlationId: string
): Promise<ConversationLanguage> {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      logger.warn(
        { correlationId, conversationId },
        'getConversationLanguage: admin client unavailable; defaulting to en'
      );
      return 'en';
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('language')
      .eq('id', conversationId)
      .maybeSingle();

    if (error) {
      logger.warn(
        { correlationId, conversationId, err: error },
        'getConversationLanguage: query failed; defaulting to en'
      );
      return 'en';
    }
    if (!data) {
      logger.warn(
        { correlationId, conversationId },
        'getConversationLanguage: conversation missing; defaulting to en'
      );
      return 'en';
    }

    const coerced = coerceConversationLanguage(
      (data as { language?: unknown }).language
    );
    if (
      (data as { language?: unknown }).language != null &&
      coerced === 'en' &&
      (data as { language?: unknown }).language !== 'en'
    ) {
      logger.warn(
        { correlationId, conversationId },
        'getConversationLanguage: invalid stored language; defaulting to en'
      );
    }
    return coerced;
  } catch (err) {
    logger.warn(
      { correlationId, conversationId, err },
      'getConversationLanguage: unexpected failure; defaulting to en'
    );
    return 'en';
  }
}

/**
 * RBH-06: Map legacy slot steps to `awaiting_slot_selection` (in-memory + caller may persist).
 * Clears `slotSelectionDate` / `slotToConfirm` the same way the former DM migration branches did.
 */
/** @deprecated rcp-19: `readConversationState` normalizes slot steps; kept for call-site compatibility. */
export function normalizeLegacySlotConversationSteps(state: ConversationState): ConversationState {
  return state;
}

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
 * rcp-26: Whether another doctor already has a conversation for this platform sender.
 * Used to skip legacy global patient compat when a second clinic gets a first contact.
 */
export async function hasOtherDoctorConversationForSender(
  doctorId: string,
  platform: string,
  platformConversationId: string,
  correlationId: string
): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('platform', platform)
    .eq('platform_conversation_id', platformConversationId)
    .neq('doctor_id', doctorId)
    .limit(1);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Find conversation by ID (e-task-3 slot selection).
 *
 * @param conversationId - Conversation UUID
 * @param correlationId - Request correlation ID
 * @returns Conversation or null if not found
 */
export async function findConversationById(
  conversationId: string,
  correlationId: string
): Promise<Conversation | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
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
 * On 23505 (race), fetches existing with retries for replication lag.
 *
 * @param data - Conversation data to insert
 * @param correlationId - Request correlation ID
 * @returns Created or existing conversation
 *
 * @throws InternalError if database operation fails
 */
export async function createConversation(
  data: InsertConversation,
  correlationId: string
): Promise<Conversation> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: rows, error } = await supabaseAdmin
    .from('conversations')
    .insert(data)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const delays = [100, 300, 700, 1500];
      for (let i = 0; i <= delays.length; i++) {
        const existing = await findConversationByPlatformId(
          data.doctor_id,
          data.platform,
          data.platform_conversation_id,
          correlationId
        );
        if (existing) return existing;
        if (i < delays.length) await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
    handleSupabaseError(error, correlationId);
  }

  if (!rows) throw new InternalError('Conversation create returned no data');

  await logDataModification(
    correlationId,
    undefined as any,
    'create',
    'conversation',
    rows.id
  );

  return rows as Conversation;
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

  const meta = (data as { metadata?: unknown } | null)?.metadata;
  return readConversationState(meta);
}

/**
 * Update conversation state (metadata; optional language — lang-03).
 * Language is a locale code, not PHI. Pass `language` only when it changed.
 *
 * @param conversationId - Conversation ID
 * @param state - New state to merge/store
 * @param correlationId - Request correlation ID
 * @param options - Optional `{ language }` to persist with the same write
 * @returns Updated conversation
 */
export async function updateConversationState(
  conversationId: string,
  state: ConversationState,
  correlationId: string,
  options?: { language?: ConversationLanguage }
): Promise<Conversation> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const metadata = {
    ...writeConversationState(state),
    updatedAt: new Date().toISOString(),
  };

  const updatePayload: {
    metadata: typeof metadata;
    language?: ConversationLanguage;
  } = { metadata };
  if (options?.language !== undefined) {
    updatePayload.language = options.language;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('conversations')
    .update(updatePayload)
    .eq('id', conversationId)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  const changedFields =
    options?.language !== undefined ? ['metadata', 'language'] : ['metadata'];

  await logDataModification(
    correlationId,
    undefined as any,
    'update',
    'conversation',
    conversationId,
    changedFields
  );

  return updated as Conversation;
}
