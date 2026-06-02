/**
 * rcp-09: Channel port interfaces — typed boundary every channel adapter implements.
 * Engine and stages stay channel-free; adapters own provider-specific I/O.
 */

import type { WebhookProvider } from '../../types/webhook';

export type ChannelId = 'instagram' | 'whatsapp';

export type Surface = 'dm' | 'comment';

/** Minimal attachment shape for non-text inbound (sticker/image/reaction). */
export interface InboundAttachment {
  type: string;
  payload?: unknown;
}

export type ParseInboundResult = InboundMessage | ParseInboundSkip;

export type InboundSkipReason =
  | 'no_message'
  | 'blank_message'
  | 'sender_is_page'
  | 'no_page_ids'
  | 'no_doctor'
  | 'no_doctor_token';

export interface ParseInboundSkip {
  skip: true;
  reason: InboundSkipReason;
  senderId?: string;
  pageId?: string;
  pageIds?: string[];
  doctorId?: string;
}

export interface InboundTenant {
  doctorId: string;
  doctorToken: string;
  pageIds: string[];
  doctorPageId: string | null;
}

export interface InboundMessage {
  channel: ChannelId;
  surface: Surface;
  provider: WebhookProvider;
  /** Idempotency key (today's eventId). */
  providerEventId: string;
  correlationId: string;
  /** Resolved when doctor linked; null for non-text when doctor unknown. */
  tenant: InboundTenant | null;
  /** Page ids from payload (always set after extraction). */
  pageIds: string[];
  /** Normalized sender; never a page id. */
  senderId: string;
  /** null = non-text (sticker/image/reaction). */
  text: string | null;
  attachments?: InboundAttachment[];
  /** Instagram message mid when present. */
  platformMessageId?: string;
  /** Send-time targeting / 2018001 fallback. */
  webhookEntryId: string | undefined;
  /** Provider payload for adapter-only use — engine must never read this. */
  raw: unknown;
}

export interface OutboundReply {
  text: string;
}

export type SendPathContext = 'default' | 'conflict_recovery';

export interface SendOpts {
  context: SendPathContext;
}

export type SendResult =
  | { status: 'sent'; usedRecipientFallback: boolean }
  | { status: 'throttle_skipped'; reason: 'send_lock' | 'reply_throttle' }
  | { status: 'skipped'; reason: string };

export interface ParseCtx {
  eventId: string;
  correlationId: string;
}

export class NotImplementedError extends Error {
  readonly name = 'NotImplementedError';

  constructor(method: string) {
    super(`${method} is not implemented yet`);
  }
}

export interface ChannelAdapter {
  channel: ChannelId;
  matches(provider: WebhookProvider, payload: unknown): boolean;
  surfaceOf(payload: unknown): Surface;
  parseInbound(payload: unknown, ctx: ParseCtx): Promise<ParseInboundResult>;
  send(reply: OutboundReply, inbound: InboundMessage, opts?: SendOpts): Promise<SendResult>;
}
