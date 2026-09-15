/**
 * fbm-04: Facebook Messenger outbound — Page token on graph.facebook.com via shared send helper.
 */

import { sendInstagramDmWithLocksAndFallback } from '../../webhook-dm-send';
import { recordFacebookLastDmSuccess } from '../../../services/facebook-connect-service';
import type { InboundMessage, OutboundReply, SendOpts, SendResult } from '../types';

export async function sendFacebookOutbound(
  reply: OutboundReply,
  inbound: InboundMessage,
  opts: SendOpts
): Promise<SendResult> {
  const tenant = inbound.tenant;
  if (!tenant) {
    throw new Error('Facebook send requires resolved tenant');
  }

  const pageIdForSend = inbound.pageIds[0] ?? inbound.webhookEntryId;

  const result = await sendInstagramDmWithLocksAndFallback({
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

  if (result.status === 'sent') {
    await recordFacebookLastDmSuccess(tenant.doctorId, inbound.correlationId);
  }

  return result;
}
