import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const bookAppointment = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const checkInAppointment = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getPatientForDoctor = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getDeskPatientForBooking = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const sendDeskBookingConfirmationToPatient = jest.fn<
  (...args: unknown[]) => Promise<unknown>
>();

jest.mock('../../../src/services/appointment-service', () => ({
  bookAppointment: (...args: unknown[]) => bookAppointment(...args),
  checkInAppointment: (...args: unknown[]) => checkInAppointment(...args),
  getAppointmentById: jest.fn(),
  getRecentDiagnosisTags: jest.fn(),
  listAppointmentsForDoctor: jest.fn(),
  updateAppointment: jest.fn(),
  wrapUpAppointment: jest.fn(),
}));

jest.mock('../../../src/services/patient-service', () => ({
  getPatientForDoctor: (...args: unknown[]) => getPatientForDoctor(...args),
  getDeskPatientForBooking: (...args: unknown[]) => getDeskPatientForBooking(...args),
}));

jest.mock('../../../src/services/notification-service', () => ({
  sendDeskBookingConfirmationToPatient: (...args: unknown[]) =>
    sendDeskBookingConfirmationToPatient(...args),
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { createAppointmentHandler } from '../../../src/controllers/appointment-controller';
import { ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const ACTOR_ID = '660e8400-e29b-41d4-a716-446655440001';
const PATIENT_ID = '770e8400-e29b-41d4-a716-446655440002';

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

async function run(
  req: Request
): Promise<{ res: Response & { statusCode: number; body: unknown }; err: unknown }> {
  const res = mockRes();
  let err: unknown;
  createAppointmentHandler(req, res, ((nextErr?: unknown) => {
    err = nextErr;
  }) as never);
  await new Promise((resolve) => setImmediate(resolve));
  return { res, err };
}

const futureIso = new Date(Date.now() + 3600_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  getPatientForDoctor.mockResolvedValue({
    name: 'Ria',
    phone: '9814861579',
  });
  getDeskPatientForBooking.mockResolvedValue({
    name: 'Ria',
    phone: '9814861579',
    medical_record_number: 'P-00001',
  });
  bookAppointment.mockResolvedValue({ id: 'apt-1' });
  checkInAppointment.mockResolvedValue({ id: 'apt-1', patient_checked_in_at: 'now' });
  sendDeskBookingConfirmationToPatient.mockResolvedValue(true);
});

describe('createAppointmentHandler (desk / P4)', () => {
  it('rejects staff walk-in without a patient row', async () => {
    const { err } = await run({
      user: { id: ACTOR_ID },
      actingDoctorId: DOCTOR_ID,
      actorId: ACTOR_ID,
      actorKind: 'staff',
      correlationId: 'cid',
      body: { walkin: true, appointmentDate: futureIso },
    } as unknown as Request);

    expect(err).toBeInstanceOf(ValidationError);
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it('books for the acting doctor and skips ownership via actingFor', async () => {
    const { res, err } = await run({
      user: { id: ACTOR_ID },
      actingDoctorId: DOCTOR_ID,
      actorId: ACTOR_ID,
      actorKind: 'staff',
      correlationId: 'cid',
      body: {
        patientId: PATIENT_ID,
        appointmentDate: futureIso,
        bookingOrigin: 'walk_in',
      },
    } as unknown as Request);

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(getDeskPatientForBooking).toHaveBeenCalledWith(
      PATIENT_ID,
      DOCTOR_ID,
      'cid',
      ACTOR_ID
    );
    expect(getPatientForDoctor).not.toHaveBeenCalled();
    expect(bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        freeOfCost: true,
        consultationType: 'in_clinic',
        bookingOrigin: 'walk_in',
        skipMrn: true,
      }),
      'cid',
      ACTOR_ID,
      { actingForDoctorId: DOCTOR_ID }
    );
    expect(sendDeskBookingConfirmationToPatient).not.toHaveBeenCalled();
    expect(checkInAppointment).not.toHaveBeenCalled();
  });

  it('notifies the patient on a phone pre-booking', async () => {
    const { res, err } = await run({
      user: { id: ACTOR_ID },
      actingDoctorId: DOCTOR_ID,
      actorId: ACTOR_ID,
      actorKind: 'staff',
      correlationId: 'cid',
      body: {
        patientId: PATIENT_ID,
        appointmentDate: futureIso,
        bookingOrigin: 'booked',
      },
    } as unknown as Request);

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(sendDeskBookingConfirmationToPatient).toHaveBeenCalledWith('apt-1', 'cid');
  });

  it('does not notify when a doctor books', async () => {
    const { err } = await run({
      user: { id: DOCTOR_ID },
      actingDoctorId: DOCTOR_ID,
      actorId: DOCTOR_ID,
      actorKind: 'doctor',
      correlationId: 'cid',
      body: {
        patientId: PATIENT_ID,
        appointmentDate: futureIso,
        bookingOrigin: 'booked',
      },
    } as unknown as Request);

    expect(err).toBeUndefined();
    expect(sendDeskBookingConfirmationToPatient).not.toHaveBeenCalled();
  });

  it('checks in during the same request when checkIn is true', async () => {
    const { res, err } = await run({
      user: { id: ACTOR_ID },
      actingDoctorId: DOCTOR_ID,
      actorId: ACTOR_ID,
      actorKind: 'staff',
      correlationId: 'cid',
      body: {
        patientId: PATIENT_ID,
        appointmentDate: futureIso,
        bookingOrigin: 'walk_in',
        checkIn: true,
      },
    } as unknown as Request);

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ checkIn: true }),
      'cid',
      ACTOR_ID,
      { actingForDoctorId: DOCTOR_ID }
    );
    expect(checkInAppointment).not.toHaveBeenCalled();
  });
});
