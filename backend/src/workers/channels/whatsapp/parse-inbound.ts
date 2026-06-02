/**
 * rcp-13: WhatsApp inbound parsing stub — maps Cloud API shape; tenant lookup not wired.
 */

import type { WebhookProvider, WhatsAppWebhookPayload } from '../../../types/webhook';
import type { InboundMessage, InboundTenant, ParseCtx, ParseInboundResult } from '../types';
import { NotImplementedError } from '../types';

export type ExtractedWhatsappTextInbound = {
  senderId: string;
  text: string;
  messageId: string;
  phoneNumberId: string;
};

/** Map WhatsApp Cloud API text message webhook to normalized fields. */
export function extractWhatsappTextInbound(payload: unknown): ExtractedWhatsappTextInbound | null {
  if (!payload || typeof payload !== 'object') return null;
  const wa = payload as WhatsAppWebhookPayload;
  if (wa.object !== 'whatsapp_business_account' || !Array.isArray(wa.entry)) return null;

  for (const entry of wa.entry) {
    const changes = entry.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const messages = value?.messages;
      if (!phoneNumberId || !Array.isArray(messages) || messages.length === 0) continue;
      const msg = messages[0];
      if (!msg?.from || !msg.id) continue;
      const text = msg.text?.body ?? '';
      return {
        senderId: String(msg.from),
        text,
        messageId: String(msg.id),
        phoneNumberId: String(phoneNumberId),
      };
    }
  }
  return null;
}

/** TODO: resolve doctor + token from WhatsApp Business phone_number_id. */
export async function resolveDoctorByWhatsappPhoneId(
  _phoneNumberId: string,
  _correlationId: string
): Promise<never> {
  throw new NotImplementedError('TODO: resolveDoctorByWhatsappPhoneId');
}

export async function parseWhatsappInbound(
  payload: unknown,
  ctx: ParseCtx,
  provider: WebhookProvider
): Promise<ParseInboundResult> {
  const extracted = extractWhatsappTextInbound(payload);
  if (!extracted) {
    return { skip: true, reason: 'no_message' };
  }

  if (!extracted.text.trim()) {
    return { skip: true, reason: 'blank_message' };
  }

  const tenant = await resolveDoctorByWhatsappPhoneId(extracted.phoneNumberId, ctx.correlationId);
  return buildWhatsappInboundMessage({ extracted, ctx, provider, tenant, payload });
}

export function buildWhatsappInboundMessage(params: {
  extracted: ExtractedWhatsappTextInbound;
  ctx: ParseCtx;
  provider: WebhookProvider;
  tenant: InboundTenant;
  payload: unknown;
}): InboundMessage {
  const { extracted, ctx, provider, tenant, payload } = params;
  return {
    channel: 'whatsapp',
    surface: 'dm',
    provider,
    providerEventId: ctx.eventId,
    correlationId: ctx.correlationId,
    tenant,
    pageIds: [extracted.phoneNumberId],
    senderId: extracted.senderId,
    text: extracted.text,
    platformMessageId: extracted.messageId,
    webhookEntryId: extracted.phoneNumberId,
    raw: payload,
  };
}
