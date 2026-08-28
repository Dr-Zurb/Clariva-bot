/**
 * Dashboard Onboarding Controller unit tests (doctor-onboarding-v1 · onb-01).
 *
 * Covers: happy path (doctor-scoped call), missing auth → 401,
 * doctor isolation (service only sees req.user.id).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/dashboard-onboarding-service', () => ({
  getOnboardingStatus: jest.fn(),
}));

import { getOnboardingStatusHandler } from '../../../src/controllers/dashboard-onboarding-controller';
import { getOnboardingStatus } from '../../../src/services/dashboard-onboarding-service';
import { UnauthorizedError } from '../../../src/utils/errors';

const mockedGetOnboardingStatus = getOnboardingStatus as jest.MockedFunction<
  typeof getOnboardingStatus
>;

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_DOCTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const STATUS_DTO = {
  instagramConnected: false,
  practiceInfoSet: true,
  pricingSet: false,
  availabilitySet: false,
  complete: false,
};

async function invoke(
  handler: typeof getOnboardingStatusHandler,
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

beforeEach(() => {
  jest.resetAllMocks();
  mockedGetOnboardingStatus.mockResolvedValue(STATUS_DTO);
});

describe('getOnboardingStatusHandler', () => {
  it('returns 200 with status for authenticated doctor', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'corr-1',
      query: {},
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(getOnboardingStatusHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedGetOnboardingStatus).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      correlationId: 'corr-1',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const body = (res.json as jest.Mock).mock.calls[0]![0] as {
      data: typeof STATUS_DTO;
    };
    expect(body.data).toEqual(STATUS_DTO);
  });

  it('throws UnauthorizedError when no user', async () => {
    const req = { query: {}, correlationId: 'corr-1' } as unknown as Request;
    const res = makeRes();

    const err = await invoke(getOnboardingStatusHandler, req, res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedGetOnboardingStatus).not.toHaveBeenCalled();
  });

  it('never passes a query/body doctor_id — only req.user.id', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'corr-1',
      query: { doctor_id: OTHER_DOCTOR_ID },
      body: { doctorId: OTHER_DOCTOR_ID },
    } as unknown as Request;
    const res = makeRes();

    await invoke(getOnboardingStatusHandler, req, res);
    expect(mockedGetOnboardingStatus).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      correlationId: 'corr-1',
    });
  });
});
