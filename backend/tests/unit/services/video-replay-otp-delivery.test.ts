import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const sendWhatsappAuthOtp = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const isWhatsappAuthOtpConfigured = jest.fn<() => boolean>();
const sendSms = jest.fn<(...args: unknown[]) => Promise<boolean>>();

jest.mock('../../../src/services/meta-whatsapp-auth-otp-service', () => ({
  isWhatsappAuthOtpConfigured: () => isWhatsappAuthOtpConfigured(),
  sendWhatsappAuthOtp: (...args: unknown[]) => sendWhatsappAuthOtp(...args),
}));

jest.mock('../../../src/services/twilio-sms-service', () => ({
  sendSms: (...args: unknown[]) => sendSms(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { deliverVideoReplayOtpCode } from '../../../src/services/video-replay-otp-delivery';

describe('deliverVideoReplayOtpCode', () => {
  beforeEach(() => {
    sendWhatsappAuthOtp.mockReset();
    isWhatsappAuthOtpConfigured.mockReset();
    sendSms.mockReset();
  });

  it('sends WhatsApp auth and does not touch Twilio when Cloud API is configured', async () => {
    isWhatsappAuthOtpConfigured.mockReturnValue(true);
    sendWhatsappAuthOtp.mockResolvedValue(true);

    const result = await deliverVideoReplayOtpCode('+919876543210', '123456', 'corr-1');

    expect(result).toEqual({
      sent: true,
      channel: 'whatsapp_auth',
      fallbackFromWhatsapp: false,
    });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('falls back to Twilio SMS when WhatsApp is configured but send fails', async () => {
    isWhatsappAuthOtpConfigured.mockReturnValue(true);
    sendWhatsappAuthOtp.mockResolvedValue(false);
    sendSms.mockResolvedValue(true);

    const result = await deliverVideoReplayOtpCode('+919876543210', '123456', 'corr-1');

    expect(result).toEqual({
      sent: true,
      channel: 'twilio_sms',
      fallbackFromWhatsapp: true,
    });
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('uses Twilio SMS when WhatsApp Cloud API is not configured', async () => {
    isWhatsappAuthOtpConfigured.mockReturnValue(false);
    sendSms.mockResolvedValue(true);

    const result = await deliverVideoReplayOtpCode('+919876543210', '123456', 'corr-1');

    expect(result).toEqual({
      sent: true,
      channel: 'twilio_sms',
      fallbackFromWhatsapp: false,
    });
    expect(sendWhatsappAuthOtp).not.toHaveBeenCalled();
  });
});
