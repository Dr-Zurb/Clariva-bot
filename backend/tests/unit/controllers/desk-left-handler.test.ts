import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const leaveAppointmentForDesk = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/desk-left-service', () => ({
  leaveAppointmentForDesk: (...args: unknown[]) => leaveAppointmentForDesk(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { deskLeftAppointmentHandler } from '../../../src/controllers/desk-left-controller';

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

describe('deskLeftAppointmentHandler', () => {
  it('leaves for the acting doctor and returns a lean appointment', async () => {
    leaveAppointmentForDesk.mockResolvedValue({
      appointment: { id: APT_ID, status: 'cancelled', opd_token_number: 3 },
    });
    const res = mockRes();
    let err: unknown;
    deskLeftAppointmentHandler(staffReq({ body: { returnMethod: 'cash' } }), res, ((
      nextErr?: unknown
    ) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(leaveAppointmentForDesk).toHaveBeenCalledWith(APT_ID, DOCTOR_ID, ACTOR_ID, 'cid', {
      returnMethod: 'cash',
    });
    expect(
      (res.body as { data: { appointment: { status: string } } }).data.appointment.status
    ).toBe('cancelled');
  });

  it('rejects an unknown return method', async () => {
    const res = mockRes();
    let err: unknown;
    deskLeftAppointmentHandler(staffReq({ body: { returnMethod: 'refund' } }), res, ((
      nextErr?: unknown
    ) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));
    expect(err).toBeDefined();
    expect(leaveAppointmentForDesk).not.toHaveBeenCalled();
  });
});
