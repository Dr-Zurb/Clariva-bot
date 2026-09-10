import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const collectVisitPayment = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getDeskHisab = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/visit-payments-service', () => ({
  collectVisitPayment: (...args: unknown[]) => collectVisitPayment(...args),
  getDeskHisab: (...args: unknown[]) => getDeskHisab(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import {
  collectVisitPaymentHandler,
  getDeskHisabHandler,
} from '../../../src/controllers/visit-payments-controller';

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
    query: {},
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('visit payment handlers', () => {
  it('POST records a cash collection', async () => {
    collectVisitPayment.mockResolvedValue({
      payment: { id: 'p1', method: 'cash', amount_minor: 50000 },
      visit: { appointmentId: APT_ID, status: 'paid' },
    });
    const res = mockRes();
    let err: unknown;
    collectVisitPaymentHandler(
      staffReq({ body: { method: 'cash', amountMinor: 50000 } }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(collectVisitPayment).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      { method: 'cash', amountMinor: 50000 },
      'cid',
      ACTOR_ID
    );
  });

  it('POST rejects cash without an amount', async () => {
    const res = mockRes();
    let err: unknown;
    collectVisitPaymentHandler(
      staffReq({ body: { method: 'cash' } }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(err).toBeDefined();
    expect(collectVisitPayment).not.toHaveBeenCalled();
  });

  it('GET hisab requires a session date', async () => {
    getDeskHisab.mockResolvedValue({ date: '2026-08-31', totals: { cashMinor: 0 } });
    const res = mockRes();
    let err: unknown;
    getDeskHisabHandler(
      staffReq({ query: { date: '2026-08-31' } }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(getDeskHisab).toHaveBeenCalledWith(DOCTOR_ID, '2026-08-31', 'cid', ACTOR_ID);
  });
});
