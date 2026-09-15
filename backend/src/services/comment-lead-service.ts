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
import { setPatientPlatformUsernameIfEmpty } from './patient-service';
import type { CommentIntent } from '../types/ai';

export type CommentLeadPlatform = 'instagram' | 'facebook';

/** Per-doctor UTC-day cap on comment private replies. Viral posts must not stampede. */
export const COMMENT_PRIVATE_REPLY_DAILY_CAP = 40;

export interface CreateCommentLeadInput {
  doctorId: string;
  commentId: string;
  /** Platform-scoped commenter id (IGSID or FB user id). */
  commenterIgId: string;
  commentText: string;
  mediaId: string | null;
  intent: CommentIntent;
  confidence: number;
  platform?: CommentLeadPlatform;
  /** Public IG username or FB display name when known. */
  commenterUsername?: string | null;
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
  platform?: CommentLeadPlatform;
  commenter_username?: string | null;
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
    .select('id, dm_sent, public_reply_sent, commenter_username')
    .eq('comment_id', input.commentId)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (input.dmSent === true && !existing.dm_sent) updates.dm_sent = true;
    if (input.publicReplySent === true && !existing.public_reply_sent) {
      updates.public_reply_sent = true;
    }
    const nextUser = input.commenterUsername?.trim();
    if (nextUser && !existing.commenter_username) {
      updates.commenter_username = nextUser;
    }
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
      platform: input.platform ?? 'instagram',
      commenter_username: input.commenterUsername?.trim() || null,
      public_reply_sent: input.publicReplySent ?? false,
      dm_sent: input.dmSent ?? false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      logger.info(
        { correlationId, commentId: input.commentId },
        'Comment lead already exists (idempotent)'
      );
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

export interface LinkCommentLeadToConversationInput {
  /** Platform-scoped commenter id (IGSID or FB PSID). */
  commenterIgId: string;
  conversationId: string;
  doctorId: string;
  platform: CommentLeadPlatform;
  correlationId: string;
}

/**
 * Link unlinked comment lead(s) for this doctor + platform + commenter to a conversation.
 * Best-effort: logs and returns on failure so the DM booking funnel is never blocked.
 * Idempotent when already linked (no rows match `conversation_id IS NULL`).
 */
export async function linkCommentLeadToConversation(
  input: LinkCommentLeadToConversationInput
): Promise<{ linked: boolean; count: number }> {
  const { commenterIgId, conversationId, doctorId, platform, correlationId } = input;
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { linked: false, count: 0 };
  }

  const { data, error } = await supabase
    .from('comment_leads')
    .update({ conversation_id: conversationId })
    .eq('doctor_id', doctorId)
    .eq('platform', platform)
    .eq('commenter_ig_id', commenterIgId)
    .is('conversation_id', null)
    .select('id, commenter_username');

  if (error) {
    // Soft-fail: never throw into the DM turn path.
    logger.warn(
      { correlationId, platform, errCode: error.code },
      'Comment lead link failed (best-effort)'
    );
    return { linked: false, count: 0 };
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    logger.info({ correlationId, platform, count }, 'Comment lead(s) linked to conversation');
    const username = (data as Array<{ commenter_username?: string | null }>).find((r) =>
      r.commenter_username?.trim()
    )?.commenter_username;
    if (username) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('patient_id')
        .eq('id', conversationId)
        .eq('doctor_id', doctorId)
        .maybeSingle();
      const patientId = (conv as { patient_id?: string | null } | null)?.patient_id;
      if (patientId) {
        await setPatientPlatformUsernameIfEmpty(patientId, username, correlationId);
      }
    }
  }
  return { linked: count > 0, count };
}

/**
 * Count comment private replies already sent for this doctor since UTC midnight.
 * Uses `dm_sent` + `updated_at` (first insert is dm_sent=false; send flips it).
 * Returns null when the admin client is missing so callers can fail closed.
 */
export async function countCommentPrivateRepliesToday(
  doctorId: string,
  correlationId: string
): Promise<number | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    logger.warn({ correlationId }, 'Comment private-reply cap: admin client unavailable');
    return null;
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('comment_leads')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)
    .eq('dm_sent', true)
    .gte('updated_at', since.toISOString());

  if (error) {
    logger.warn({ correlationId, errCode: error.code }, 'Comment private-reply cap: count failed');
    return null;
  }

  return count ?? 0;
}

/**
 * Extra-safe: if we cannot count today's sends, do not send another private reply.
 */
export async function canSendCommentPrivateReply(
  doctorId: string,
  correlationId: string
): Promise<boolean> {
  const count = await countCommentPrivateRepliesToday(doctorId, correlationId);
  if (count === null) return false;
  return count < COMMENT_PRIVATE_REPLY_DAILY_CAP;
}

/**
 * After a DM conversation is resolved, stitch any unlinked comment lead for this sender.
 * No-ops for channels without comment leads (e.g. WhatsApp).
 */
export async function maybeLinkCommentLeadAfterDm(input: {
  doctorId: string;
  channel: string;
  senderId: string;
  conversationId: string;
  correlationId: string;
}): Promise<{ linked: boolean; count: number }> {
  if (input.channel !== 'instagram' && input.channel !== 'facebook') {
    return { linked: false, count: 0 };
  }
  return linkCommentLeadToConversation({
    commenterIgId: input.senderId,
    conversationId: input.conversationId,
    doctorId: input.doctorId,
    platform: input.channel,
    correlationId: input.correlationId,
  });
}
