/**
 * Staff deny in authenticateToken (receptionist-portal P1 · DL-2).
 *
 * New file so existing auth.test.ts stays byte-identical.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = 'unit-test-supabase-jwt-secret-at-least-16';
const SUPABASE_URL = 'https://test.supabase.co';
const EXPECTED_ISS = `${SUPABASE_URL}/auth/v1`;
const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const STAFF_ID = '00000000-0000-0000-0000-0000000000cc';
const ADMIN_ID = '00000000-0000-0000-0000-0000000000dd';

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

import { supabase } from '../../../src/config/database';
import { logAuditEvent, logSecurityEvent } from '../../../src/utils/audit-logger';
import { authenticateToken } from '../../../src/middleware/auth';
import { allowStaff } from '../../../src/middleware/allow-staff';
import { ForbiddenError } from '../../../src/utils/errors';

const mockGetUser = supabase.auth.getUser as unknown as jest.Mock;
const mockLogSecurityEvent = logSecurityEvent as unknown as jest.Mock;
const mockLogAuditEvent = logAuditEvent as unknown as jest.Mock;

function signToken(
  payloadOverrides: Record<string, unknown> = {},
  sub = USER_ID
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub,
      aud: 'authenticated',
      role: 'authenticated',
      iss: EXPECTED_ISS,
      email: 'user@example.test',
      iat: nowSec,
      exp: nowSec + 3600,
      ...payloadOverrides,
    },
    SECRET,
    { algorithm: 'HS256' }
  );
}

function makeReq(authHeader?: string, staffAllowed?: boolean): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    correlationId: 'cid-staff-deny',
    ip: '203.0.113.7',
    socket: { remoteAddress: '203.0.113.7' },
    staffAllowed,
  } as unknown as Request;
}

async function run(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request
): Promise<{ req: Request; error: unknown }> {
  let error: unknown;
  const next: NextFunction = ((err?: unknown) => {
    error = err;
  }) as NextFunction;
  await handler(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return { req, error };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authenticateToken — staff deny (DL-2)', () => {
  it('allows a doctor JWT with no staff role', async () => {
    const { req, error } = await run(
      authenticateToken,
      makeReq(`Bearer ${signToken()}`)
    );
    expect(error).toBeUndefined();
    expect(req.user?.id).toBe(USER_ID);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  it('allows an admin JWT', async () => {
    const { req, error } = await run(
      authenticateToken,
      makeReq(
        `Bearer ${signToken({ app_metadata: { role: 'admin' } }, ADMIN_ID)}`
      )
    );
    expect(error).toBeUndefined();
    expect(req.user?.id).toBe(ADMIN_ID);
    expect(req.user?.app_metadata?.role).toBe('admin');
  });

  it('does not treat user_metadata.role as a staff claim', async () => {
    const { error } = await run(
      authenticateToken,
      makeReq(
        `Bearer ${signToken({ user_metadata: { role: 'receptionist' } })}`
      )
    );
    expect(error).toBeUndefined();
  });

  it.each([
    ['GET list', '/api/v1/patients'],
    ['GET by id', '/api/v1/patients/00000000-0000-0000-0000-0000000000ee'],
    ['POST', '/api/v1/appointments'],
  ])('rejects a staff JWT on a non-opted %s route with 403', async (_label, path) => {
    const req = makeReq(
      `Bearer ${signToken({ app_metadata: { role: 'receptionist' } }, STAFF_ID)}`
    );
    (req as Request & { path?: string }).path = path;

    const { error } = await run(authenticateToken, req);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).statusCode).toBe(403);
    expect((error as ForbiddenError).message).toBe(
      'Staff access is not permitted on this endpoint'
    );
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('allows a staff JWT when allowStaff ran first', async () => {
    const req = makeReq(
      `Bearer ${signToken({ app_metadata: { role: 'receptionist' } }, STAFF_ID)}`
    );
    allowStaff(req, {} as Response, () => undefined);

    const { error } = await run(authenticateToken, req);

    expect(req.staffAllowed).toBe(true);
    expect(error).toBeUndefined();
    expect(req.user?.id).toBe(STAFF_ID);
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });
});
