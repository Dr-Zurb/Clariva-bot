/**
 * Auth email-status controller (auth-password · AP-D17).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

jest.mock('../../../src/services/auth-email-status-service', () => ({
  getEmailStatus: jest.fn(),
}));

import { emailStatusHandler } from '../../../src/controllers/auth-email-status-controller';
import { getEmailStatus } from '../../../src/services/auth-email-status-service';

const mockedGetEmailStatus = getEmailStatus as jest.MockedFunction<
  typeof getEmailStatus
>;

async function invoke(
  handler: typeof emailStatusHandler,
  req: Request,
  res: Response
): Promise<unknown> {
  let captured: unknown;
  await new Promise<void>((resolve, reject) => {
    const next = (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    };
    void Promise.resolve(handler(req, res, next)).then(
      () => resolve(),
      (err: unknown) => reject(err)
    );
  }).catch((err) => {
    captured = err;
  });
  return captured;
}

function makeRes(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('emailStatusHandler', () => {
  beforeEach(() => {
    mockedGetEmailStatus.mockReset();
  });

  it('returns exists + confirmed from service', async () => {
    mockedGetEmailStatus.mockResolvedValue({ exists: true, confirmed: true });
    const req = {
      body: { email: 'doc@example.com' },
      correlationId: 'c1',
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(emailStatusHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedGetEmailStatus).toHaveBeenCalledWith('doc@example.com', 'c1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { exists: true, confirmed: true },
      })
    );
  });

  it('rejects invalid email via Zod', async () => {
    const req = {
      body: { email: 'not-an-email' },
      correlationId: 'c1',
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(emailStatusHandler, req, res);
    expect(err).toBeInstanceOf(ZodError);
    expect(mockedGetEmailStatus).not.toHaveBeenCalled();
  });
});
