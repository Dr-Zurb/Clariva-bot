import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const getDeskVitals = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const upsertDeskVitals = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/desk-vitals-service', () => ({
  getDeskVitals: (...args: unknown[]) => getDeskVitals(...args),
  upsertDeskVitals: (...args: unknown[]) => upsertDeskVitals(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import {
  getDeskVitalsHandler,
  upsertDeskVitalsHandler,
} from '../../../src/controllers/desk-vitals-controller';

const DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const ACTOR_ID = '660e8400-e29b-41d4-a716-446655440001';
const APT_ID = '880e8400-e29b-41d4-a716-446655440003';

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

describe('desk vitals handlers', () => {
  it('GET returns the acting-doctor reading', async () => {
    getDeskVitals.mockResolvedValue({ id: 'v1', heart_rate: 72 });
    const res = mockRes();
    let err: unknown;
    getDeskVitalsHandler(staffReq(), res, ((nextErr?: unknown) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(getDeskVitals).toHaveBeenCalledWith(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    const body = res.body as { success: boolean; data: { vitals: { heart_rate: number } } };
    expect(body.success).toBe(true);
    expect(body.data.vitals.heart_rate).toBe(72);
  });

  it('PUT upserts validated vitals', async () => {
    upsertDeskVitals.mockResolvedValue({ id: 'v1', heart_rate: 80 });
    const res = mockRes();
    let err: unknown;
    upsertDeskVitalsHandler(staffReq({ body: { heartRate: 80 } }), res, ((nextErr?: unknown) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(upsertDeskVitals).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      { heartRate: 80 },
      'cid',
      ACTOR_ID
    );
  });

  it('PUT accepts an optional note', async () => {
    upsertDeskVitals.mockResolvedValue({ id: 'v1', note: 'sitting' });
    const res = mockRes();
    let err: unknown;
    upsertDeskVitalsHandler(staffReq({ body: { heartRate: 80, note: 'sitting' } }), res, ((
      nextErr?: unknown
    ) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(upsertDeskVitals).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      { heartRate: 80, note: 'sitting' },
      'cid',
      ACTOR_ID
    );
  });

  it('PUT rejects an empty body', async () => {
    const res = mockRes();
    let err: unknown;
    upsertDeskVitalsHandler(staffReq({ body: {} }), res, ((nextErr?: unknown) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeDefined();
    expect(upsertDeskVitals).not.toHaveBeenCalled();
  });
});
