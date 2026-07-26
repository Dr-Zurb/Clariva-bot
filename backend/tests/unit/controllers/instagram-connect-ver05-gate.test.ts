/**
 * Instagram connect ver-05 gate (doctor-verification-v1).
 *
 * Unverified doctors must not start OAuth. Verified doctors pass through.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const mockIsDoctorVerified = jest.fn<(doctorId: string, correlationId: string) => Promise<boolean>>();
const mockCreateState = jest.fn<(doctorId: string) => string>();
const mockBuildMetaOAuthUrl = jest.fn<(state: string) => string>();

jest.mock('../../../src/services/doctor-verification-service', () => ({
  isDoctorVerified: (...args: [string, string]) => mockIsDoctorVerified(...args),
}));

jest.mock('../../../src/services/instagram-connect-service', () => ({
  createState: (...args: [string]) => mockCreateState(...args),
  buildMetaOAuthUrl: (...args: [string]) => mockBuildMetaOAuthUrl(...args),
  verifyState: jest.fn(),
  exchangeCodeForShortLivedToken: jest.fn(),
  exchangeForLongLivedToken: jest.fn(),
  getPageTokenAndInstagramAccount: jest.fn(),
  saveDoctorInstagram: jest.fn(),
  disconnectInstagram: jest.fn(),
  getInstagramDashboardStatus: jest.fn(),
}));

jest.mock('../../../src/config/env', () => {
  const actual = jest.requireActual('../../../src/config/env') as {
    env: Record<string, unknown>;
  };
  return {
    env: new Proxy(actual.env, {
      get(target, prop: string) {
        if (prop === 'INSTAGRAM_FRONTEND_REDIRECT_URI') {
          return 'http://localhost:3000/dashboard/settings/integrations';
        }
        return target[prop];
      },
    }),
  };
});

import { connectHandler } from '../../../src/controllers/instagram-connect-controller';
import { DoctorNotVerifiedError, UnauthorizedError } from '../../../src/utils/errors';

async function invoke(
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown;
  await new Promise<void>((resolve) => {
    const next = (err?: unknown) => {
      if (err) captured = err;
      resolve();
    };
    void Promise.resolve(connectHandler(req, res, next)).then(
      () => resolve(),
      (err: unknown) => {
        captured = err;
        resolve();
      },
    );
  });
  return captured;
}

function makeRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateState.mockReturnValue('state-token');
  mockBuildMetaOAuthUrl.mockReturnValue('https://meta.example/oauth');
});

describe('connectHandler ver-05 gate', () => {
  it('rejects unauthenticated requests', async () => {
    const err = await invoke(
      { correlationId: 'corr-1' } as unknown as Request,
      makeRes(),
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
  });

  it('blocks unverified doctors with DoctorNotVerifiedError', async () => {
    mockIsDoctorVerified.mockResolvedValue(false);
    const res = makeRes();
    const err = await invoke(
      {
        correlationId: 'corr-1',
        user: { id: 'doc-1' },
      } as unknown as Request,
      res,
    );
    expect(err).toBeInstanceOf(DoctorNotVerifiedError);
    expect(mockCreateState).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('allows verified doctors to receive a redirectUrl', async () => {
    mockIsDoctorVerified.mockResolvedValue(true);
    const res = makeRes();
    const err = await invoke(
      {
        correlationId: 'corr-1',
        user: { id: 'doc-1' },
      } as unknown as Request,
      res,
    );
    expect(err).toBeUndefined();
    expect(mockIsDoctorVerified).toHaveBeenCalledWith('doc-1', 'corr-1');
    expect(mockCreateState).toHaveBeenCalledWith('doc-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      redirectUrl: 'https://meta.example/oauth',
    });
  });
});
