/**
 * rcp-09: Channel adapter registry — resolution and surfaceOf for Instagram payloads.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { InstagramWebhookPayload } from '../../../src/types/webhook';
import {
  resolveChannelAdapter,
  registerChannelAdapter,
  clearChannelAdaptersForTests,
} from '../../../src/workers/channels/registry';
import { instagramChannelAdapter } from '../../../src/workers/channels/instagram';
import * as queue from '../../../src/config/queue';
import * as instagramService from '../../../src/services/instagram-service';

jest.mock('../../../src/config/queue', () => ({
  tryAcquireInstagramSendLock: jest.fn(async () => true),
  tryAcquireReplyThrottle: jest.fn(async () => true),
}));
jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn(async () => ({})),
  getSenderFromMostRecentConversation: jest.fn(async () => null),
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  recordInstagramLastDmSuccess: jest.fn(async () => undefined),
}));
jest.mock('../../../src/services/webhook-idempotency-service', () => ({
  markWebhookProcessed: jest.fn(async () => ({})),
}));
jest.mock('../../../src/services/webhook-metrics', () => ({
  logWebhookConflictRecovery: jest.fn(),
  logWebhookDmThrottleSkip: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));

const dmPayload: InstagramWebhookPayload = {
  object: 'instagram',
  entry: [
    {
      id: 'page-entry-1',
      time: Math.floor(Date.now() / 1000),
      messaging: [
        {
          sender: { id: '987654321012345' },
          recipient: { id: '123456789012345' },
          timestamp: Math.floor(Date.now() / 1000),
          message: { mid: 'mid.test', text: 'hello' },
        },
      ],
    },
  ],
};

const commentPayload = {
  object: 'instagram',
  entry: [
    {
      id: 'page-entry-comment',
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: 'comments',
          value: {
            id: 'comment-id-99',
            text: 'Need to schedule visit',
            from: { id: '777666555444333' },
            media: { id: 'media-m1' },
          },
        },
      ],
    },
  ],
};

describe('channel adapter registry (rcp-09)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearChannelAdaptersForTests();
    registerChannelAdapter(instagramChannelAdapter);
    jest.mocked(queue.tryAcquireInstagramSendLock).mockResolvedValue(true);
    jest.mocked(queue.tryAcquireReplyThrottle).mockResolvedValue(true);
    jest.mocked(instagramService.sendInstagramMessage).mockResolvedValue({} as never);
  });

  it('resolves Instagram adapter for instagram provider', () => {
    const adapter = resolveChannelAdapter('instagram', dmPayload);
    expect(adapter).toBe(instagramChannelAdapter);
  });

  it('returns null for an unimplemented provider', () => {
    expect(resolveChannelAdapter('whatsapp', dmPayload)).toBeNull();
    expect(resolveChannelAdapter('facebook', dmPayload)).toBeNull();
  });

  it('surfaceOf splits comment vs dm correctly', () => {
    const adapter = resolveChannelAdapter('instagram', dmPayload)!;
    expect(adapter.surfaceOf(dmPayload)).toBe('dm');
    expect(adapter.surfaceOf(commentPayload)).toBe('comment');
  });

  it('send is wired through the adapter', async () => {
    const adapter = resolveChannelAdapter('instagram', dmPayload)!;
    const result = await adapter.send(
      { text: 'hi' },
      {
        channel: 'instagram',
        surface: 'dm',
        provider: 'instagram',
        providerEventId: 'evt-1',
        correlationId: 'corr-1',
        tenant: {
          doctorId: 'doc-1',
          doctorToken: 'token',
          pageIds: ['123456789012345'],
          doctorPageId: '123456789012345',
        },
        pageIds: ['123456789012345'],
        senderId: '987654321012345',
        text: 'hello',
        webhookEntryId: '123456789012345',
        raw: dmPayload,
      }
    );
    expect(result.status).toBe('sent');
  });
});
