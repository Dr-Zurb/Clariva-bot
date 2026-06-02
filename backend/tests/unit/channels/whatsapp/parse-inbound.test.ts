/**
 * rcp-13: WhatsApp adapter stub — payload mapping + NotImplemented seams.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { WhatsAppWebhookPayload } from '../../../../src/types/webhook';
import {
  buildWhatsappInboundMessage,
  extractWhatsappTextInbound,
  parseWhatsappInbound,
  resolveDoctorByWhatsappPhoneId,
} from '../../../../src/workers/channels/whatsapp/parse-inbound';
import { sendWhatsappOutbound } from '../../../../src/workers/channels/whatsapp/send';
import { whatsappChannelAdapter } from '../../../../src/workers/channels/whatsapp';
import { NotImplementedError } from '../../../../src/workers/channels/types';

const samplePayload: WhatsAppWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'wa_entry_123',
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+919876543210',
              phone_number_id: 'wa_phone_123456789',
            },
            messages: [
              {
                id: 'wamid.test-message-id',
                from: '919876543210',
                timestamp: String(Math.floor(Date.now() / 1000)),
                text: { body: 'I need an appointment' },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('WhatsApp parse-inbound stub (rcp-13)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('extractWhatsappTextInbound maps sender, text, message id, and phone_number_id', () => {
    expect(extractWhatsappTextInbound(samplePayload)).toEqual({
      senderId: '919876543210',
      text: 'I need an appointment',
      messageId: 'wamid.test-message-id',
      phoneNumberId: 'wa_phone_123456789',
    });
  });

  it('buildWhatsappInboundMessage produces well-formed InboundMessage', () => {
    const extracted = extractWhatsappTextInbound(samplePayload)!;
    const result = buildWhatsappInboundMessage({
      extracted,
      ctx: { eventId: 'evt-wa-1', correlationId: 'corr-wa-1' },
      provider: 'whatsapp',
      tenant: {
        doctorId: 'doctor-wa-1',
        doctorToken: 'wa-token-stub',
        pageIds: ['wa_phone_123456789'],
        doctorPageId: 'wa_phone_123456789',
      },
      payload: samplePayload,
    });

    expect(result).toMatchObject({
      channel: 'whatsapp',
      surface: 'dm',
      provider: 'whatsapp',
      providerEventId: 'evt-wa-1',
      correlationId: 'corr-wa-1',
      senderId: '919876543210',
      text: 'I need an appointment',
      platformMessageId: 'wamid.test-message-id',
      webhookEntryId: 'wa_phone_123456789',
      pageIds: ['wa_phone_123456789'],
      tenant: {
        doctorId: 'doctor-wa-1',
        doctorToken: 'wa-token-stub',
        pageIds: ['wa_phone_123456789'],
        doctorPageId: 'wa_phone_123456789',
      },
    });
  });

  it('parseWhatsappInbound throws NotImplemented for tenant lookup', async () => {
    await expect(
      parseWhatsappInbound(samplePayload, { eventId: 'evt-wa-1', correlationId: 'corr-wa-1' }, 'whatsapp')
    ).rejects.toThrow(NotImplementedError);
    await expect(
      parseWhatsappInbound(samplePayload, { eventId: 'evt-wa-1', correlationId: 'corr-wa-1' }, 'whatsapp')
    ).rejects.toThrow('TODO: resolveDoctorByWhatsappPhoneId');
  });

  it('resolveDoctorByWhatsappPhoneId throws NotImplemented', async () => {
    await expect(resolveDoctorByWhatsappPhoneId('wa_phone_1', 'corr-1')).rejects.toThrow(
      NotImplementedError
    );
  });

  it('sendWhatsappOutbound throws NotImplemented', async () => {
    await expect(
      sendWhatsappOutbound(
        { text: 'Hello' },
        {
          channel: 'whatsapp',
          surface: 'dm',
          provider: 'whatsapp',
          providerEventId: 'evt-1',
          correlationId: 'corr-1',
          tenant: {
            doctorId: 'doc-1',
            doctorToken: 'tok',
            pageIds: ['wa_phone_1'],
            doctorPageId: 'wa_phone_1',
          },
          pageIds: ['wa_phone_1'],
          senderId: '919876543210',
          text: 'hi',
          webhookEntryId: 'wa_phone_1',
          raw: samplePayload,
        },
        { context: 'default' }
      )
    ).rejects.toThrow('TODO: WhatsApp Cloud send');
  });

  it('whatsappChannelAdapter surfaceOf is always dm', () => {
    expect(whatsappChannelAdapter.matches('whatsapp', samplePayload)).toBe(true);
    expect(whatsappChannelAdapter.matches('instagram', samplePayload)).toBe(false);
    expect(whatsappChannelAdapter.surfaceOf(samplePayload)).toBe('dm');
  });
});
