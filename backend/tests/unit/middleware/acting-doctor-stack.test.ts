/**
 * Test-only router: allowStaff + authenticateToken + resolveActingDoctor.
 * No production route is opted in (P1-Q5).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = 'unit-test-supabase-jwt-secret-at-least-16';
const SUPABASE_URL = 'https://test.supabase.co';
const EXPECTED_ISS = `${SUPABASE_URL}/auth/v1`;
const STAFF_ID = '00000000-0000-0000-0000-0000000000cc';
const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';

const findStaffLink = jest.fn<(...args: unknown[]) => Promise<unknown>>();

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
jest.mock('../../../src/services/clinic-staff-service', () => ({
  findStaffLink: (...args: unknown[]) => findStaffLink(...args),
}));

import { staffCapability } from '../../../src/middleware/allow-staff';
import { authenticateToken } from '../../../src/middleware/auth';
import { resolveActingDoctor } from '../../../src/middleware/resolve-acting-doctor';

function signStaffToken(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: STAFF_ID,
      aud: 'authenticated',
      role: 'authenticated',
      iss: EXPECTED_ISS,
      app_metadata: { role: 'receptionist' },
      iat: nowSec,
      exp: nowSec + 3600,
    },
    SECRET,
    { algorithm: 'HS256' }
  );
}

async function runStack(req: Request): Promise<{ req: Request; error: unknown }> {
  let error: unknown;
  const next: NextFunction = ((err?: unknown) => {
    error = err;
  }) as NextFunction;

  staffCapability('front_desk')(req, {} as Response, (err?: unknown) => {
    if (err) error = err;
  });
  if (error) return { req, error };

  await authenticateToken(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  if (error) return { req, error };

  error = undefined;
  await resolveActingDoctor(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return { req, error };
}

beforeEach(() => {
  jest.clearAllMocks();
  findStaffLink.mockResolvedValue({
    id: 'link-1',
    doctorId: DOCTOR_ID,
    staffUserId: STAFF_ID,
    role: 'receptionist',
    status: 'active',
    capabilities: ['front_desk', 'previsit'],
  });
});

describe('allowStaff + authenticateToken + resolveActingDoctor (test-only route)', () => {
  it('resolves actingDoctorId to the linked doctor', async () => {
    const req = {
      headers: { authorization: `Bearer ${signStaffToken()}` },
      correlationId: 'cid-stack',
      ip: '203.0.113.7',
      socket: { remoteAddress: '203.0.113.7' },
    } as unknown as Request;

    const { error } = await runStack(req);

    expect(error).toBeUndefined();
    expect(req.actingDoctorId).toBe(DOCTOR_ID);
    expect(req.actorId).toBe(STAFF_ID);
    expect(req.actorKind).toBe('staff');
    expect(findStaffLink).toHaveBeenCalledTimes(1);
  });
});
