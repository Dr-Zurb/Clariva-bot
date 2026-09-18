/**
 * Twilio webhook signature verification (rec-01).
 *
 * Pins: valid accepted, tampered rejected, missing signature rejected,
 * missing credentials / raw body fail closed. No payload in logs.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import twilio from 'twilio';

const envState: {
  TWILIO_AUTH_TOKEN?: string;
  WEBHOOK_BASE_URL?: string;
} = {
  TWILIO_AUTH_TOKEN: 'test_auth_token',
  WEBHOOK_BASE_URL: 'https://api.example.com',
};

jest.mock('../../../src/config/env', () => ({
  env: envState,
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logSecurityEvent: (jest.fn() as jest.Mock).mockResolvedValue(undefined as never),
}));

import {
  assertTwilioWebhookSignature,
  formParamsFromRawBody,
  getTwilioCompositionStatusCallbackUrl,
  getTwilioRoomStatusCallbackUrl,
} from '../../../src/utils/twilio-webhook-verification';
import { logSecurityEvent } from '../../../src/utils/audit-logger';
import { logger } from '../../../src/config/logger';
import { InternalError, UnauthorizedError } from '../../../src/utils/errors';

const AUTH = 'test_auth_token';
const PUBLIC_URL = 'https://api.example.com/webhooks/twilio/composition-status';
const PARAMS = {
  CompositionSid: 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  RoomSid: 'RMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  StatusCallbackEvent: 'composition-available',
};

function rawBodyFrom(params: Record<string, string>): Buffer {
  return Buffer.from(new URLSearchParams(params).toString(), 'utf8');
}

describe('twilio-webhook-verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envState.TWILIO_AUTH_TOKEN = AUTH;
    envState.WEBHOOK_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    envState.TWILIO_AUTH_TOKEN = AUTH;
    envState.WEBHOOK_BASE_URL = 'https://api.example.com';
  });

  it('builds the public callback URL from WEBHOOK_BASE_URL', () => {
    expect(getTwilioCompositionStatusCallbackUrl()).toBe(PUBLIC_URL);
  });

  it('strips a trailing slash on WEBHOOK_BASE_URL', () => {
    envState.WEBHOOK_BASE_URL = 'https://api.example.com/';
    expect(getTwilioCompositionStatusCallbackUrl()).toBe(PUBLIC_URL);
  });

  it('fails closed when WEBHOOK_BASE_URL is missing', () => {
    envState.WEBHOOK_BASE_URL = undefined;
    expect(() => getTwilioCompositionStatusCallbackUrl()).toThrow(InternalError);
  });

  it('builds the room-status callback URL from WEBHOOK_BASE_URL', () => {
    expect(getTwilioRoomStatusCallbackUrl()).toBe(
      'https://api.example.com/webhooks/twilio/room-status'
    );
  });

  it('accepts a valid Twilio signature over the exact raw bytes', async () => {
    const rawBody = rawBodyFrom(PARAMS);
    const signature = twilio.getExpectedTwilioSignature(AUTH, PUBLIC_URL, PARAMS);

    await expect(
      assertTwilioWebhookSignature({
        signature,
        rawBody,
        publicUrl: PUBLIC_URL,
        correlationId: 'corr-valid',
      })
    ).resolves.toBeUndefined();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('rejects a tampered body', async () => {
    const signature = twilio.getExpectedTwilioSignature(AUTH, PUBLIC_URL, PARAMS);
    const tampered = rawBodyFrom({
      ...PARAMS,
      CompositionSid: 'CJffffffffffffffffffffffffffffffff',
    });

    await expect(
      assertTwilioWebhookSignature({
        signature,
        rawBody: tampered,
        publicUrl: PUBLIC_URL,
        correlationId: 'corr-tamper',
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'corr-tamper',
      undefined,
      'webhook_signature_failed',
      'high',
      undefined,
      'twilio composition-status: signature mismatch'
    );
  });

  it('rejects a missing signature', async () => {
    await expect(
      assertTwilioWebhookSignature({
        signature: undefined,
        rawBody: rawBodyFrom(PARAMS),
        publicUrl: PUBLIC_URL,
        correlationId: 'corr-missing',
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'corr-missing',
      undefined,
      'webhook_signature_failed',
      'high',
      undefined,
      'twilio composition-status: missing signature'
    );
  });

  it('rejects a missing raw body', async () => {
    await expect(
      assertTwilioWebhookSignature({
        signature: 'sig',
        rawBody: undefined,
        publicUrl: PUBLIC_URL,
        correlationId: 'corr-nobody',
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('fails closed when TWILIO_AUTH_TOKEN is missing', async () => {
    envState.TWILIO_AUTH_TOKEN = undefined;
    await expect(
      assertTwilioWebhookSignature({
        signature: 'sig',
        rawBody: rawBodyFrom(PARAMS),
        publicUrl: PUBLIC_URL,
        correlationId: 'corr-nocreds',
      })
    ).rejects.toBeInstanceOf(InternalError);
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('parses form bytes without using a reconstructed object as the source', () => {
    const raw = rawBodyFrom(PARAMS);
    expect(formParamsFromRawBody(raw)).toEqual(PARAMS);
  });

  it('does not log payload contents on failure', async () => {
    await expect(
      assertTwilioWebhookSignature({
        signature: 'not-a-real-signature',
        rawBody: rawBodyFrom(PARAMS),
        publicUrl: PUBLIC_URL,
        correlationId: 'corr-nolog',
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);

    const warnCalls = (logger.warn as jest.Mock).mock.calls;
    const serialized = JSON.stringify(warnCalls);
    expect(serialized).not.toContain(PARAMS.CompositionSid);
    expect(serialized).not.toContain('StatusCallbackEvent');
  });
});
