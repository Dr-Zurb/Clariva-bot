/**
 * Admin clinic-staff console (RQ1).
 * Zod rejects bad input; happy path forwards to the service.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/admin-clinic-staff-service', () => ({
  listAdminClinicStaff: jest.fn(),
  provisionAdminClinicStaff: jest.fn(),
  setAdminClinicStaffStatus: jest.fn(),
  updateAdminClinicStaffDisplayName: jest.fn(),
  deleteAdminClinicStaff: jest.fn(),
}));

import {
  deleteAdminClinicStaffHandler,
  listAdminClinicStaffHandler,
  patchAdminClinicStaffHandler,
  provisionAdminClinicStaffHandler,
} from '../../../src/controllers/admin-clinic-staff-controller';
import {
  deleteAdminClinicStaff,
  listAdminClinicStaff,
  provisionAdminClinicStaff,
  setAdminClinicStaffStatus,
  updateAdminClinicStaffDisplayName,
} from '../../../src/services/admin-clinic-staff-service';
import { ValidationError } from '../../../src/utils/errors';

const mockedList = listAdminClinicStaff as jest.MockedFunction<typeof listAdminClinicStaff>;
const mockedProvision = provisionAdminClinicStaff as jest.MockedFunction<
  typeof provisionAdminClinicStaff
>;
const mockedStatus = setAdminClinicStaffStatus as jest.MockedFunction<
  typeof setAdminClinicStaffStatus
>;
const mockedDelete = deleteAdminClinicStaff as jest.MockedFunction<
  typeof deleteAdminClinicStaff
>;
const mockedDisplayName = updateAdminClinicStaffDisplayName as jest.MockedFunction<
  typeof updateAdminClinicStaffDisplayName
>;

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function invoke(
  handler: typeof provisionAdminClinicStaffHandler,
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

const ITEM = {
  id: LINK_ID,
  doctorId: DOCTOR_ID,
  doctorEmail: 'doc@example.com',
  staffUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  staffEmail: 'desk@clinic.test',
  displayName: 'Front desk',
  role: 'receptionist',
  status: 'active' as const,
  createdAt: '2026-08-22T00:00:00Z',
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedList.mockResolvedValue([]);
});

describe('listAdminClinicStaffHandler', () => {
  it('lists staff for the admin console', async () => {
    mockedList.mockResolvedValue([ITEM]);
    const req = { correlationId: 'c' } as unknown as Request;
    const res = makeRes();
    const err = await invoke(listAdminClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedList).toHaveBeenCalledWith('c');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('provisionAdminClinicStaffHandler', () => {
  it('rejects an invalid email (Zod)', async () => {
    const req = {
      correlationId: 'c',
      body: { email: 'not-an-email', doctorId: DOCTOR_ID },
    } as unknown as Request;
    const err = await invoke(provisionAdminClinicStaffHandler, req, makeRes());
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedProvision).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID doctorId', async () => {
    const req = {
      correlationId: 'c',
      body: { email: 'desk@clinic.test', doctorId: 'not-a-uuid' },
    } as unknown as Request;
    const err = await invoke(provisionAdminClinicStaffHandler, req, makeRes());
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedProvision).not.toHaveBeenCalled();
  });

  it('provisions a new staff user (201)', async () => {
    mockedProvision.mockResolvedValue({
      item: ITEM,
      created: true,
      temporaryPassword: 'tmp-pass',
    });
    const req = {
      correlationId: 'c',
      adminActor: 'admin-1',
      body: {
        email: 'Desk@Clinic.Test',
        doctorId: DOCTOR_ID,
        displayName: 'Front desk',
      },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(provisionAdminClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedProvision).toHaveBeenCalledWith(
      {
        email: 'desk@clinic.test',
        doctorId: DOCTOR_ID,
        displayName: 'Front desk',
      },
      'c',
      'admin-1'
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 200 when linking an existing auth user', async () => {
    mockedProvision.mockResolvedValue({ item: ITEM, created: false });
    const req = {
      correlationId: 'c',
      body: { email: 'desk@clinic.test', doctorId: DOCTOR_ID },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(provisionAdminClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedProvision).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'desk@clinic.test', doctorId: DOCTOR_ID }),
      'c',
      'ops'
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('patchAdminClinicStaffHandler', () => {
  it('rejects an invalid status', async () => {
    const req = {
      correlationId: 'c',
      params: { id: LINK_ID },
      body: { status: 'deleted' },
    } as unknown as Request;
    const err = await invoke(patchAdminClinicStaffHandler, req, makeRes());
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedStatus).not.toHaveBeenCalled();
  });

  it('forwards a suspend to the service', async () => {
    mockedStatus.mockResolvedValue({
      id: LINK_ID,
      doctorId: DOCTOR_ID,
      staffUserId: ITEM.staffUserId,
      role: 'receptionist',
      status: 'suspended',
      capabilities: ['front_desk', 'previsit'],
    });
    const req = {
      correlationId: 'c',
      adminActor: 'admin-1',
      params: { id: LINK_ID },
      body: { status: 'suspended' },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(patchAdminClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedStatus).toHaveBeenCalledWith(LINK_ID, 'suspended', 'c', 'admin-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updates display name', async () => {
    mockedDisplayName.mockResolvedValue({
      id: LINK_ID,
      doctorId: DOCTOR_ID,
      staffUserId: ITEM.staffUserId,
      role: 'receptionist',
      status: 'active',
      capabilities: ['front_desk', 'previsit'],
    });
    const req = {
      correlationId: 'c',
      adminActor: 'admin-1',
      params: { id: LINK_ID },
      body: { displayName: 'Desk' },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(patchAdminClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedDisplayName).toHaveBeenCalledWith(LINK_ID, 'Desk', 'c', 'admin-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('deleteAdminClinicStaffHandler', () => {
  it('rejects a non-UUID id', async () => {
    const req = {
      correlationId: 'c',
      params: { id: 'not-a-uuid' },
    } as unknown as Request;
    const err = await invoke(deleteAdminClinicStaffHandler, req, makeRes());
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('forwards delete to the service', async () => {
    mockedDelete.mockResolvedValue(undefined);
    const req = {
      correlationId: 'c',
      adminActor: 'admin-1',
      params: { id: LINK_ID },
    } as unknown as Request;
    const res = makeRes();
    const err = await invoke(deleteAdminClinicStaffHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedDelete).toHaveBeenCalledWith(LINK_ID, 'c', 'admin-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

