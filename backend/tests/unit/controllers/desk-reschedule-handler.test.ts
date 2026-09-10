import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const rescheduleAppointmentForDesk = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/desk-reschedule-service', () => ({
  rescheduleAppointmentForDesk: (...args: unknown[]) => rescheduleAppointmentForDesk(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { deskRescheduleAppointmentHandler } from '../../../src/controllers/desk-reschedule-controller';

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
    body: { appointmentDate: '2026-09-01T05:30:00.000Z' },
    query: {},
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deskRescheduleAppointmentHandler', () => {
  it('moves the visit for the acting doctor', async () => {
    rescheduleAppointmentForDesk.mockResolvedValue({
      appointment: {
        id: APT_ID,
        status: 'confirmed',
        appointment_date: '2026-09-01T05:30:00.000Z',
        opd_token_number: 4,
      },
    });
    const res = mockRes();
    let err: unknown;
    deskRescheduleAppointmentHandler(
      staffReq(),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(rescheduleAppointmentForDesk).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      ACTOR_ID,
      '2026-09-01T05:30:00.000Z',
      'cid'
    );
  });

  it('rejects a missing appointmentDate', async () => {
    const res = mockRes();
    let err: unknown;
    deskRescheduleAppointmentHandler(
      staffReq({ body: {} }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(err).toBeDefined();
    expect(rescheduleAppointmentForDesk).not.toHaveBeenCalled();
  });
});
