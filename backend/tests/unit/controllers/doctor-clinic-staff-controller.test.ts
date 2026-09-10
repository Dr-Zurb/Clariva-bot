import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/doctor-clinic-staff-service', () => ({
  listDoctorClinicStaff: jest.fn(),
  provisionDoctorClinicStaff: jest.fn(),
  setDoctorClinicStaffStatus: jest.fn(),
  updateDoctorClinicStaffDisplayName: jest.fn(),
  deleteDoctorClinicStaff: jest.fn(),
}));

import {
  deleteDoctorClinicStaffHandler,
  listDoctorClinicStaffHandler,
  patchDoctorClinicStaffHandler,
  provisionDoctorClinicStaffHandler,
} from '../../../src/controllers/doctor-clinic-staff-controller';
import {
  deleteDoctorClinicStaff,
  listDoctorClinicStaff,
  provisionDoctorClinicStaff,
  setDoctorClinicStaffStatus,
  updateDoctorClinicStaffDisplayName,
} from '../../../src/services/doctor-clinic-staff-service';
import { UnauthorizedError, ValidationError } from '../../../src/utils/errors';

const mockedList = listDoctorClinicStaff as jest.MockedFunction<typeof listDoctorClinicStaff>;
const mockedProvision = provisionDoctorClinicStaff as jest.MockedFunction<
  typeof provisionDoctorClinicStaff
>;
const mockedStatus = setDoctorClinicStaffStatus as jest.MockedFunction<
  typeof setDoctorClinicStaffStatus
>;
const mockedDelete = deleteDoctorClinicStaff as jest.MockedFunction<
  typeof deleteDoctorClinicStaff
>;
const mockedDisplayName = updateDoctorClinicStaffDisplayName as jest.MockedFunction<
  typeof updateDoctorClinicStaffDisplayName
>;

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function invoke(
  handler: typeof provisionDoctorClinicStaffHandler,
  req: Request,
  res: Response
): Promise<unknown> {
  let captured: unknown;
  await new Promise<void>((resolve) => {
    const next = (err?: unknown) => {
      if (err) captured = err;
      resolve();
    };
    void Promise.resolve(handler(req, res, next)).then(
      () => resolve(),
      (err: unknown) => {
        captured = err;
        resolve();
      }
    );
  });
  return captured;
}

function makeRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedList.mockResolvedValue([]);
});

describe('listDoctorClinicStaffHandler', () => {
  it('requires auth', async () => {
    const err = await invoke(
      listDoctorClinicStaffHandler,
      { correlationId: 'c' } as unknown as Request,
      makeRes()
    );
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lists staff for the JWT doctor', async () => {
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(listDoctorClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedList).toHaveBeenCalledWith(DOCTOR_ID, 'c');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('provisionDoctorClinicStaffHandler', () => {
  it('rejects an invalid email', async () => {
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
      body: { email: 'not-an-email' },
    } as unknown as Request;
    const err = await invoke(provisionDoctorClinicStaffHandler, req, makeRes());
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedProvision).not.toHaveBeenCalled();
  });

  it('provisions against the JWT doctor (201)', async () => {
    mockedProvision.mockResolvedValue({
      item: {
        id: LINK_ID,
        staffUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        staffEmail: 'desk@clinic.test',
        displayName: null,
        role: 'receptionist',
        status: 'active',
        createdAt: '2026-08-23T00:00:00Z',
      },
      created: true,
      temporaryPassword: 'tmp',
    });
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
      body: { email: 'Desk@Clinic.Test' },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(provisionDoctorClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedProvision).toHaveBeenCalledWith(
      DOCTOR_ID,
      { email: 'desk@clinic.test' },
      'c'
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('patchDoctorClinicStaffHandler', () => {
  it('scopes suspend to the JWT doctor', async () => {
    mockedStatus.mockResolvedValue({
      id: LINK_ID,
      doctorId: DOCTOR_ID,
      staffUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      role: 'receptionist',
      status: 'suspended',
    });
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
      params: { id: LINK_ID },
      body: { status: 'suspended' },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(patchDoctorClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedStatus).toHaveBeenCalledWith(DOCTOR_ID, LINK_ID, 'suspended', 'c');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects an empty patch', async () => {
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
      params: { id: LINK_ID },
      body: {},
    } as unknown as Request;
    const err = await invoke(patchDoctorClinicStaffHandler, req, makeRes());
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedStatus).not.toHaveBeenCalled();
    expect(mockedDisplayName).not.toHaveBeenCalled();
  });

  it('updates display name for the JWT doctor', async () => {
    mockedDisplayName.mockResolvedValue({
      id: LINK_ID,
      doctorId: DOCTOR_ID,
      staffUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      role: 'receptionist',
      status: 'active',
    });
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
      params: { id: LINK_ID },
      body: { displayName: '  Front desk  ' },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(patchDoctorClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedDisplayName).toHaveBeenCalledWith(DOCTOR_ID, LINK_ID, 'Front desk', 'c');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('deleteDoctorClinicStaffHandler', () => {
  it('rejects a non-UUID id', async () => {
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
      params: { id: 'not-a-uuid' },
    } as unknown as Request;
    const err = await invoke(deleteDoctorClinicStaffHandler, req, makeRes());
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('scopes delete to the JWT doctor', async () => {
    mockedDelete.mockResolvedValue(undefined);
    const req = {
      correlationId: 'c',
      user: { id: DOCTOR_ID },
      params: { id: LINK_ID },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(deleteDoctorClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedDelete).toHaveBeenCalledWith(DOCTOR_ID, LINK_ID, 'c');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
