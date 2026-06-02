/**
 * rcp-10: Instagram parse-inbound — sender/page-id disambiguation matrix + skip paths.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { InstagramWebhookPayload } from '../../../../src/types/webhook';
import {
  parseInstagramMessage,
  parseInstagramInbound,
  tryResolveSenderFromMessageEdit,
  isValidInstagramSenderId,
} from '../../../../src/workers/channels/instagram/parse-inbound';
import * as instagramConnectService from '../../../../src/services/instagram-connect-service';
import * as instagramService from '../../../../src/services/instagram-service';
import * as conversationService from '../../../../src/services/conversation-service';
import * as messageService from '../../../../src/services/message-service';

jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../src/services/instagram-connect-service');
jest.mock('../../../../src/services/instagram-service');
jest.mock('../../../../src/services/conversation-service');
jest.mock('../../../../src/services/message-service');

const PAGE_ID = '123456789012345';
const CUSTOMER_ID = '987654321012345';
const DOCTOR_ID = 'doctor-test-1';

function dmPayloadWithMessaging(messaging: unknown): InstagramWebhookPayload {
  return {
    object: 'instagram',
    entry: [
      {
        id: PAGE_ID,
        time: Math.floor(Date.now() / 1000),
        messaging: messaging as InstagramWebhookPayload['entry'][0]['messaging'],
      },
    ],
  };
}

describe('parseInstagramMessage sender disambiguation (rcp-10)', () => {
  it('uses recipient when sender is the page id', () => {
    const payload = dmPayloadWithMessaging([
      {
        sender: { id: PAGE_ID },
        recipient: { id: CUSTOMER_ID },
        timestamp: Math.floor(Date.now() / 1000),
        message: { mid: 'mid.page-as-sender', text: 'hello' },
      },
    ]);
    const parsed = parseInstagramMessage(payload);
    expect(parsed).toEqual({
      senderId: CUSTOMER_ID,
      text: 'hello',
      mid: 'mid.page-as-sender',
    });
  });

  it('returns null when sender is page id and recipient is also a page id', () => {
    const otherPage = '111222333444555';
    const payload: InstagramWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          id: PAGE_ID,
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: { id: PAGE_ID },
              recipient: { id: otherPage },
              timestamp: Math.floor(Date.now() / 1000),
              message: { mid: 'mid.both-pages', text: 'hello' },
            },
          ],
        },
        {
          id: otherPage,
          time: Math.floor(Date.now() / 1000),
        },
      ],
    };
    expect(parseInstagramMessage(payload)).toBeNull();
  });

  it('returns customer sender for a normal DM', () => {
    const payload = dmPayloadWithMessaging([
      {
        sender: { id: CUSTOMER_ID },
        recipient: { id: PAGE_ID },
        timestamp: Math.floor(Date.now() / 1000),
        message: { mid: 'mid.normal', text: 'book appointment' },
      },
    ]);
    expect(parseInstagramMessage(payload)?.senderId).toBe(CUSTOMER_ID);
  });

  it('classifies non-text attachments with text null semantics', () => {
    const payload = dmPayloadWithMessaging([
      {
        sender: { id: CUSTOMER_ID },
        recipient: { id: PAGE_ID },
        timestamp: Math.floor(Date.now() / 1000),
        message: {
          mid: 'mid.sticker',
          attachments: [{ type: 'image', payload: { url: 'https://example.com/x' } }],
        },
      },
    ]);
    const parsed = parseInstagramMessage(payload);
    expect(parsed?.text).toBe('');
    expect(parsed?.hasNonTextContent).toBe(true);
    expect(parsed?.attachments?.length).toBeGreaterThan(0);
  });

  it('rejects invalid sender ids in isValidInstagramSenderId', () => {
    expect(isValidInstagramSenderId('12334')).toBe(false);
    expect(isValidInstagramSenderId(CUSTOMER_ID)).toBe(true);
  });
});

describe('tryResolveSenderFromMessageEdit (rcp-10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(instagramConnectService.getDoctorIdByPageIds).mockResolvedValue(DOCTOR_ID);
    jest.mocked(instagramConnectService.getInstagramAccessTokenForDoctor).mockResolvedValue('doctor-token');
    jest.mocked(instagramConnectService.getStoredInstagramPageIdForDoctor).mockResolvedValue(PAGE_ID);
  });

  it('clears sender when DB stored page id by mistake', async () => {
    const payload = dmPayloadWithMessaging([
      {
        timestamp: Math.floor(Date.now() / 1000),
        message_edit: { mid: 'mid.edit-1', text: 'edited' },
      },
    ]);
    jest.mocked(messageService.getSenderIdByPlatformMessageId).mockResolvedValue(PAGE_ID);
    jest
      .mocked(instagramService.getSenderFromMostRecentConversation)
      .mockResolvedValue(CUSTOMER_ID);

    const resolved = await tryResolveSenderFromMessageEdit(payload, 'corr-edit');
    expect(resolved?.senderId).toBe(CUSTOMER_ID);
  });

  it('uses conversation-API fallback when DB and Graph lookups fail', async () => {
    const payload = dmPayloadWithMessaging([
      {
        timestamp: Math.floor(Date.now() / 1000),
        message_edit: { mid: 'mid.edit-2', text: 'edited' },
      },
    ]);
    jest.mocked(messageService.getSenderIdByPlatformMessageId).mockResolvedValue(null);
    jest.mocked(instagramService.getSenderFromMostRecentConversation).mockResolvedValue(null);
    jest.mocked(instagramService.getInstagramMessageSender).mockResolvedValue(null);
    jest
      .mocked(conversationService.getOnlyInstagramConversationSenderId)
      .mockResolvedValue(CUSTOMER_ID);

    const resolved = await tryResolveSenderFromMessageEdit(payload, 'corr-fallback');
    expect(resolved?.senderId).toBe(CUSTOMER_ID);
  });

  it('returns null for invalid fallback sender id', async () => {
    const payload = dmPayloadWithMessaging([
      {
        timestamp: Math.floor(Date.now() / 1000),
        message_edit: { mid: 'mid.edit-3', text: 'edited' },
      },
    ]);
    jest.mocked(messageService.getSenderIdByPlatformMessageId).mockResolvedValue(null);
    jest.mocked(instagramService.getSenderFromMostRecentConversation).mockResolvedValue(null);
    jest.mocked(instagramService.getInstagramMessageSender).mockResolvedValue(null);
    jest.mocked(conversationService.getOnlyInstagramConversationSenderId).mockResolvedValue('12334');

    expect(await tryResolveSenderFromMessageEdit(payload, 'corr-invalid')).toBeNull();
  });
});

describe('parseInstagramInbound skip paths (rcp-10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(instagramConnectService.getDoctorIdByPageIds).mockResolvedValue(DOCTOR_ID);
    jest.mocked(instagramConnectService.getInstagramAccessTokenForDoctor).mockResolvedValue('doctor-token');
    jest.mocked(instagramConnectService.getStoredInstagramPageIdForDoctor).mockResolvedValue(PAGE_ID);
  });

  it('returns sender_is_page when changes payload sender is the page id', async () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: PAGE_ID,
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: 'messages',
              value: {
                sender: { id: PAGE_ID },
                message: { mid: 'mid.ch', text: 'hello from page' },
              },
            },
          ],
        },
      ],
    } as unknown as InstagramWebhookPayload;

    const result = await parseInstagramInbound(payload, { eventId: 'evt-page', correlationId: 'corr-page' }, 'instagram');
    expect(result).toEqual(
      expect.objectContaining({
        skip: true,
        reason: 'sender_is_page',
        senderId: PAGE_ID,
      })
    );
  });

  it('returns no_page_ids when payload has no page ids', async () => {
    const payload: InstagramWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          id: '',
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: { id: CUSTOMER_ID },
              recipient: { id: '000000000000000' },
              timestamp: Math.floor(Date.now() / 1000),
              message: { mid: 'mid.nopage', text: 'hello' },
            },
          ],
        },
      ],
    };

    const result = await parseInstagramInbound(payload, { eventId: 'evt-nopage', correlationId: 'corr-nopage' }, 'instagram');
    expect(result).toEqual(expect.objectContaining({ skip: true, reason: 'no_page_ids' }));
  });

  it('returns no_doctor when page is not linked', async () => {
    jest.mocked(instagramConnectService.getDoctorIdByPageIds).mockResolvedValue(null);
    const payload = dmPayloadWithMessaging([
      {
        sender: { id: CUSTOMER_ID },
        recipient: { id: PAGE_ID },
        timestamp: Math.floor(Date.now() / 1000),
        message: { mid: 'mid.nodoc', text: 'hello' },
      },
    ]);

    const result = await parseInstagramInbound(payload, { eventId: 'evt-nodoc', correlationId: 'corr-nodoc' }, 'instagram');
    expect(result).toEqual(
      expect.objectContaining({
        skip: true,
        reason: 'no_doctor',
        senderId: CUSTOMER_ID,
      })
    );
  });

  it('returns normalized InboundMessage for a text DM', async () => {
    const payload = dmPayloadWithMessaging([
      {
        sender: { id: CUSTOMER_ID },
        recipient: { id: PAGE_ID },
        timestamp: Math.floor(Date.now() / 1000),
        message: { mid: 'mid.ok', text: 'hello' },
      },
    ]);

    const result = await parseInstagramInbound(payload, { eventId: 'evt-ok', correlationId: 'corr-ok' }, 'instagram');
    expect('skip' in result).toBe(false);
    if ('skip' in result) return;
    expect(result).toMatchObject({
      channel: 'instagram',
      surface: 'dm',
      senderId: CUSTOMER_ID,
      text: 'hello',
      providerEventId: 'evt-ok',
      correlationId: 'corr-ok',
      pageIds: [PAGE_ID],
      tenant: {
        doctorId: DOCTOR_ID,
        doctorToken: 'doctor-token',
        pageIds: [PAGE_ID],
        doctorPageId: PAGE_ID,
      },
    });
  });
});
