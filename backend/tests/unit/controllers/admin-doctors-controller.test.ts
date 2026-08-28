/**
 * Admin Doctors Controller tests (admin-console-v3 · acon3-01).
 *
 * Covers: Zod rejects invalid ?status; happy path passes filter to service.
 * Auth gate is covered by require-admin.test.ts (route mounts it).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

jest.mock('../../../src/services/admin-doctors-service', () => ({
  listAdminDoctors: jest.fn(),
}));

import { listDoctorsHandler } from '../../../src/controllers/admin-doctors-controller';
import { listAdminDoctors } from '../../../src/services/admin-doctors-service';

const mockedList = listAdminDoctors as jest.MockedFunction<
  typeof listAdminDoctors
>;

async function invoke(
  handler: typeof listDoctorsHandler,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown;
  await new Promise<void>((resolve) => {
    const next = (err?: unknown) => {
      if (err) captured = err;
      resolve();
    };
    void Promise.resolve(handler(req, res, next)).then(
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
  jest.resetAllMocks();
  mockedList.mockResolvedValue([]);
});

describe('listDoctorsHandler', () => {
  it('rejects an invalid status filter (Zod)', async () => {
    const req = {
      correlationId: 'c',
      query: { status: 'not-a-funnel-status' },
    } as unknown as Request;
    const err = await invoke(listDoctorsHandler, req, makeRes());
    expect(err).toBeInstanceOf(ZodError);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lists with optional funnel status filter', async () => {
    mockedList.mockResolvedValue([
      {
        doctorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'doc@example.com',
        fullName: null,
        practiceName: null,
        specialty: null,
        funnelStatus: 'onboarding',
        verificationStatus: null,
        lastSignInAt: null,
        createdAt: '2026-07-22T00:00:00Z',
      },
    ]);
    const req = {
      correlationId: 'c',
      query: { status: 'onboarding' },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(listDoctorsHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedList).toHaveBeenCalledWith('c', 'onboarding');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lists all when status omitted', async () => {
    const req = {
      correlationId: 'c',
      query: {},
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(listDoctorsHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedList).toHaveBeenCalledWith('c', undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
