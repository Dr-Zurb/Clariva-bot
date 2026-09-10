import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const maybeSingle = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const single = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const eq = jest.fn<(...args: unknown[]) => unknown>();
const select = jest.fn<(...args: unknown[]) => unknown>();
const upsert = jest.fn<(...args: unknown[]) => unknown>();
const update = jest.fn<(...args: unknown[]) => unknown>();
const from = jest.fn<(...args: unknown[]) => unknown>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => ({ from })),
}));

import {
  findStaffLink,
  setClinicStaffStatus,
  upsertClinicStaffLink,
} from '../../../src/services/clinic-staff-service';
import { ConflictError, NotFoundError } from '../../../src/utils/errors';

const STAFF_ID = '00000000-0000-0000-0000-0000000000cc';
const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_DOCTOR = '00000000-0000-0000-0000-0000000000bb';

const ROW = {
  id: 'link-1',
  doctor_id: DOCTOR_ID,
  staff_user_id: STAFF_ID,
  role: 'receptionist',
  status: 'active' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  from.mockReturnValue({ select, upsert, update });
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ maybeSingle, select });
  upsert.mockReturnValue({ select });
  update.mockReturnValue({ eq });
  maybeSingle.mockResolvedValue({ data: ROW, error: null });
  single.mockResolvedValue({ data: ROW, error: null });
  select.mockImplementation(() => ({ eq, single, maybeSingle }));
});

describe('findStaffLink', () => {
  it('returns a mapped link', async () => {
    const link = await findStaffLink(STAFF_ID, 'cid');
    expect(link).toEqual({
      id: 'link-1',
      doctorId: DOCTOR_ID,
      staffUserId: STAFF_ID,
      role: 'receptionist',
      status: 'active',
    });
    expect(from).toHaveBeenCalledWith('clinic_staff');
  });

  it('returns null when no row exists', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(findStaffLink(STAFF_ID, 'cid')).resolves.toBeNull();
  });
});

describe('upsertClinicStaffLink', () => {
  it('refuses a staff user already linked to another doctor', async () => {
    maybeSingle.mockResolvedValue({
      data: { ...ROW, doctor_id: OTHER_DOCTOR },
      error: null,
    });

    await expect(
      upsertClinicStaffLink({ doctorId: DOCTOR_ID, staffUserId: STAFF_ID }, 'cid')
    ).rejects.toBeInstanceOf(ConflictError);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('setClinicStaffStatus', () => {
  it('throws when no link exists', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(setClinicStaffStatus(STAFF_ID, 'suspended', 'cid')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
