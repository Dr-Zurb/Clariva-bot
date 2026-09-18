import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const checkInAppointment = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/appointment-service', () => ({
  bookAppointment: jest.fn(),
  checkInAppointment: (...args: unknown[]) => checkInAppointment(...args),
  getAppointmentById: jest.fn(),
  getRecentDiagnosisTags: jest.fn(),
  listAppointmentsForDoctor: jest.fn(),
  updateAppointment: jest.fn(),
  wrapUpAppointment: jest.fn(),
}));

jest.mock('../../../src/services/patient-service', () => ({
  getPatientForDoctor: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../src/services/notification-service', () => ({
  sendConsultationReadyToPatient: jest.fn(),
}));

import { checkInAppointmentHandler } from '../../../src/controllers/appointment-controller';

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

beforeEach(() => {
  jest.clearAllMocks();
  checkInAppointment.mockResolvedValue({
    id: APT_ID,
    patient_checked_in_at: '2026-08-22T10:00:00.000Z',
  });
});

describe('checkInAppointmentHandler', () => {
  it('stamps arrival for the acting doctor', async () => {
    const res = mockRes();
    let err: unknown;
    checkInAppointmentHandler(
      {
        user: { id: ACTOR_ID },
        actingDoctorId: DOCTOR_ID,
        actorId: ACTOR_ID,
        actorKind: 'staff',
        correlationId: 'cid',
        params: { id: APT_ID },
      } as unknown as Request,
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(checkInAppointment).toHaveBeenCalledWith(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
  });
});
