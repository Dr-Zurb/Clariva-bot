/**
 * fbm-04: Facebook adapter send — Page path via shared DM send helper.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { InboundMessage } from '../../../../src/workers/channels/types';
import { sendFacebookOutbound } from '../../../../src/workers/channels/facebook/send';
import * as webhookDmSend from '../../../../src/workers/webhook-dm-send';
import * as facebookConnectService from '../../../../src/services/facebook-connect-service';

jest.mock('../../../../src/workers/webhook-dm-send');
jest.mock('../../../../src/services/facebook-connect-service', () => ({
  recordFacebookLastDmSuccess: jest.fn(async () => undefined),
}));

const PAGE_ID = '111222333444555';
const PSID = '987654321098765';

function inbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channel: 'facebook',
    surface: 'dm',
    provider: 'facebook',
    providerEventId: 'evt-fb-1',
    correlationId: 'corr-fb-1',
    tenant: {
      doctorId: 'doctor-1',
      doctorToken: 'page-tok',
      pageIds: [PAGE_ID],
      doctorPageId: PAGE_ID,
    },
    pageIds: [PAGE_ID],
    senderId: PSID,
    text: 'hello',
    webhookEntryId: PAGE_ID,
    raw: { object: 'page', entry: [] },
    ...overrides,
  };
}

describe('sendFacebookOutbound (fbm-04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(webhookDmSend.sendInstagramDmWithLocksAndFallback).mockResolvedValue({
      status: 'sent',
      usedRecipientFallback: false,
    });
  });

  it('sends via shared helper with facebook provider and records last DM success', async () => {
    const result = await sendFacebookOutbound(
      { text: 'Hello from Page' },
      inbound(),
      { context: 'default' }
    );

    expect(result).toEqual({ status: 'sent', usedRecipientFallback: false });
    expect(webhookDmSend.sendInstagramDmWithLocksAndFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: PAGE_ID,
        senderId: PSID,
        replyText: 'Hello from Page',
        doctorToken: 'page-tok',
        provider: 'facebook',
        doctorId: 'doctor-1',
      })
    );
    expect(facebookConnectService.recordFacebookLastDmSuccess).toHaveBeenCalledWith(
      'doctor-1',
      'corr-fb-1'
    );
  });

  it('does not record last DM when throttle skips', async () => {
    jest.mocked(webhookDmSend.sendInstagramDmWithLocksAndFallback).mockResolvedValue({
      status: 'throttle_skipped',
      reason: 'send_lock',
    });

    const result = await sendFacebookOutbound(
      { text: 'Hello' },
      inbound(),
      { context: 'default' }
    );

    expect(result).toEqual({ status: 'throttle_skipped', reason: 'send_lock' });
    expect(facebookConnectService.recordFacebookLastDmSuccess).not.toHaveBeenCalled();
  });
});
