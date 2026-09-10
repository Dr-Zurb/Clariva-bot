import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { User } from '@supabase/supabase-js';

const createUser = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const listUsers = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const updateUserById = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const upsertClinicStaffLink = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const setClinicStaffStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const findStaffLink = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const findActiveStaffForDoctor = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => ({
    auth: { admin: { createUser, listUsers, updateUserById } },
  })),
}));

jest.mock('../../../src/services/clinic-staff-service', () => ({
  upsertClinicStaffLink: (...args: unknown[]) => upsertClinicStaffLink(...args),
  setClinicStaffStatus: (...args: unknown[]) => setClinicStaffStatus(...args),
  findStaffLink: (...args: unknown[]) => findStaffLink(...args),
  findActiveStaffForDoctor: (...args: unknown[]) => findActiveStaffForDoctor(...args),
}));

import { provisionClinicStaff } from '../../../src/services/clinic-staff-provision-service';
import { ConflictError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const STAFF_ID = '00000000-0000-0000-0000-0000000000cc';
const OTHER_STAFF = '00000000-0000-0000-0000-0000000000dd';

const LINK = {
  id: 'link-1',
  doctorId: DOCTOR_ID,
  staffUserId: STAFF_ID,
  role: 'receptionist',
  status: 'active' as const,
};

function user(overrides: Partial<User> = {}): User {
  return {
    id: STAFF_ID,
    email: 'desk@clinic.test',
    app_metadata: { role: 'receptionist' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-08-22T00:00:00Z',
    ...overrides,
  } as User;
}

beforeEach(() => {
  jest.clearAllMocks();
  upsertClinicStaffLink.mockResolvedValue(LINK);
  findStaffLink.mockResolvedValue(null);
  findActiveStaffForDoctor.mockResolvedValue(null);
  listUsers.mockResolvedValue({ data: { users: [] }, error: null });
});

describe('provisionClinicStaff', () => {
  it('rejects an invalid email', async () => {
    await expect(
      provisionClinicStaff({ email: 'not-an-email', doctorId: DOCTOR_ID }, 'cid')
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('returns a temporary password when a new auth user is created', async () => {
    createUser.mockResolvedValue({ data: { user: user() }, error: null });

    const result = await provisionClinicStaff(
      { email: 'Desk@Clinic.Test', doctorId: DOCTOR_ID, displayName: 'Front desk' },
      'cid'
    );

    expect(result.created).toBe(true);
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(result.temporaryPassword!.length).toBeGreaterThan(8);
    expect(upsertClinicStaffLink).toHaveBeenCalledWith(
      {
        doctorId: DOCTOR_ID,
        staffUserId: STAFF_ID,
        displayName: 'Front desk',
        status: 'active',
      },
      'cid'
    );
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('refuses an existing account that is not already this doctor\'s staff', async () => {
    listUsers.mockResolvedValue({
      data: { users: [user({ app_metadata: {} })] },
      error: null,
    });
    findStaffLink.mockResolvedValue(null);

    await expect(
      provisionClinicStaff({ email: 'desk@clinic.test', doctorId: DOCTOR_ID }, 'cid')
    ).rejects.toBeInstanceOf(ConflictError);
    expect(createUser).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(upsertClinicStaffLink).not.toHaveBeenCalled();
  });

  it('re-links an account already tied to this doctor without a new password', async () => {
    listUsers.mockResolvedValue({
      data: { users: [user()] },
      error: null,
    });
    findStaffLink.mockResolvedValue({ ...LINK, status: 'suspended' });

    const result = await provisionClinicStaff(
      { email: 'desk@clinic.test', doctorId: DOCTOR_ID },
      'cid'
    );

    expect(result.created).toBe(false);
    expect(result.temporaryPassword).toBeUndefined();
    expect(createUser).not.toHaveBeenCalled();
    expect(upsertClinicStaffLink).toHaveBeenCalled();
  });

  it('creates a spare login as suspended when a seat is already taken', async () => {
    createUser.mockResolvedValue({
      data: { user: user({ id: OTHER_STAFF, email: 'newdesk@clinic.test' }) },
      error: null,
    });
    findActiveStaffForDoctor.mockResolvedValue({
      ...LINK,
      staffUserId: OTHER_STAFF,
    });

    const result = await provisionClinicStaff(
      { email: 'newdesk@clinic.test', doctorId: DOCTOR_ID },
      'cid'
    );

    expect(result.created).toBe(true);
    expect(upsertClinicStaffLink).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        status: 'suspended',
      }),
      'cid'
    );
  });

  it('re-links a leftover receptionist with no clinic_staff row', async () => {
    listUsers.mockResolvedValue({
      data: { users: [user()] },
      error: null,
    });
    findStaffLink.mockResolvedValue(null);

    const result = await provisionClinicStaff(
      { email: 'desk@clinic.test', doctorId: DOCTOR_ID },
      'cid'
    );

    expect(result.created).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
    expect(upsertClinicStaffLink).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        staffUserId: STAFF_ID,
        status: 'active',
      }),
      'cid'
    );
  });
});
