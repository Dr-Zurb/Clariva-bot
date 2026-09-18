/**
 * require-admin guard tests (admin-console-v1 · acon-01).
 *
 * Two credentials reach the admin surface: an admin JWT
 * (`app_metadata.role='admin'`) or the CRON_SECRET fallback. Assert the guard
 * accepts both, rejects a non-admin JWT (403) and missing creds (401), never
 * reads role from the body, and stamps `req.adminActor`.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

const mockEnv: { CRON_SECRET: string | undefined } = { CRON_SECRET: 'sekret' };
jest.mock('../../../src/config/env', () => ({ env: mockEnv }));

// Fake authenticateToken: decides based on the bearer token, mirroring the real
// middleware's contract (sets req.user on success, next(UnauthorizedError) else).
jest.mock('../../../src/middleware/auth', () => {
  const { UnauthorizedError } = require('../../../src/utils/errors');
  return {
    authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
      const auth = req.headers.authorization;
      if (auth === 'Bearer admin-jwt') {
        req.user = {
          id: 'admin-1',
          app_metadata: { role: 'admin' },
        } as unknown as Request['user'];
        return next();
      }
      if (auth === 'Bearer doctor-jwt') {
        req.user = {
          id: 'doc-1',
          app_metadata: { role: 'authenticated' },
        } as unknown as Request['user'];
        return next();
      }
      return next(new UnauthorizedError('Invalid or expired token'));
    },
  };
});

import {
  requireAdmin,
  requireAdminJwtOrSecret,
} from '../../../src/middleware/require-admin';
import { ForbiddenError, UnauthorizedError } from '../../../src/utils/errors';

interface RunResult {
  err: unknown;
  nextCalled: boolean;
  req: Request;
}

/** Drive the async dual-auth guard to completion. */
async function runDual(
  headers: Record<string, string | undefined>,
  body?: unknown,
): Promise<RunResult> {
  const req = { headers, body } as unknown as Request;
  const res = {} as Response;
  let nextCalled = false;
  let err: unknown;
  await new Promise<void>((resolve) => {
    const next: NextFunction = ((e?: unknown) => {
      if (e) err = e;
      else nextCalled = true;
      resolve();
    }) as NextFunction;
    requireAdminJwtOrSecret(req, res, next);
  });
  return { err, nextCalled, req };
}

/** Drive the sync post-auth guard. */
function runSync(user: unknown): RunResult {
  const req = { headers: {}, user } as unknown as Request;
  const res = {} as Response;
  let nextCalled = false;
  let err: unknown;
  const next: NextFunction = ((e?: unknown) => {
    if (e) err = e;
    else nextCalled = true;
  }) as NextFunction;
  try {
    requireAdmin(req, res, next);
  } catch (e) {
    err = e;
  }
  return { err, nextCalled, req };
}

beforeEach(() => {
  mockEnv.CRON_SECRET = 'sekret';
});

describe('requireAdminJwtOrSecret', () => {
  it('accepts a valid CRON_SECRET via Bearer and stamps adminActor="ops"', async () => {
    const { err, nextCalled, req } = await runDual({
      authorization: 'Bearer sekret',
    });
    expect(err).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(req.adminActor).toBe('ops');
  });

  it('accepts a valid CRON_SECRET via x-cron-secret header', async () => {
    const { err, nextCalled, req } = await runDual({ 'x-cron-secret': 'sekret' });
    expect(err).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(req.adminActor).toBe('ops');
  });

  it('accepts an admin JWT and stamps the admin user id', async () => {
    const { err, nextCalled, req } = await runDual({
      authorization: 'Bearer admin-jwt',
    });
    expect(err).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(req.adminActor).toBe('admin-1');
  });

  it('rejects a non-admin (doctor) JWT with 403', async () => {
    const { err, nextCalled } = await runDual({
      authorization: 'Bearer doctor-jwt',
    });
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(nextCalled).toBe(false);
  });

  it('rejects missing credentials with 401 (via authenticateToken)', async () => {
    const { err, nextCalled } = await runDual({});
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(nextCalled).toBe(false);
  });

  it('ignores a role supplied in the body (no self-elevation)', async () => {
    const { err, nextCalled } = await runDual(
      { authorization: 'Bearer doctor-jwt' },
      { role: 'admin', reviewedBy: 'admin' },
    );
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(nextCalled).toBe(false);
  });

  it('falls through to the JWT path when CRON_SECRET is unset', async () => {
    mockEnv.CRON_SECRET = undefined;
    const { err, nextCalled, req } = await runDual({
      authorization: 'Bearer admin-jwt',
    });
    expect(err).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(req.adminActor).toBe('admin-1');
  });
});

describe('requireAdmin (post-authenticateToken)', () => {
  it('passes an admin user and stamps adminActor', () => {
    const { err, nextCalled, req } = runSync({
      id: 'admin-1',
      app_metadata: { role: 'admin' },
    });
    expect(err).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(req.adminActor).toBe('admin-1');
  });

  it('rejects a non-admin user with 403', () => {
    const { err, nextCalled } = runSync({
      id: 'doc-1',
      app_metadata: { role: 'authenticated' },
    });
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(nextCalled).toBe(false);
  });

  it('rejects when no user is present with 403', () => {
    const { err, nextCalled } = runSync(undefined);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(nextCalled).toBe(false);
  });
});
