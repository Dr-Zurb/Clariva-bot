import { describe, expect, it } from '@jest/globals';
import { assertStaffRoleAssignable, isStaffRole } from '../../../src/auth/staff-roles';
import { ForbiddenError } from '../../../src/utils/errors';

describe('isStaffRole', () => {
  it('accepts receptionist', () => {
    expect(isStaffRole('receptionist')).toBe(true);
  });

  it('rejects doctor, admin, and missing claims', () => {
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole('admin')).toBe(false);
    expect(isStaffRole('authenticated')).toBe(false);
    expect(isStaffRole('doctor')).toBe(false);
  });
});

describe('assertStaffRoleAssignable', () => {
  it('refuses an admin account', () => {
    expect(() => assertStaffRoleAssignable('admin')).toThrow(ForbiddenError);
  });

  it('allows empty or receptionist', () => {
    expect(() => assertStaffRoleAssignable(undefined)).not.toThrow();
    expect(() => assertStaffRoleAssignable('receptionist')).not.toThrow();
  });
});
