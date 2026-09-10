import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const archivePatientForFrontDesk = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const restorePatientForFrontDesk = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/patient-service', () => ({
  archivePatientForFrontDesk: (...args: unknown[]) => archivePatientForFrontDesk(...args),
  restorePatientForFrontDesk: (...args: unknown[]) => restorePatientForFrontDesk(...args),
  updatePatientForFrontDesk: jest.fn(),
  createPatientForFrontDesk: jest.fn(),
  bulkTagPatientsForDoctor: jest.fn(),
  getPatientForDoctor: jest.fn(),
  listPatientsForDoctor: jest.fn(),
  listPatientsForDoctorFiltered: jest.fn(),
  mergePatients: jest.fn(),
}));

jest.mock('../../../src/services/patient-matching-service', () => ({
  listPossibleDuplicates: jest.fn(),
}));

import {
  archivePatientHandler,
  restorePatientHandler,
} from '../../../src/controllers/patient-controller';
import { UnauthorizedError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-4000-8000-0000000000cc';
const PATIENT_ID = '00000000-0000-4000-8000-0000000000ee';

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
});

describe('archivePatientHandler', () => {
  it('returns 200 with the archived patient', async () => {
    archivePatientForFrontDesk.mockResolvedValue({
      kind: 'archived',
      patient: { id: PATIENT_ID, archived_at: '2026-08-23T00:00:00.000Z' },
    });

    const res = mockRes();
    await archivePatientHandler(
      {
        user: { id: ACTOR_ID },
        actingDoctorId: DOCTOR_ID,
        actorId: ACTOR_ID,
        correlationId: 'cid',
        params: { id: PATIENT_ID },
      } as unknown as Request,
      res,
      ((err?: unknown) => {
        if (err) throw err;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(200);
    expect(archivePatientForFrontDesk).toHaveBeenCalledWith(
      DOCTOR_ID,
      PATIENT_ID,
      'cid',
      ACTOR_ID
    );
  });

  it('returns 409 when the record has clinical data', async () => {
    archivePatientForFrontDesk.mockResolvedValue({ kind: 'has_clinical_data' });

    const res = mockRes();
    await archivePatientHandler(
      {
        user: { id: DOCTOR_ID },
        actingDoctorId: DOCTOR_ID,
        correlationId: 'cid',
        params: { id: PATIENT_ID },
      } as unknown as Request,
      res,
      ((err?: unknown) => {
        if (err) throw err;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(409);
    const body = res.body as { error: { details: { reason: string }; message: string } };
    expect(body.error.details.reason).toBe('has_clinical_data');
    expect(body.error.message).toMatch(/clinical data/i);
  });

  it('rejects an unauthenticated request', async () => {
    const res = mockRes();
    const next = jest.fn();
    archivePatientHandler(
      {
        correlationId: 'cid',
        params: { id: PATIENT_ID },
      } as unknown as Request,
      res,
      next
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(archivePatientForFrontDesk).not.toHaveBeenCalled();
  });
});

describe('restorePatientHandler', () => {
  it('returns 200 with the restored patient', async () => {
    restorePatientForFrontDesk.mockResolvedValue({
      id: PATIENT_ID,
      archived_at: null,
    });

    const res = mockRes();
    await restorePatientHandler(
      {
        user: { id: ACTOR_ID },
        actingDoctorId: DOCTOR_ID,
        actorId: ACTOR_ID,
        correlationId: 'cid',
        params: { id: PATIENT_ID },
      } as unknown as Request,
      res,
      ((err?: unknown) => {
        if (err) throw err;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(200);
    expect(restorePatientForFrontDesk).toHaveBeenCalledWith(
      DOCTOR_ID,
      PATIENT_ID,
      'cid',
      ACTOR_ID
    );
  });
});
