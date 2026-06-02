/**
 * rcp-09: Instagram channel adapter shell — matches/surfaceOf wired; parse/send filled by rcp-10/11.
 */

import type { WebhookProvider } from '../../../types/webhook';
import { isInstagramCommentPayload } from '../../../utils/webhook-event-id';
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
import { parseInstagramInbound } from './parse-inbound';
import { sendInstagramOutbound } from './send';

export const instagramChannelAdapter: ChannelAdapter = {
  channel: 'instagram',

  matches(provider: WebhookProvider, _payload: unknown): boolean {
    return provider === 'instagram';
  },

  surfaceOf(payload: unknown): Surface {
    return isInstagramCommentPayload(payload) ? 'comment' : 'dm';
  },

  async parseInbound(payload: unknown, ctx: ParseCtx): Promise<ParseInboundResult> {
    return parseInstagramInbound(payload, ctx, 'instagram');
  },

  async send(reply: OutboundReply, inbound: InboundMessage, opts?: SendOpts): Promise<SendResult> {
    return sendInstagramOutbound(reply, inbound, opts ?? { context: 'default' });
  },
};
