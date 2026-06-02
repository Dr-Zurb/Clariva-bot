/**
 * RBH-04: DM send locks + throttle + fallback helper
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as queue from '../../../src/config/queue';
import * as instagramService from '../../../src/services/instagram-service';
import * as idempotency from '../../../src/services/webhook-idempotency-service';
import * as auditLogger from '../../../src/utils/audit-logger';
import { NotFoundError } from '../../../src/utils/errors';
import { sendInstagramDmWithLocksAndFallback } from '../../../src/workers/webhook-dm-send';

jest.mock('../../../src/config/queue');
jest.mock('../../../src/services/instagram-service');
jest.mock('../../../src/services/webhook-idempotency-service');
jest.mock('../../../src/services/webhook-metrics', () => ({
  logWebhookConflictRecovery: jest.fn(),
  logWebhookDmThrottleSkip: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(),
}));

const baseParams = {
  pageId: 'page-a',
  senderId: 'sender-1',
  replyText: 'Hello',
  doctorToken: 'tok',
  correlationId: 'corr-1',
  eventId: 'evt-1',
  provider: 'instagram' as const,
  webhookEntryId: 'page-a' as string | undefined,
  doctorPageId: 'page-doc' as string | null,
  pageIds: ['page-a'],
};

describe('sendInstagramDmWithLocksAndFallback (RBH-04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(queue.tryAcquireInstagramSendLock).mockResolvedValue(true);
    jest.mocked(queue.tryAcquireReplyThrottle).mockResolvedValue(true);
    jest.mocked(instagramService.sendInstagramMessage).mockResolvedValue({} as never);
    jest.mocked(idempotency.markWebhookProcessed).mockResolvedValue({} as never);
    jest.mocked(auditLogger.logAuditEvent).mockResolvedValue(undefined as never);
  });

  it('returns throttle_skipped when send lock not acquired', async () => {
    jest.mocked(queue.tryAcquireInstagramSendLock).mockResolvedValue(false);
    const r = await sendInstagramDmWithLocksAndFallback({ ...baseParams, context: 'default' });
    expect(r).toEqual({ status: 'throttle_skipped', reason: 'send_lock' });
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(idempotency.markWebhookProcessed).toHaveBeenCalledWith('evt-1', 'instagram');
  });

  it('returns throttle_skipped when reply throttle not acquired', async () => {
    jest.mocked(queue.tryAcquireReplyThrottle).mockResolvedValue(false);
    const r = await sendInstagramDmWithLocksAndFallback({ ...baseParams, context: 'default' });
    expect(r).toEqual({ status: 'throttle_skipped', reason: 'reply_throttle' });
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
  });

  it('sends and returns sent without fallback when primary succeeds', async () => {
    const r = await sendInstagramDmWithLocksAndFallback({ ...baseParams, context: 'default' });
    expect(r).toEqual({ status: 'sent', usedRecipientFallback: false });
    expect(instagramService.sendInstagramMessage).toHaveBeenCalledWith(
      'sender-1',
      'Hello',
      'corr-1',
      'tok'
    );
  });

  it('uses conversation fallback when primary NotFound and pages mismatch', async () => {
    jest
      .mocked(instagramService.sendInstagramMessage)
      .mockRejectedValueOnce(new NotFoundError('ig user'))
      .mockResolvedValueOnce({} as never);
    jest
      .mocked(instagramService.getSenderFromMostRecentConversation)
      .mockResolvedValueOnce('resolved-ig');

    const r = await sendInstagramDmWithLocksAndFallback({
      ...baseParams,
      webhookEntryId: 'page-webhook',
      doctorPageId: 'page-doc',
      pageIds: ['page-webhook'],
      context: 'default',
    });

    expect(r).toEqual({ status: 'sent', usedRecipientFallback: true });
    expect(instagramService.sendInstagramMessage).toHaveBeenCalledTimes(2);
    expect(instagramService.sendInstagramMessage).toHaveBeenLastCalledWith(
      'resolved-ig',
      'Hello',
      'corr-1',
      'tok'
    );
  });

  it('skips locks when pageId undefined but still attempts send', async () => {
    const r = await sendInstagramDmWithLocksAndFallback({
      ...baseParams,
      pageId: undefined,
      context: 'default',
    });
    expect(r.status).toBe('sent');
    expect(queue.tryAcquireInstagramSendLock).not.toHaveBeenCalled();
    expect(queue.tryAcquireReplyThrottle).not.toHaveBeenCalled();
  });
});
