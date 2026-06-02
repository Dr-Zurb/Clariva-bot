/**
 * rcp-11: Instagram outbound send — maps InboundMessage + OutboundReply to sendInstagramDmWithLocksAndFallback.
 *
 * Note: sendInstagramDmWithLocksAndFallback also calls markWebhookProcessed + logAuditEvent on
 * throttle-skip (channel send mixed with idempotency/audit). Kept inside the adapter for
 * behavior parity; hoisting markWebhookProcessed to the worker is a candidate cleanup for rcp-12.
 */

import { sendInstagramDmWithLocksAndFallback } from '../../webhook-dm-send';
import type { InboundMessage, OutboundReply, SendOpts, SendResult } from '../types';

export async function sendInstagramOutbound(
  reply: OutboundReply,
  inbound: InboundMessage,
  opts: SendOpts
): Promise<SendResult> {
  const tenant = inbound.tenant;
  if (!tenant) {
    throw new Error('Instagram send requires resolved tenant');
  }

  // Preserve pageIds[0] ?? getInstagramPageId(...) fallback (inbound.webhookEntryId).
  const pageIdForSend = inbound.pageIds[0] ?? inbound.webhookEntryId;

  return sendInstagramDmWithLocksAndFallback({
    pageId: pageIdForSend,
    senderId: inbound.senderId,
    replyText: reply.text,
    doctorToken: tenant.doctorToken,
    doctorId: tenant.doctorId,
    correlationId: inbound.correlationId,
    eventId: inbound.providerEventId,
    provider: inbound.provider,
    webhookEntryId: pageIdForSend,
    doctorPageId: tenant.doctorPageId,
    pageIds: inbound.pageIds,
    context: opts.context,
  });
}
