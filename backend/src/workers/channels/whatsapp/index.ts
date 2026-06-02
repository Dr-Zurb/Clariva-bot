/**
 * rcp-13: WhatsApp channel adapter stub — compiles against ChannelAdapter; no live I/O.
 */

import type { WebhookProvider } from '../../../types/webhook';
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundReply,
  ParseCtx,
  ParseInboundResult,
  SendOpts,
  SendResult,
  Surface,
} from '../types';
import { parseWhatsappInbound } from './parse-inbound';
import { sendWhatsappOutbound } from './send';

export const whatsappChannelAdapter: ChannelAdapter = {
  channel: 'whatsapp',

  matches(provider: WebhookProvider, _payload: unknown): boolean {
    return provider === 'whatsapp';
  },

  surfaceOf(_payload: unknown): Surface {
    return 'dm';
  },

  async parseInbound(payload: unknown, ctx: ParseCtx): Promise<ParseInboundResult> {
    return parseWhatsappInbound(payload, ctx, 'whatsapp');
  },

  async send(reply: OutboundReply, inbound: InboundMessage, opts?: SendOpts): Promise<SendResult> {
    return sendWhatsappOutbound(reply, inbound, opts ?? { context: 'default' });
  },
};
