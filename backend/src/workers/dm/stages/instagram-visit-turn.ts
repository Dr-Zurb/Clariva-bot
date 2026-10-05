/**
 * Instagram-only signpost. One link, then silence for an hour.
 * Facebook keeps the stage router.
 */

import { getConnectedInstagramDisplayName } from '../../../services/instagram-connect-service';
import { mintVisitPageLink } from '../../../services/visit-page-link-service';
import {
  isInstagramQuietInbound,
  renderInstagramContinueReply,
} from '../../../utils/instagram-visit-replies';
import type { DmTurnContext, DmTurnResult } from '../stage-router';

const LINK_REPLY_GAP_MS = 60 * 60 * 1000;

function isFirstAutomatedReply(ctx: DmTurnContext): boolean {
  return !ctx.recentMessages.some(
    (message) => message.sender_type === 'system' || message.sender_type === 'doctor'
  );
}

function repliedWithinHour(ctx: DmTurnContext): boolean {
  const stamped = ctx.state.instagramLinkSentAt;
  if (typeof stamped === 'string') {
    const at = new Date(stamped).getTime();
    if (Number.isFinite(at) && Date.now() - at < LINK_REPLY_GAP_MS) return true;
  }
  let latest = 0;
  for (const message of ctx.recentMessages) {
    if (message.sender_type !== 'system' && message.sender_type !== 'doctor') continue;
    const at = new Date(message.created_at).getTime();
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  if (latest === 0) return false;
  return Date.now() - latest < LINK_REPLY_GAP_MS;
}

function quietTurn(ctx: DmTurnContext): DmTurnResult {
  return {
    branch: 'greeting_template',
    reply: '',
    nextState: {
      ...ctx.state,
      lastIntent: ctx.intentResult.intent,
      step: 'responded',
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function handleInstagramVisitTurn(ctx: DmTurnContext): Promise<DmTurnResult> {
  if (isInstagramQuietInbound(ctx.text) || repliedWithinHour(ctx)) {
    return quietTurn(ctx);
  }
  const url = await mintVisitPageLink({
    conversationId: ctx.conversation.id,
    doctorId: ctx.doctorId,
    publicSlug: ctx.doctorSettings?.public_slug,
    correlationId: ctx.correlationId,
  });
  let pageName: string | null = null;
  try {
    pageName = await getConnectedInstagramDisplayName(ctx.doctorId, ctx.correlationId);
  } catch {
    pageName = null;
  }
  const sentAt = new Date().toISOString();
  return {
    branch: 'greeting_template',
    reply: renderInstagramContinueReply({
      pageName,
      url,
      includeStopHint: isFirstAutomatedReply(ctx),
    }),
    nextState: {
      ...ctx.state,
      lastIntent: ctx.intentResult.intent,
      step: 'responded',
      updatedAt: sentAt,
      instagramLinkSentAt: sentAt,
    },
  };
}
