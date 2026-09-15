/**
 * Staff role claims (receptionist-portal P1).
 *
 * `app_metadata.role === 'receptionist'` is a routing hint only (DL-4).
 * Access is granted by an active `clinic_staff` row, not by this claim.
 */

import { ForbiddenError } from '../utils/errors';

export const STAFF_ROLES = ['receptionist'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * Refuse converting an admin account into clinic staff (P1-Q1 / S3.1).
 * The JWT role slot is single-valued; admin and receptionist cannot coexist.
 */
export function assertStaffRoleAssignable(existingRole: unknown): void {
  if (existingRole === 'admin') {
    throw new ForbiddenError('Cannot convert an admin account into clinic staff');
  }
}
