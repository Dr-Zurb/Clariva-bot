/**
 * fbm-04: Facebook parse-inbound — skip reasons + happy path tenant resolution.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { FacebookWebhookPayload } from '../../../../src/types/webhook';
import { parseFacebookInbound } from '../../../../src/workers/channels/facebook/parse-inbound';
import * as facebookConnectService from '../../../../src/services/facebook-connect-service';

jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../src/services/facebook-connect-service');

const PAGE_ID = '111222333444555';
const PSID = '987654321098765';
const DOCTOR_ID = 'doctor-fb-1';
const PAGE_TOKEN = 'page-token-test';

function pagePayload(
  messaging: NonNullable<FacebookWebhookPayload['entry'][0]['messaging']>
): FacebookWebhookPayload {
  return {
    object: 'page',
    entry: [
      {
        id: PAGE_ID,
        time: Math.floor(Date.now() / 1000),
        messaging,
      },
    ],
  };
}

describe('parseFacebookInbound (fbm-04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(facebookConnectService.getDoctorIdByFacebookPageId)
      .mockResolvedValue(DOCTOR_ID);
    jest
      .mocked(facebookConnectService.getFacebookPageAccessTokenForDoctor)
      .mockResolvedValue(PAGE_TOKEN);
    jest
      .mocked(facebookConnectService.getStoredFacebookPageIdForDoctor)
      .mockResolvedValue(PAGE_ID);
  });

  it('returns inbound for a normal Page Messenger DM', async () => {
    const payload = pagePayload([
      {
        sender: { id: PSID },
        recipient: { id: PAGE_ID },
        timestamp: Math.floor(Date.now() / 1000),
        message: { mid: 'mid.fb.1', text: 'Hello clinic' },
      },
    ]);

    const result = await parseFacebookInbound(
      payload,
      { eventId: 'mid.fb.1', correlationId: 'corr-1' },
      'facebook'
    );

    expect(result).toMatchObject({
      channel: 'facebook',
      surface: 'dm',
      provider: 'facebook',
      senderId: PSID,
      text: 'Hello clinic',
      platformMessageId: 'mid.fb.1',
      tenant: {
        doctorId: DOCTOR_ID,
        doctorToken: PAGE_TOKEN,
        doctorPageId: PAGE_ID,
      },
    });
  });

  it('skips echo (is_echo)', async () => {
    const payload = pagePayload([
      {
        sender: { id: PAGE_ID },
        recipient: { id: PSID },
        timestamp: Math.floor(Date.now() / 1000),
        message: { mid: 'mid.echo', text: 'bot reply', is_echo: true } as {
          mid: string;
          text?: string;
        },
      },
    ]);

    const result = await parseFacebookInbound(
      payload,
      { eventId: 'mid.echo', correlationId: 'corr-1' },
      'facebook'
    );
    expect(result).toEqual(
      expect.objectContaining({ skip: true, reason: 'sender_is_page' })
    );
  });

  it('skips read receipts (no message)', async () => {
    const payload = pagePayload([
      {
        sender: { id: PSID },
        recipient: { id: PAGE_ID },
        timestamp: Math.floor(Date.now() / 1000),
        read: { watermark: 123 },
      } as never,
    ]);

    const result = await parseFacebookInbound(
      payload,
      { eventId: 'read-1', correlationId: 'corr-1' },
      'facebook'
    );
    expect(result).toEqual(
      expect.objectContaining({ skip: true, reason: 'no_message' })
    );
  });

  it('skips when no doctor for Page id', async () => {
    jest
      .mocked(facebookConnectService.getDoctorIdByFacebookPageId)
      .mockResolvedValue(null);

    const payload = pagePayload([
      {
        sender: { id: PSID },
        recipient: { id: PAGE_ID },
        timestamp: Math.floor(Date.now() / 1000),
        message: { mid: 'mid.fb.2', text: 'hi' },
      },
    ]);

    const result = await parseFacebookInbound(
      payload,
      { eventId: 'mid.fb.2', correlationId: 'corr-1' },
      'facebook'
    );
    expect(result).toEqual(
      expect.objectContaining({ skip: true, reason: 'no_doctor' })
    );
  });
});
