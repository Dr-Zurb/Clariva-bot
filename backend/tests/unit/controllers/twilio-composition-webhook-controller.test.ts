/**
 * Composition-status controller (rec-01).
 *
 * Pins the HTTP contract: valid → 200 then async dispatch; tampered or
 * unsigned → UnauthorizedError and no dispatch.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';

const envState = {
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

jest.mock('../../../src/services/twilio-composition-status-service', () => ({
  handleCompositionStatusCallback: jest.fn(),
}));

import { handleTwilioCompositionStatusWebhook } from '../../../src/controllers/twilio-composition-webhook-controller';
import { handleCompositionStatusCallback } from '../../../src/services/twilio-composition-status-service';
import { UnauthorizedError } from '../../../src/utils/errors';

const mockedHandle = handleCompositionStatusCallback as jest.MockedFunction<
  typeof handleCompositionStatusCallback
>;

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

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

async function flushImmediate(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('handleTwilioCompositionStatusWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedHandle.mockResolvedValue(undefined);
  });

  it('accepts a valid signature, returns 200, then dispatches', async () => {
    const rawBody = rawBodyFrom(PARAMS);
    const signature = twilio.getExpectedTwilioSignature(AUTH, PUBLIC_URL, PARAMS);
    const req = {
      correlationId: 'corr-ok',
      headers: { 'x-twilio-signature': signature },
      rawBody,
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    handleTwilioCompositionStatusWebhook(req, res, next);
    await flushMicrotasks();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockedHandle).not.toHaveBeenCalled();

    await flushImmediate();
    expect(mockedHandle).toHaveBeenCalledWith(
      {
        compositionSid: PARAMS.CompositionSid,
        roomSid: PARAMS.RoomSid,
        statusCallbackEvent: PARAMS.StatusCallbackEvent,
        status: undefined,
      },
      'corr-ok'
    );
  });

  it('rejects a tampered body and does not dispatch', async () => {
    const signature = twilio.getExpectedTwilioSignature(AUTH, PUBLIC_URL, PARAMS);
    const req = {
      correlationId: 'corr-tamper',
      headers: { 'x-twilio-signature': signature },
      rawBody: rawBodyFrom({ ...PARAMS, RoomSid: 'RMcccccccccccccccccccccccccccccccc' }),
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    handleTwilioCompositionStatusWebhook(req, res, next);
    await flushImmediate();
    expect(next).toHaveBeenCalled();
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockedHandle).not.toHaveBeenCalled();
  });

  it('rejects a missing signature and does not dispatch', async () => {
    const req = {
      correlationId: 'corr-nosig',
      headers: {},
      rawBody: rawBodyFrom(PARAMS),
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    handleTwilioCompositionStatusWebhook(req, res, next);
    await flushImmediate();
    expect(next).toHaveBeenCalled();
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedHandle).not.toHaveBeenCalled();
  });
});
