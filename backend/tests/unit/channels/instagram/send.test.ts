/**
 * rcp-11: Instagram adapter send — maps InboundMessage to sendInstagramDmWithLocksAndFallback.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { InboundMessage } from '../../../../src/workers/channels/types';
import { sendInstagramOutbound } from '../../../../src/workers/channels/instagram/send';
import * as queue from '../../../../src/config/queue';
import * as instagramService from '../../../../src/services/instagram-service';
import * as idempotency from '../../../../src/services/webhook-idempotency-service';
import * as auditLogger from '../../../../src/utils/audit-logger';
import { NotFoundError } from '../../../../src/utils/errors';

jest.mock('../../../../src/config/queue');
jest.mock('../../../../src/services/instagram-service');
jest.mock('../../../../src/services/instagram-connect-service', () => ({
  recordInstagramLastDmSuccess: jest.fn(async () => undefined),
}));
jest.mock('../../../../src/services/webhook-idempotency-service');
jest.mock('../../../../src/services/webhook-metrics', () => ({
  logWebhookConflictRecovery: jest.fn(),
  logWebhookDmThrottleSkip: jest.fn(),
}));
jest.mock('../../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(),
}));

const PAGE_WEBHOOK = '123456789012345';
const PAGE_DOC = '999888777666111';
const SENDER_ID = '987654321012345';

function inbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channel: 'instagram',
    surface: 'dm',
    provider: 'instagram',
    providerEventId: 'evt-1',
    correlationId: 'corr-1',
    tenant: {
      doctorId: 'doctor-1',
      doctorToken: 'tok',
      pageIds: [PAGE_WEBHOOK],
      doctorPageId: PAGE_DOC,
    },
    pageIds: [PAGE_WEBHOOK],
    senderId: SENDER_ID,
    text: 'hello',
    webhookEntryId: PAGE_WEBHOOK,
    raw: { object: 'instagram', entry: [] },
    ...overrides,
  };
}

describe('sendInstagramOutbound (rcp-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(queue.tryAcquireInstagramSendLock).mockResolvedValue(true);
    jest.mocked(queue.tryAcquireReplyThrottle).mockResolvedValue(true);
    jest.mocked(instagramService.sendInstagramMessage).mockResolvedValue({} as never);
    jest.mocked(idempotency.markWebhookProcessed).mockResolvedValue({} as never);
    jest.mocked(auditLogger.logAuditEvent).mockResolvedValue(undefined as never);
  });

  it('returns sent when primary send succeeds', async () => {
    const result = await sendInstagramOutbound({ text: 'Hello' }, inbound(), { context: 'default' });
    expect(result).toEqual({ status: 'sent', usedRecipientFallback: false });
    expect(instagramService.sendInstagramMessage).toHaveBeenCalledWith(
      SENDER_ID,
      'Hello',
      'corr-1',
      'tok'
    );
  });

  it('returns throttle_skipped when send lock not acquired', async () => {
    jest.mocked(queue.tryAcquireInstagramSendLock).mockResolvedValue(false);
    const result = await sendInstagramOutbound({ text: 'Hello' }, inbound(), { context: 'default' });
    expect(result).toEqual({ status: 'throttle_skipped', reason: 'send_lock' });
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(idempotency.markWebhookProcessed).toHaveBeenCalledWith('evt-1', 'instagram');
  });

  it('returns throttle_skipped when reply throttle not acquired', async () => {
    jest.mocked(queue.tryAcquireReplyThrottle).mockResolvedValue(false);
    const result = await sendInstagramOutbound({ text: 'Hello' }, inbound(), { context: 'default' });
    expect(result).toEqual({ status: 'throttle_skipped', reason: 'reply_throttle' });
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
  });

  it('uses conversation fallback when primary NotFound and pages mismatch', async () => {
    jest
      .mocked(instagramService.sendInstagramMessage)
      .mockRejectedValueOnce(new NotFoundError('ig user'))
      .mockResolvedValueOnce({} as never);
    jest
      .mocked(instagramService.getSenderFromMostRecentConversation)
      .mockResolvedValueOnce('resolved-ig');

    const result = await sendInstagramOutbound(
      { text: 'Hello' },
      inbound({
        webhookEntryId: PAGE_WEBHOOK,
        pageIds: [PAGE_WEBHOOK],
        tenant: {
          doctorId: 'doctor-1',
          doctorToken: 'tok',
          pageIds: [PAGE_WEBHOOK],
          doctorPageId: PAGE_DOC,
        },
      }),
      { context: 'default' }
    );

    expect(result).toEqual({ status: 'sent', usedRecipientFallback: true });
    expect(instagramService.sendInstagramMessage).toHaveBeenCalledTimes(2);
    expect(instagramService.sendInstagramMessage).toHaveBeenLastCalledWith(
      'resolved-ig',
      'Hello',
      'corr-1',
      'tok'
    );
  });

  it('rejects fallback id when it is a page id', async () => {
    jest.mocked(instagramService.sendInstagramMessage).mockRejectedValueOnce(new NotFoundError('ig user'));
    jest
      .mocked(instagramService.getSenderFromMostRecentConversation)
      .mockResolvedValueOnce(PAGE_WEBHOOK);

    await expect(
      sendInstagramOutbound(
        { text: 'Hello' },
        inbound({
          webhookEntryId: PAGE_WEBHOOK,
          pageIds: [PAGE_WEBHOOK],
          tenant: {
            doctorId: 'doctor-1',
            doctorToken: 'tok',
            pageIds: [PAGE_WEBHOOK],
            doctorPageId: PAGE_DOC,
          },
        }),
        { context: 'default' }
      )
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(instagramService.sendInstagramMessage).toHaveBeenCalledTimes(1);
  });

  it('maps pageId from pageIds[0] with webhookEntryId fallback', async () => {
    await sendInstagramOutbound(
      { text: 'Hello' },
      inbound({ pageIds: [], webhookEntryId: PAGE_WEBHOOK }),
      { context: 'default' }
    );
    expect(queue.tryAcquireInstagramSendLock).toHaveBeenCalledWith(PAGE_WEBHOOK, SENDER_ID, 'evt-1');
  });
});
