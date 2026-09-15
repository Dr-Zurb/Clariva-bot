/**
 * fbm-04: Facebook Page Messenger channel adapter.
 */

import type { WebhookProvider } from '../../../types/webhook';
import { isFacebookPageCommentPayload } from '../../../utils/webhook-event-id';
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
import { parseFacebookInbound } from './parse-inbound';
import { sendFacebookOutbound } from './send';

export const facebookChannelAdapter: ChannelAdapter = {
  channel: 'facebook',

  matches(provider: WebhookProvider, payload: unknown): boolean {
    if (provider === 'facebook') return true;
    const obj =
      payload && typeof payload === 'object'
        ? (payload as { object?: string }).object
        : undefined;
    return provider === 'instagram' && obj === 'page';
  },

  surfaceOf(payload: unknown): Surface {
    return isFacebookPageCommentPayload(payload) ? 'comment' : 'dm';
  },

  async parseInbound(payload: unknown, ctx: ParseCtx): Promise<ParseInboundResult> {
    return parseFacebookInbound(payload, ctx, 'facebook');
  },

  async send(reply: OutboundReply, inbound: InboundMessage, opts?: SendOpts): Promise<SendResult> {
    return sendFacebookOutbound(reply, inbound, opts ?? { context: 'default' });
  },
};
