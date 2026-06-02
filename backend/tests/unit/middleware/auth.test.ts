/**
 * Auth middleware — behaviour parity (np-02, task 4.1/4.3).
 *
 * Asserts that swapping the per-request remote `getUser` for local HS256
 * verification preserves outcomes exactly:
 *   - valid token        → req.user.id populated, next() with no error,
 *                          NO remote getUser call (hot path is local).
 *   - expired / bad-sig / wrong-aud / malformed / alg:none / missing token
 *                        → 401 UnauthorizedError, security event logged,
 *                          NO remote getUser call (fail closed locally).
 *   - inconclusive (secret unset) → narrow remote getUser fallback:
 *                          success → req.user from remote; failure → 401.
 *   - optionalAuthenticateToken: no token → continue; present-but-invalid →
 *                          continue unauthenticated (never throws).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = 'unit-test-supabase-jwt-secret-at-least-16';
const SUPABASE_URL = 'https://test.supabase.co';
const EXPECTED_ISS = `${SUPABASE_URL}/auth/v1`;
const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const REMOTE_USER_ID = '00000000-0000-0000-0000-0000000000bb';

// Inline factories (hoisted above imports) avoid TDZ; we import the created
// objects/fns afterwards and configure them per-test.
jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_JWT_SECRET: 'unit-test-supabase-jwt-secret-at-least-16',
  },
}));
jest.mock('../../../src/config/database', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logSecurityEvent: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

import { env as mockEnv } from '../../../src/config/env';
import { supabase } from '../../../src/config/database';
import { logSecurityEvent, logAuditEvent } from '../../../src/utils/audit-logger';
import { authenticateToken, optionalAuthenticateToken } from '../../../src/middleware/auth';
import { UnauthorizedError } from '../../../src/utils/errors';

type GetUserResult = {
  data: { user: { id: string } | null };
  error: { message: string } | null;
};
const mockGetUser = supabase.auth.getUser as unknown as jest.Mock<
  (token: string) => Promise<GetUserResult>
>;
const mockLogSecurityEvent = logSecurityEvent as unknown as jest.Mock;
const mockLogAuditEvent = logAuditEvent as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signToken(payloadOverrides: Record<string, unknown> = {}, secret = SECRET): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      iss: EXPECTED_ISS,
      email: 'doctor@example.test',
      iat: nowSec,
      exp: nowSec + 3600,
      ...payloadOverrides,
    },
    secret,
    { algorithm: 'HS256' },
  );
}

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    correlationId: 'cid-auth-test',
    ip: '203.0.113.7',
    socket: { remoteAddress: '203.0.113.7' },
  } as unknown as Request;
}

interface RunResult {
  req: Request;
  error: unknown;
  nextCalls: number;
}

/** Invoke an asyncHandler-wrapped middleware and capture the next(err) result. */
async function run(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
): Promise<RunResult> {
  let error: unknown;
  let nextCalls = 0;
  const next: NextFunction = ((err?: unknown) => {
    nextCalls += 1;
    error = err;
  }) as NextFunction;
  await handler(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return { req, error, nextCalls };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.SUPABASE_URL = SUPABASE_URL;
  mockEnv.SUPABASE_JWT_SECRET = SECRET;
});

// ---------------------------------------------------------------------------
// authenticateToken
// ---------------------------------------------------------------------------

describe('authenticateToken — local verification', () => {
  it('authenticates a valid token locally and sets req.user without a remote call', async () => {
    const { req, error, nextCalls } = await run(authenticateToken, makeReq(`Bearer ${signToken()}`));

    expect(error).toBeUndefined();
    expect(nextCalls).toBe(1);
    expect(req.user?.id).toBe(USER_ID);
    expect(mockGetUser).not.toHaveBeenCalled(); // hot path is local
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  it('does not block on audit logging when the logger never resolves (np-03)', async () => {
    mockLogAuditEvent.mockImplementation(() => new Promise(() => undefined));

    const { error, nextCalls } = await run(authenticateToken, makeReq(`Bearer ${signToken()}`));

    expect(error).toBeUndefined();
    expect(nextCalls).toBe(1);
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing/!Bearer header with 401 and logs a security event', async () => {
    const { req, error } = await run(authenticateToken, makeReq(undefined));

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).statusCode).toBe(401);
    expect(req.user).toBeUndefined();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expired', `Bearer ${signTokenExpired()}`],
    ['wrong signature', `Bearer ${signToken({}, 'a-different-secret-value-1234567')}`],
    ['wrong audience', `Bearer ${signToken({ aud: 'anon' })}`],
    ['malformed', 'Bearer not-a-jwt'],
  ])('fails closed (401, no remote call) for a %s token', async (_label, header) => {
    const { req, error } = await run(authenticateToken, makeReq(header));

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).statusCode).toBe(401);
    expect(req.user).toBeUndefined();
    expect(mockGetUser).not.toHaveBeenCalled(); // conclusive reject → never falls through
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('falls back to remote getUser when local verification is inconclusive (secret unset)', async () => {
    mockEnv.SUPABASE_JWT_SECRET = undefined;
    mockGetUser.mockResolvedValue({ data: { user: { id: REMOTE_USER_ID } }, error: null });

    const { req, error, nextCalls } = await run(authenticateToken, makeReq(`Bearer ${signToken()}`));

    expect(error).toBeUndefined();
    expect(nextCalls).toBe(1);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(req.user?.id).toBe(REMOTE_USER_ID);
  });

  it('returns 401 when the inconclusive remote fallback also rejects', async () => {
    mockEnv.SUPABASE_JWT_SECRET = undefined;
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });

    const { req, error } = await run(authenticateToken, makeReq(`Bearer ${signToken()}`));

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).statusCode).toBe(401);
    expect(req.user).toBeUndefined();
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// optionalAuthenticateToken
// ---------------------------------------------------------------------------

describe('optionalAuthenticateToken', () => {
  it('continues unauthenticated when no token is present', async () => {
    const { req, error, nextCalls } = await run(optionalAuthenticateToken, makeReq(undefined));

    expect(error).toBeUndefined();
    expect(nextCalls).toBe(1);
    expect(req.user).toBeUndefined();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('sets req.user for a valid token', async () => {
    const { req, error } = await run(optionalAuthenticateToken, makeReq(`Bearer ${signToken()}`));

    expect(error).toBeUndefined();
    expect(req.user?.id).toBe(USER_ID);
  });

  it('continues unauthenticated (no throw) for a present-but-invalid token', async () => {
    const { req, error, nextCalls } = await run(
      optionalAuthenticateToken,
      makeReq('Bearer not-a-jwt'),
    );

    expect(error).toBeUndefined(); // never throws
    expect(nextCalls).toBe(1);
    expect(req.user).toBeUndefined();
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

// Built outside the describe blocks so `it.each` can reference it eagerly.
function signTokenExpired(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return signToken({ iat: nowSec - 7200, exp: nowSec - 60 });
}
