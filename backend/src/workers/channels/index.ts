/**
 * rcp-09: Channel adapters — register at module load so webhook-worker can resolve.
 */

import { env } from '../../config/env';
import { registerChannelAdapter } from './registry';
import { instagramChannelAdapter } from './instagram';
import { facebookChannelAdapter } from './facebook';
import { whatsappChannelAdapter } from './whatsapp';

// Facebook before Instagram so object=page payloads match the FB adapter first.
registerChannelAdapter(facebookChannelAdapter);
registerChannelAdapter(instagramChannelAdapter);

if (env.WHATSAPP_ENABLED) {
  registerChannelAdapter(whatsappChannelAdapter);
}

export { resolveChannelAdapter, registerChannelAdapter } from './registry';
export type {
  ChannelAdapter,
  ChannelId,
  InboundAttachment,
  InboundMessage,
  InboundSkipReason,
  InboundTenant,
  OutboundReply,
  ParseCtx,
  ParseInboundResult,
  ParseInboundSkip,
  SendOpts,
  SendPathContext,
  SendResult,
  Surface,
} from './types';
export { NotImplementedError } from './types';
export { instagramChannelAdapter } from './instagram';
export { facebookChannelAdapter } from './facebook';
export { whatsappChannelAdapter } from './whatsapp';
