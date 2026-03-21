/**
 * Comment Lead Service
 *
 * Creates and updates comment_leads from Instagram comment webhooks.
 * Uses service role for worker context. Idempotent on comment_id.
 *
 * IMPORTANT: Never log comment_text (may contain PHI).
 *
 * @see e-task-7-comment-worker-and-outreach.md
 * @see COMMENTS_MANAGEMENT_PLAN.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import type { CommentIntent } from '../types/ai';

export interface CreateCommentLeadInput {
  doctorId: string;
  commentId: string;
  commenterIgId: string;
  commentText: string;
  mediaId: string | null;
  intent: CommentIntent;
  confidence: number;
  publicReplySent?: boolean;
  dmSent?: boolean;
}

export interface CommentLeadRow {
  id: string;
  doctor_id: string;
  comment_id: string;
  commenter_ig_id: string;
  comment_text: string;
  media_id: string | null;
  intent: string | null;
  confidence: number | null;
  public_reply_sent: boolean;
  dm_sent: boolean;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create or update comment lead. Uses comment_id unique constraint for idempotency.
 * On conflict, updates dm_sent and public_reply_sent if we're adding outreach.
 */
export async function createCommentLead(
  input: CreateCommentLeadInput,
  correlationId: string
): Promise<CommentLeadRow | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    logger.warn({ correlationId }, 'Comment lead: admin client unavailable');
    return null;
  }

  const { data: existing } = await supabase
    .from('comment_leads')
    .select('id, dm_sent, public_reply_sent')
    .eq('comment_id', input.commentId)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (input.dmSent === true && !existing.dm_sent) updates.dm_sent = true;
    if (input.publicReplySent === true && !existing.public_reply_sent) updates.public_reply_sent = true;
    if (Object.keys(updates).length > 0) {
      const { data: updated, error } = await supabase
        .from('comment_leads')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        handleSupabaseError(error, correlationId);
        return null;
      }
      return updated as CommentLeadRow;
    }
    return existing as CommentLeadRow;
  }

  const { data, error } = await supabase
    .from('comment_leads')
    .insert({
      doctor_id: input.doctorId,
      comment_id: input.commentId,
      commenter_ig_id: input.commenterIgId,
      comment_text: input.commentText,
      media_id: input.mediaId,
      intent: input.intent,
      confidence: input.confidence,
      public_reply_sent: input.publicReplySent ?? false,
      dm_sent: input.dmSent ?? false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      logger.info({ correlationId, commentId: input.commentId }, 'Comment lead already exists (idempotent)');
      const { data: row } = await supabase
        .from('comment_leads')
        .select()
        .eq('comment_id', input.commentId)
        .single();
      return row as CommentLeadRow | null;
    }
    handleSupabaseError(error, correlationId);
    return null;
  }

  return data as CommentLeadRow;
}

/**
 * Link comment lead to conversation when commenter DMs.
 */
export async function linkCommentLeadToConversation(
  commenterIgId: string,
  conversationId: string,
  correlationId: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('comment_leads')
    .update({ conversation_id: conversationId })
    .eq('commenter_ig_id', commenterIgId)
    .is('conversation_id', null);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}
