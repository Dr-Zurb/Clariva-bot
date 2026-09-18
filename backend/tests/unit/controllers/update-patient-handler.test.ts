import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const updatePatientForFrontDesk = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/patient-service', () => ({
  updatePatientForFrontDesk: (...args: unknown[]) => updatePatientForFrontDesk(...args),
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

import { updatePatientHandler } from '../../../src/controllers/patient-controller';
import { UnauthorizedError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-4000-8000-0000000000cc';
const PATIENT_ID = '00000000-0000-4000-8000-0000000000ee';

const BODY = {
  name: 'Ria Sharma',
  phone: '9814861579',
  gender: 'female',
  guardianName: 'Ram Prakash',
  guardianRelation: 'father',
  age: 31,
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

async function run(req: Request): Promise<Response & { statusCode: number; body: unknown }> {
  const res = mockRes();
  await updatePatientHandler(req, res, ((err?: unknown) => {
    if (err) throw err;
  }) as never);
  await new Promise((resolve) => setImmediate(resolve));
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updatePatientHandler', () => {
  it('returns 200 with the updated patient for a staff actor', async () => {
    updatePatientForFrontDesk.mockResolvedValue({
      kind: 'updated',
      patient: { id: PATIENT_ID, name: 'Ria Sharma', phone: '9814861579' },
    });

    const res = await run({
      user: { id: ACTOR_ID },
      actingDoctorId: DOCTOR_ID,
      actorId: ACTOR_ID,
      correlationId: 'cid',
      params: { id: PATIENT_ID },
      body: BODY,
    } as unknown as Request);

    expect(res.statusCode).toBe(200);
    expect(updatePatientForFrontDesk).toHaveBeenCalledWith(
      DOCTOR_ID,
      PATIENT_ID,
      expect.objectContaining({ name: 'Ria Sharma', phone: '9814861579' }),
      'cid',
      ACTOR_ID
    );
  });

  it('returns 409 with matches when the service asks for confirm', async () => {
    updatePatientForFrontDesk.mockResolvedValue({
      kind: 'possible_duplicates',
      matches: [{ patientId: PATIENT_ID, name: 'Ria', phone: '9814861579', confidence: 1 }],
    });

    const res = await run({
      user: { id: DOCTOR_ID },
      actingDoctorId: DOCTOR_ID,
      correlationId: 'cid',
      params: { id: PATIENT_ID },
      body: BODY,
    } as unknown as Request);

    expect(res.statusCode).toBe(409);
    const body = res.body as { error: { details: { matches: unknown[] } } };
    expect(body.error.details.matches).toHaveLength(1);
  });

  it('rejects an unauthenticated request', async () => {
    const res = mockRes();
    const next = jest.fn();
    updatePatientHandler(
      {
        correlationId: 'cid',
        params: { id: PATIENT_ID },
        body: BODY,
      } as unknown as Request,
      res,
      next
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(updatePatientForFrontDesk).not.toHaveBeenCalled();
  });
});
