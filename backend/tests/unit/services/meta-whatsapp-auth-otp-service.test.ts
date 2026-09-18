import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: {
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: undefined as string | undefined,
    WHATSAPP_CLOUD_ACCESS_TOKEN: undefined as string | undefined,
    WHATSAPP_OTP_TEMPLATE_NAME: undefined as string | undefined,
    WHATSAPP_OTP_TEMPLATE_LANGUAGE: 'en',
  },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { env } from '../../../src/config/env';
import { logger } from '../../../src/config/logger';
import {
  isWhatsappAuthOtpConfigured,
  sendWhatsappAuthOtp,
  toWhatsappRecipient,
} from '../../../src/services/meta-whatsapp-auth-otp-service';

const mockedEnv = env as {
  WHATSAPP_CLOUD_PHONE_NUMBER_ID?: string;
  WHATSAPP_CLOUD_ACCESS_TOKEN?: string;
  WHATSAPP_OTP_TEMPLATE_NAME?: string;
  WHATSAPP_OTP_TEMPLATE_LANGUAGE: string;
};

function configureWhatsapp(): void {
  mockedEnv.WHATSAPP_CLOUD_PHONE_NUMBER_ID = '1234567890';
  mockedEnv.WHATSAPP_CLOUD_ACCESS_TOKEN = 'test-token';
  mockedEnv.WHATSAPP_OTP_TEMPLATE_NAME = 'halo_aid_otp';
  mockedEnv.WHATSAPP_OTP_TEMPLATE_LANGUAGE = 'en';
}

function loggedPayloads(): unknown[] {
  const calls = [
    ...(logger.info as jest.Mock).mock.calls,
    ...(logger.warn as jest.Mock).mock.calls,
    ...(logger.error as jest.Mock).mock.calls,
  ];
  return calls.map((c) => c[0]);
}

describe('toWhatsappRecipient', () => {
  it('strips leading plus and spaces', () => {
    expect(toWhatsappRecipient('+91 98765 43210')).toBe('919876543210');
  });
});

describe('isWhatsappAuthOtpConfigured', () => {
  afterEach(() => {
    mockedEnv.WHATSAPP_CLOUD_PHONE_NUMBER_ID = undefined;
    mockedEnv.WHATSAPP_CLOUD_ACCESS_TOKEN = undefined;
    mockedEnv.WHATSAPP_OTP_TEMPLATE_NAME = undefined;
  });

  it('is false when any required field is missing', () => {
    expect(isWhatsappAuthOtpConfigured()).toBe(false);
    mockedEnv.WHATSAPP_CLOUD_PHONE_NUMBER_ID = '1';
    mockedEnv.WHATSAPP_CLOUD_ACCESS_TOKEN = 'tok';
    expect(isWhatsappAuthOtpConfigured()).toBe(false);
  });

  it('is true when phone id, token, and template name are set', () => {
    configureWhatsapp();
    expect(isWhatsappAuthOtpConfigured()).toBe(true);
  });
});

describe('sendWhatsappAuthOtp', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    configureWhatsapp();
    global.fetch = jest.fn() as unknown as typeof fetch;
    (logger.info as jest.Mock).mockClear();
    (logger.warn as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockedEnv.WHATSAPP_CLOUD_PHONE_NUMBER_ID = undefined;
    mockedEnv.WHATSAPP_CLOUD_ACCESS_TOKEN = undefined;
    mockedEnv.WHATSAPP_OTP_TEMPLATE_NAME = undefined;
  });

  it('returns false and skips fetch when Cloud API is not configured', async () => {
    mockedEnv.WHATSAPP_OTP_TEMPLATE_NAME = undefined;
    const sent = await sendWhatsappAuthOtp('+919876543210', '123456', 'corr-1');
    expect(sent).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns false when recipient is empty', async () => {
    const sent = await sendWhatsappAuthOtp('   ', '123456', 'corr-1');
    expect(sent).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs the authentication template and returns true on message id', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.test' }] }),
    } as Response);

    const sent = await sendWhatsappAuthOtp('+919876543210', '123456', 'corr-1');
    expect(sent).toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as {
      to: string;
      template: { name: string; components: unknown[] };
    };
    expect(body.to).toBe('919876543210');
    expect(body.template.name).toBe('halo_aid_otp');
    expect(body.template.components).toHaveLength(2);
  });

  it('returns false on Graph 4xx and does not log phone or code', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 132000, type: 'OAuthException' } }),
    } as Response);

    const sent = await sendWhatsappAuthOtp('+919876543210', '654321', 'corr-1');
    expect(sent).toBe(false);

    const blob = JSON.stringify(loggedPayloads());
    expect(blob).not.toContain('919876543210');
    expect(blob).not.toContain('+919876543210');
    expect(blob).not.toContain('654321');
  });
});
