/**
 * rcp-10: Instagram inbound parsing + tenant resolution (lifted verbatim from instagram-dm-webhook-handler).
 */

import { logger } from '../../../config/logger';
import {
  getDoctorIdByPageIds,
  getInstagramAccessTokenForDoctor,
  getStoredInstagramPageIdForDoctor,
} from '../../../services/instagram-connect-service';
import {
  getInstagramMessageSender,
  getSenderFromMostRecentConversation,
} from '../../../services/instagram-service';
import { getOnlyInstagramConversationSenderId } from '../../../services/conversation-service';
import { getSenderIdByPlatformMessageId } from '../../../services/message-service';
import type { InstagramWebhookPayload, WebhookProvider } from '../../../types/webhook';
import { getInstagramPageId, getInstagramPageIds } from '../../../utils/webhook-event-id';
import type {
  InboundAttachment,
  InboundMessage,
  InboundTenant,
  ParseCtx,
  ParseInboundResult,
  ParseInboundSkip,
} from '../types';

export type ParsedInstagramDmPayload = {
  senderId: string;
  text: string;
  mid?: string;
  hasNonTextContent?: boolean;
  attachments?: InboundAttachment[];
};

function classifyMessageAttachments(msg: Record<string, unknown>): InboundAttachment[] | undefined {
  const attachments: InboundAttachment[] = [];
  if (Array.isArray(msg.attachments)) {
    for (const item of msg.attachments) {
      attachments.push({ type: 'attachment', payload: item });
    }
  }
  if (msg.sticker_id != null) {
    attachments.push({ type: 'sticker', payload: { sticker_id: msg.sticker_id } });
  }
  if (msg.reaction != null) {
    attachments.push({ type: 'reaction', payload: msg.reaction });
  }
  if (msg.referral != null) {
    attachments.push({ type: 'referral', payload: msg.referral });
  }
  return attachments.length > 0 ? attachments : undefined;
}

/** @internal Exported for unit tests — do not call from engine/worker directly. */
export function parseInstagramMessage(payload: InstagramWebhookPayload): ParsedInstagramDmPayload | null {
  const entries = payload.entry;
  if (!entries?.length) return null;

  const pageIds = getInstagramPageIds(payload);

  // Format 1: entry[].messaging[] (Business Login / Messenger Platform)
  for (const entry of entries) {
    const entryAny = entry as {
      messaging?: unknown[];
      from?: { id?: string };
      sender?: { id?: string };
      id?: string;
    };
    const list = entryAny.messaging;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const m = item as Record<string, unknown> & {
        message?: { mid?: string; text?: string; is_echo?: boolean };
        message_edit?: { mid?: string; text?: string; num_edit?: number };
        recipient?: { id?: string };
        is_echo?: boolean;
        is_self?: boolean;
      };
      let senderId: string | undefined =
        (m.sender as { id?: string } | undefined)?.id ??
        (m.from as { id?: string } | undefined)?.id ??
        (typeof m.sender_id === 'string' ? m.sender_id : undefined) ??
        (typeof m.from_id === 'string' ? m.from_id : undefined);
      if (!senderId && m.message_edit) {
        senderId = entryAny.from?.id ?? entryAny.sender?.id;
      }
      if (!senderId && m.message_edit) {
        const me = m.message_edit as Record<string, unknown> | undefined;
        senderId =
          (me?.sender as { id?: string } | undefined)?.id ??
          (me?.from as { id?: string } | undefined)?.id ??
          (typeof me?.sender_id === 'string' ? me.sender_id : undefined);
      }
      // When sender is the page (e.g. business edited message), use recipient as reply target
      if (senderId && pageIds.includes(senderId) && m.recipient) {
        const recipientId =
          (m.recipient as { id?: string })?.id ??
          (typeof m.recipient_id === 'string' ? m.recipient_id : undefined);
        if (recipientId && !pageIds.includes(recipientId)) {
          senderId = recipientId;
        } else {
          continue; // cannot determine customer
        }
      }
      if (!senderId) continue;
      if (m.is_echo === true || m.is_self === true) continue;
      if ((m.message as { is_echo?: boolean } | undefined)?.is_echo === true) continue;
      // Never use page ID as recipient (Meta returns "No matching user found")
      if (pageIds.includes(senderId)) continue;
      // Incoming message (new or edited)
      if (m.message) {
        const text = m.message.text ?? '';
        const mid = m.message.mid;
        const msg = m.message as Record<string, unknown>;
        const hasNonTextContent =
          !text.trim() &&
          (Array.isArray(msg.attachments) ||
            msg.sticker_id != null ||
            msg.reaction != null ||
            msg.referral != null);
        return {
          senderId: String(senderId),
          text,
          mid,
          hasNonTextContent: hasNonTextContent || undefined,
          attachments: hasNonTextContent ? classifyMessageAttachments(msg) : undefined,
        };
      }
      if (m.message_edit) {
        const text = m.message_edit.text ?? '';
        const mid = m.message_edit.mid;
        return { senderId: String(senderId), text, mid };
      }
      // Reaction event (standalone, not inside message)
      if ((m as Record<string, unknown>).reaction != null) {
        return {
          senderId: String(senderId),
          text: '',
          hasNonTextContent: true,
          attachments: [{ type: 'reaction', payload: (m as Record<string, unknown>).reaction }],
        };
      }
    }
  }

  // Format 2: entry[].changes[] (Instagram Graph API: "messages" or "message_edit")
  for (const entry of entries) {
    const changes = (entry as { changes?: Array<{ field?: string; value?: unknown }> }).changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      if (c?.value == null || typeof c.value !== 'object') continue;
      const v = c.value as {
        sender?: { id?: string };
        message?: { mid?: string; text?: string; is_self?: boolean };
        message_edit?: { mid?: string; text?: string; num_edit?: number };
        is_self?: boolean;
      };
      if (!v?.sender?.id) continue;
      if (v.is_self === true) continue;
      if (c.field === 'messages' && v.message) {
        if (v.message.is_self === true) continue;
        const text = v.message.text ?? '';
        const mid = v.message.mid;
        return { senderId: String(v.sender.id), text, mid };
      }
      if (c.field === 'message_edit' && v.message_edit) {
        const text = v.message_edit.text ?? '';
        const mid = v.message_edit.mid;
        return { senderId: String(v.sender.id), text, mid };
      }
    }
  }

  return null;
}

function getFirstMessageEdit(payload: InstagramWebhookPayload): { mid: string; text: string } | null {
  const entries = payload.entry;
  if (!entries?.length) return null;
  const list = (entries[0] as { messaging?: unknown[] }).messaging;
  if (!Array.isArray(list) || list.length === 0) return null;
  const item = list[0] as { message_edit?: { mid?: string; text?: string } };
  const me = item?.message_edit;
  if (!me || me.mid == null || String(me.mid).length === 0) return null;
  return { mid: String(me.mid), text: me.text ?? '' };
}

/** Reject sender IDs that look like test placeholders (e.g. "12334" from Meta test). Real IG IDs are 15+ digits. */
export function isValidInstagramSenderId(senderId: string): boolean {
  return !!senderId && senderId.length >= 15;
}

function decodeMidExperimental(mid: string): { decoded: string; candidateIds: string[] } | null {
  if (!mid || typeof mid !== 'string' || mid.length < 10) return null;
  try {
    const buf = Buffer.from(mid, 'base64');
    if (buf.length === 0) return null;
    const hex = buf.toString('hex');
    const digitHexPairs = hex.match(/(3[0-9]){15,}/g);
    const allIds = (digitHexPairs ?? []).map((run) =>
      run.replace(/(..)/g, (_, pair) => String.fromCharCode(parseInt(pair, 16)))
    );
    const candidateIds = allIds.filter((id) => id.length >= 15 && id.length <= 20);
    const decoded = buf.toString('utf8').slice(0, 80).replace(/[^\x20-\x7e]/g, '.');
    return { decoded, candidateIds };
  } catch {
    return null;
  }
}

/** @internal Exported for unit tests. */
export async function tryResolveSenderFromMessageEdit(
  payload: InstagramWebhookPayload,
  correlationId: string
): Promise<ParsedInstagramDmPayload | null> {
  const pageIds = getInstagramPageIds(payload);
  if (!pageIds.length) return null;
  const doctorId = await getDoctorIdByPageIds(pageIds, correlationId);
  if (!doctorId) return null;
  const edit = getFirstMessageEdit(payload);
  if (!edit?.mid) return null;
  let senderId = await getSenderIdByPlatformMessageId(doctorId, edit.mid, correlationId);
  if (senderId && pageIds.includes(senderId)) senderId = null; // DB may have stored page ID by mistake
  if (!senderId) {
    const token = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
    if (token) {
      const igId = (await getStoredInstagramPageIdForDoctor(doctorId, correlationId)) ?? undefined;
      senderId = await getSenderFromMostRecentConversation(token, correlationId, igId);
      if (senderId && pageIds.includes(senderId)) senderId = null;
      if (!senderId) {
        senderId = await getInstagramMessageSender(edit.mid, token, correlationId);
        if (senderId && pageIds.includes(senderId)) senderId = null;
      }
      if (senderId) {
        logger.info({ correlationId }, 'Instagram message_edit: resolved sender');
      }
    }
  }
  if (!senderId) {
    const fallback = await getOnlyInstagramConversationSenderId(doctorId, correlationId);
    if (fallback && isValidInstagramSenderId(fallback) && !pageIds.includes(fallback)) {
      senderId = fallback;
    } else if (fallback) {
      logger.info(
        { correlationId, senderIdLength: fallback.length, isPageId: pageIds.includes(fallback) },
        'Ignoring getOnlyInstagramConversationSenderId result (looks like test placeholder or page ID)'
      );
    }
  }

  if (!senderId && edit.mid) {
    const decoded = decodeMidExperimental(edit.mid);
    if (decoded) {
      const candidateIds = decoded.candidateIds.filter((id) => !pageIds.includes(id));
      logger.info(
        {
          correlationId,
          midLength: edit.mid.length,
          decodedLength: decoded.decoded.length,
          decodedPrefix: decoded.decoded.slice(0, 80),
          candidateIdsCount: candidateIds.length,
          candidateIds: candidateIds.slice(0, 5),
        },
        'Experimental: mid decode (check if any candidateId is sender)'
      );
      const firstCandidate = candidateIds.find((id) => isValidInstagramSenderId(id));
      if (firstCandidate) {
        logger.info(
          { correlationId, candidateId: firstCandidate },
          'Experimental: trying decoded mid candidate as sender'
        );
        senderId = firstCandidate;
      }
    }
  }

  if (senderId && pageIds.includes(senderId)) {
    logger.info({ correlationId, senderId }, 'Rejecting resolved sender (is page ID, cannot send to self)');
    return null;
  }
  if (!senderId || !isValidInstagramSenderId(senderId)) return null;
  return { senderId, text: edit.text, mid: edit.mid };
}

async function resolveTenant(
  doctorId: string,
  pageIds: string[],
  correlationId: string
): Promise<InboundTenant | null> {
  const doctorToken = await getInstagramAccessTokenForDoctor(doctorId, correlationId);
  if (!doctorToken) return null;
  const doctorPageId = (await getStoredInstagramPageIdForDoctor(doctorId, correlationId)) ?? null;
  return {
    doctorId,
    doctorToken,
    pageIds,
    doctorPageId,
  };
}

function buildInboundMessage(params: {
  provider: WebhookProvider;
  ctx: ParseCtx;
  payload: InstagramWebhookPayload;
  senderId: string;
  text: string | null;
  attachments?: InboundAttachment[];
  platformMessageId?: string;
  pageIds: string[];
  pageId: string | undefined;
  tenant: InboundTenant | null;
}): InboundMessage {
  return {
    channel: 'instagram',
    surface: 'dm',
    provider: params.provider,
    providerEventId: params.ctx.eventId,
    correlationId: params.ctx.correlationId,
    tenant: params.tenant,
    pageIds: params.pageIds,
    senderId: params.senderId,
    text: params.text,
    attachments: params.attachments,
    platformMessageId: params.platformMessageId,
    webhookEntryId: params.pageId,
    raw: params.payload,
  };
}

function skipResult(skip: ParseInboundSkip): ParseInboundResult {
  return skip;
}

export async function parseInstagramInbound(
  payload: unknown,
  ctx: ParseCtx,
  provider: WebhookProvider
): Promise<ParseInboundResult> {
  const instagramPayload = payload as InstagramWebhookPayload;
  let parsed = parseInstagramMessage(instagramPayload);

  if (!parsed) {
    const fallback = await tryResolveSenderFromMessageEdit(instagramPayload, ctx.correlationId);
    if (fallback) {
      parsed = fallback;
      logger.info(
        { eventId: ctx.eventId, provider, correlationId: ctx.correlationId, mid: fallback.mid },
        'Instagram message_edit: resolved sender (payload had no sender)'
      );
    }
  }

  if (!parsed) {
    return skipResult({ skip: true, reason: 'no_message' });
  }

  const { senderId, mid, hasNonTextContent, attachments } = parsed;
  let { text } = parsed;
  const pageIds = getInstagramPageIds(instagramPayload);
  const pageId = getInstagramPageId(instagramPayload) ?? undefined;

  if (!text?.trim() && hasNonTextContent) {
    const doctorId = pageIds.length
      ? await getDoctorIdByPageIds(pageIds, ctx.correlationId)
      : null;
    const tenant = doctorId ? await resolveTenant(doctorId, pageIds, ctx.correlationId) : null;
    return buildInboundMessage({
      provider,
      ctx,
      payload: instagramPayload,
      senderId,
      text: null,
      attachments,
      platformMessageId: mid,
      pageIds,
      pageId,
      tenant,
    });
  }

  if (!text?.trim()) {
    return skipResult({ skip: true, reason: 'blank_message' });
  }

  if (pageIds.includes(senderId)) {
    return skipResult({
      skip: true,
      reason: 'sender_is_page',
      senderId,
      pageId,
      pageIds,
    });
  }

  if (!pageIds.length) {
    return skipResult({ skip: true, reason: 'no_page_ids', pageId, pageIds });
  }

  const doctorId = await getDoctorIdByPageIds(pageIds, ctx.correlationId);
  if (!doctorId) {
    return skipResult({
      skip: true,
      reason: 'no_doctor',
      senderId,
      pageId,
      pageIds,
    });
  }

  const tenant = await resolveTenant(doctorId, pageIds, ctx.correlationId);
  if (!tenant) {
    return skipResult({
      skip: true,
      reason: 'no_doctor_token',
      senderId,
      pageId,
      pageIds,
      doctorId,
    });
  }

  return buildInboundMessage({
    provider,
    ctx,
    payload: instagramPayload,
    senderId,
    text,
    attachments,
    platformMessageId: mid,
    pageIds,
    pageId,
    tenant,
  });
}
