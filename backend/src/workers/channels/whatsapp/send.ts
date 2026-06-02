/**
 * rcp-13: WhatsApp outbound send stub — no live Cloud API calls.
 */

import type { InboundMessage, OutboundReply, SendOpts, SendResult } from '../types';
import { NotImplementedError } from '../types';

export async function sendWhatsappOutbound(
  _reply: OutboundReply,
  _inbound: InboundMessage,
  _opts: SendOpts
): Promise<SendResult> {
  throw new NotImplementedError('TODO: WhatsApp Cloud send');
}
