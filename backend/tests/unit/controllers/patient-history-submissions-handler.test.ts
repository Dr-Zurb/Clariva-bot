import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const getHistorySubmissionView = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const upsertHistorySubmission = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const acceptHistorySubmissionItem = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/patient-history-submissions-service', () => ({
  getHistorySubmissionView: (...args: unknown[]) => getHistorySubmissionView(...args),
  upsertHistorySubmission: (...args: unknown[]) => upsertHistorySubmission(...args),
  acceptHistorySubmissionItem: (...args: unknown[]) => acceptHistorySubmissionItem(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import {
  acceptHistorySubmissionHandler,
  getHistorySubmissionHandler,
  upsertHistorySubmissionHandler,
} from '../../../src/controllers/patient-history-submissions-controller';

const DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const ACTOR_ID = '660e8400-e29b-41d4-a716-446655440001';
const APT_ID = '880e8400-e29b-41d4-a716-446655440003';

const BODY = {
  whyToday: 'Headache since morning',
  allergies: { none: true, items: [] },
  medicines: { none: true, items: [] },
  conditions: { none: true, items: [] },
};

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function staffReq(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { id: ACTOR_ID },
    actingDoctorId: DOCTOR_ID,
    actorId: ACTOR_ID,
    actorKind: 'staff',
    correlationId: 'cid',
    params: { id: APT_ID },
    body: {},
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('history submission handlers', () => {
  it('GET lists the sidecar for the acting doctor', async () => {
    getHistorySubmissionView.mockResolvedValue({ submission: null, chart: null });
    const res = mockRes();
    let err: unknown;
    getHistorySubmissionHandler(staffReq(), res, ((nextErr?: unknown) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(getHistorySubmissionView).toHaveBeenCalledWith(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
  });

  it('PUT upserts and passes the staff actor', async () => {
    upsertHistorySubmission.mockResolvedValue({ id: 's1' });
    const res = mockRes();
    let err: unknown;
    upsertHistorySubmissionHandler(
      staffReq({ body: BODY }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(upsertHistorySubmission).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      expect.objectContaining({ whyToday: BODY.whyToday }),
      'cid',
      ACTOR_ID,
      true
    );
  });

  it('PATCH accept uses the doctor JWT, not a staff actor', async () => {
    acceptHistorySubmissionItem.mockResolvedValue({
      submission: { id: 's1' },
      outcome: 'created',
    });
    const res = mockRes();
    let err: unknown;
    acceptHistorySubmissionHandler(
      staffReq({
        user: { id: DOCTOR_ID },
        actorKind: 'doctor',
        body: { field: 'allergies', index: 0 },
      }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(acceptHistorySubmissionItem).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      { field: 'allergies', index: 0 },
      'cid'
    );
  });
});
