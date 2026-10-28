/**
 * Instagram connect callback while DM replies are parked.
 * With META_INBOUND_ENABLED off, the callback does not subscribe to messages
 * and still redirects as connected.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const mockInboundReplies = { enabled: false };
const doctorId = '550e8400-e29b-41d4-a716-446655440001';

const mockIsDoctorVerified = jest.fn<(doctorId: string, correlationId: string) => Promise<boolean>>();
const mockVerifyState = jest.fn<(state: string) => string>();
const mockExchangeShort = jest.fn<
  (code: string, correlationId: string) => Promise<{ accessToken: string; userId: string }>
>();
const mockExchangeLong = jest.fn<
  (token: string, correlationId: string) => Promise<{ accessToken: string; expiresIn: number | null }>
>();
const mockUserInfo = jest.fn<
  (token: string, correlationId: string) => Promise<{ userId: string; username: string | null }>
>();
const mockSave = jest.fn<
  (doctorId: string, input: unknown, correlationId: string) => Promise<void>
>();
const mockSubscribe = jest.fn<
  (accountId: string, token: string, correlationId: string) => Promise<boolean>
>();

jest.mock('../../../src/services/doctor-verification-service', () => ({
  isDoctorVerified: (...args: [string, string]) => mockIsDoctorVerified(...args),
}));

jest.mock('../../../src/services/instagram-connect-service', () => ({
  createState: jest.fn(),
  buildMetaOAuthUrl: jest.fn(),
  verifyState: (...args: [string]) => mockVerifyState(...args),
  exchangeCodeForShortLivedToken: (...args: [string, string]) => mockExchangeShort(...args),
  exchangeForLongLivedToken: (...args: [string, string]) => mockExchangeLong(...args),
  getInstagramUserInfo: (...args: [string, string]) => mockUserInfo(...args),
  saveDoctorInstagram: (...args: [string, unknown, string]) => mockSave(...args),
  subscribeInstagramAccountApps: (...args: [string, string, string]) => mockSubscribe(...args),
  disconnectInstagram: jest.fn(),
  getInstagramDashboardStatus: jest.fn(),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('../../../src/config/env', () => {
  const actual = jest.requireActual('../../../src/config/env') as {
    env: Record<string, unknown>;
  };
  return {
    env: new Proxy(actual.env, {
      get(target, prop: string) {
        if (prop === 'META_INBOUND_ENABLED') return mockInboundReplies.enabled;
        if (prop === 'INSTAGRAM_FRONTEND_REDIRECT_URI') {
          return 'http://localhost:3000/dashboard/settings/integrations';
        }
        return target[prop];
      },
    }),
  };
});

import { callbackHandler } from '../../../src/controllers/instagram-connect-controller';

async function invoke(req: Request, res: Response): Promise<unknown> {
  let captured: unknown;
  await new Promise<void>((resolve) => {
    const finish = (err?: unknown) => {
      if (err) captured = err;
      resolve();
    };
    (res.redirect as jest.Mock).mockImplementation(() => {
      finish();
      return res;
    });
    (res.json as jest.Mock).mockImplementation(() => {
      finish();
      return res;
    });
    callbackHandler(req, res, finish);
  });
  return captured;
}

function makeRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInboundReplies.enabled = false;
  mockIsDoctorVerified.mockResolvedValue(true);
  mockVerifyState.mockReturnValue(doctorId);
  mockExchangeShort.mockResolvedValue({ accessToken: 'short', userId: '1789' });
  mockExchangeLong.mockResolvedValue({ accessToken: 'long', expiresIn: 1000 });
  mockUserInfo.mockResolvedValue({ userId: '1789', username: 'halo.aid' });
  mockSave.mockResolvedValue(undefined);
  mockSubscribe.mockResolvedValue(true);
});

describe('Instagram connect callback with inbound replies parked', () => {
  it('redirects connected and does not subscribe to messages', async () => {
    const req = {
      query: { code: 'auth-code', state: 'signed-state' },
      correlationId: 'corr-cb',
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(req, res);

    expect(err).toBeUndefined();
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      expect.stringContaining('connected=1')
    );
    const target = String((res.redirect as jest.Mock).mock.calls[0]?.[1]);
    expect(target).not.toContain('webhook_subscribe_failed');
  });

  it('still reports a failed message subscription when inbound replies are on', async () => {
    mockInboundReplies.enabled = true;
    mockSubscribe.mockResolvedValue(false);
    const req = {
      query: { code: 'auth-code', state: 'signed-state' },
      correlationId: 'corr-cb-on',
    } as unknown as Request;
    const res = makeRes();

    await invoke(req, res);

    expect(mockSubscribe).toHaveBeenCalledWith('1789', 'long', 'corr-cb-on');
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      expect.stringContaining('webhook_subscribe_failed')
    );
  });
});
