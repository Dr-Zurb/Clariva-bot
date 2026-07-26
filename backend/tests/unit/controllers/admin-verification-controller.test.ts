/**
 * Admin Verification Controller tests (verification-v2 · verv2-03).
 *
 * Covers: request-changes happy path + empty note Zod rejection.
 * Auth gate is covered by require-admin.test.ts (route mounts it).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/doctor-verification-service', () => ({
  approveVerification: jest.fn(),
  getVerificationForReview: jest.fn(),
  listVerifications: jest.fn(),
  rejectVerification: jest.fn(),
  requestChangesVerification: jest.fn(),
}));

import { requestChangesVerificationHandler } from '../../../src/controllers/admin-verification-controller';
import { requestChangesVerification } from '../../../src/services/doctor-verification-service';

const mockedRequestChanges =
  requestChangesVerification as jest.MockedFunction<
    typeof requestChangesVerification
  >;

async function invoke(
  handler: typeof requestChangesVerificationHandler,
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

const doctorId = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  jest.resetAllMocks();
  mockedRequestChanges.mockResolvedValue(undefined);
});

describe('requestChangesVerificationHandler', () => {
  it('rejects an empty note (Zod)', async () => {
    const req = {
      correlationId: 'c',
      adminActor: 'admin-1',
      params: { doctorId },
      body: { note: '   ' },
    } as unknown as Request;
    const err = await invoke(requestChangesVerificationHandler, req, makeRes());
    expect(err).toBeDefined();
    expect(mockedRequestChanges).not.toHaveBeenCalled();
  });

  it('calls the service with note + adminActor and returns changes_requested', async () => {
    const req = {
      correlationId: 'c',
      adminActor: 'admin-1',
      params: { doctorId },
      body: { note: 'Certificate is blurry — please re-upload.' },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(requestChangesVerificationHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedRequestChanges).toHaveBeenCalledWith(
      doctorId,
      'Certificate is blurry — please re-upload.',
      'admin-1',
      'c',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { doctorId, status: 'changes_requested' },
      }),
    );
  });
});
