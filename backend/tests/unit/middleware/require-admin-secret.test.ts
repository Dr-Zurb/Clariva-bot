/**
 * require-admin-secret middleware tests (doctor-verification-v1 · ver-04).
 *
 * The admin review routes are gated by CRON_SECRET. Assert: fail-closed when
 * unset, reject wrong/missing token, accept via Bearer and x-cron-secret.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

const mockEnv: { CRON_SECRET: string | undefined } = { CRON_SECRET: 'sekret' };
jest.mock('../../../src/config/env', () => ({ env: mockEnv }));

import { requireAdminSecret } from '../../../src/middleware/require-admin-secret';
import { UnauthorizedError } from '../../../src/utils/errors';

function run(headers: Record<string, string | undefined>): {
  err: unknown;
  nextCalled: boolean;
} {
  const req = { headers } as unknown as Request;
  const res = {} as Response;
  let nextCalled = false;
  let err: unknown;
  const next: NextFunction = ((e?: unknown) => {
    if (e) err = e;
    else nextCalled = true;
  }) as NextFunction;
  try {
    requireAdminSecret(req, res, next);
  } catch (e) {
    err = e;
  }
  return { err, nextCalled };
}

beforeEach(() => {
  mockEnv.CRON_SECRET = 'sekret';
});

describe('requireAdminSecret', () => {
  it('fails closed when CRON_SECRET is unset', () => {
    mockEnv.CRON_SECRET = undefined;
    const { err, nextCalled } = run({ authorization: 'Bearer sekret' });
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(nextCalled).toBe(false);
  });

  it('rejects a missing token', () => {
    const { err, nextCalled } = run({});
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(nextCalled).toBe(false);
  });

  it('rejects a wrong token', () => {
    const { err, nextCalled } = run({ authorization: 'Bearer nope' });
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(nextCalled).toBe(false);
  });

  it('accepts a correct Bearer token', () => {
    const { err, nextCalled } = run({ authorization: 'Bearer sekret' });
    expect(err).toBeUndefined();
    expect(nextCalled).toBe(true);
  });

  it('accepts a correct x-cron-secret header', () => {
    const { err, nextCalled } = run({ 'x-cron-secret': 'sekret' });
    expect(err).toBeUndefined();
    expect(nextCalled).toBe(true);
  });
});
