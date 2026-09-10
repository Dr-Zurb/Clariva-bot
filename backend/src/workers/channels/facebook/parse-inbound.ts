/**
 * fbm-04: Facebook Page Messenger inbound parse + tenant resolution.
 */

import { logger } from '../../../config/logger';
import {
  getDoctorIdByFacebookPageId,
  getFacebookPageAccessTokenForDoctor,
  getStoredFacebookPageIdForDoctor,
} from '../../../services/facebook-connect-service';
import type { WebhookProvider } from '../../../types/webhook';
import type {
  InboundAttachment,
  InboundMessage,
  InboundTenant,
  ParseCtx,
  ParseInboundResult,
} from '../types';

type PageWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    messaging?: Array<Record<string, unknown>>;
  }>;
};

function getPageIds(payload: PageWebhookPayload): string[] {
  const ids: string[] = [];
  for (const entry of payload.entry ?? []) {
    if (entry.id != null) ids.push(String(entry.id));
  }
  return [...new Set(ids)];
}

function classifyAttachments(msg: Record<string, unknown>): InboundAttachment[] | undefined {
  const attachments: InboundAttachment[] = [];
  if (Array.isArray(msg.attachments)) {
    for (const item of msg.attachments) {
      attachments.push({ type: 'attachment', payload: item });
    }
  }
  if (msg.sticker_id != null) {
    attachments.push({ type: 'sticker', payload: { sticker_id: msg.sticker_id } });
  }
  return attachments.length > 0 ? attachments : undefined;
}

export async function parseFacebookInbound(
  payload: unknown,
  ctx: ParseCtx,
  provider: WebhookProvider
): Promise<ParseInboundResult> {
  const body = payload as PageWebhookPayload;
  if (body.object !== 'page') {
    return { skip: true, reason: 'no_message' };
  }

  const pageIds = getPageIds(body);
  if (pageIds.length === 0) {
    return { skip: true, reason: 'no_page_ids' };
  }

  const pageId = pageIds[0];
  let messagingItem: Record<string, unknown> | null = null;
  for (const entry of body.entry ?? []) {
    const list = entry.messaging;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item === 'object') {
        messagingItem = item as Record<string, unknown>;
        break;
      }
    }
    if (messagingItem) break;
  }

  if (!messagingItem) {
    return { skip: true, reason: 'no_message', pageIds, pageId };
  }

  const msg = messagingItem.message as Record<string, unknown> | undefined;
  if (messagingItem.is_echo === true || msg?.is_echo === true) {
    return { skip: true, reason: 'sender_is_page', pageIds, pageId };
  }

  let senderId =
    (messagingItem.sender as { id?: string } | undefined)?.id ??
    (typeof messagingItem.sender_id === 'string' ? messagingItem.sender_id : undefined);

  if (!senderId) {
    return { skip: true, reason: 'no_message', pageIds, pageId };
  }
  if (pageIds.includes(senderId)) {
    return { skip: true, reason: 'sender_is_page', senderId, pageIds, pageId };
  }

  if (!msg) {
    // read/delivery etc.
    return { skip: true, reason: 'no_message', senderId, pageIds, pageId };
  }

  const textRaw = typeof msg.text === 'string' ? msg.text : '';
  const text = textRaw.trim().length > 0 ? textRaw : null;
  const attachments = classifyAttachments(msg);
  const mid = typeof msg.mid === 'string' ? msg.mid : undefined;

  if (text === null && !attachments?.length) {
    return { skip: true, reason: 'blank_message', senderId, pageIds, pageId };
  }

  const doctorId = await getDoctorIdByFacebookPageId(pageId, ctx.correlationId);
  if (!doctorId) {
    logger.info(
      { eventId: ctx.eventId, correlationId: ctx.correlationId, pageIds },
      'Facebook webhook: no doctor for Page id'
    );
    return { skip: true, reason: 'no_doctor', pageIds, pageId };
  }

  const doctorToken = await getFacebookPageAccessTokenForDoctor(doctorId, ctx.correlationId);
  if (!doctorToken) {
    return { skip: true, reason: 'no_doctor_token', doctorId, pageIds, pageId };
  }

  const doctorPageId =
    (await getStoredFacebookPageIdForDoctor(doctorId, ctx.correlationId)) ?? pageId;

  const tenant: InboundTenant = {
    doctorId,
    doctorToken,
    pageIds,
    doctorPageId,
  };

  const inbound: InboundMessage = {
    channel: 'facebook',
    surface: 'dm',
    provider,
    providerEventId: ctx.eventId,
    correlationId: ctx.correlationId,
    tenant,
    pageIds,
    senderId,
    text,
    attachments,
    platformMessageId: mid,
    webhookEntryId: pageId,
    raw: payload,
  };

  return inbound;
}
