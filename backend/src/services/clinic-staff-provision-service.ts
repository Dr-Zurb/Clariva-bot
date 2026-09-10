/**
 * Create / look up a receptionist auth user and link clinic_staff.
 * Used by the CLI, admin console, and doctor Settings. Never logs email
 * or display_name.
 *
 * Existing non-staff accounts are never converted. A leftover receptionist
 * with no link can be re-linked to this doctor after a delete.
 */

import { randomBytes } from 'crypto';
import type { User } from '@supabase/supabase-js';
import { isStaffRole } from '../auth/staff-roles';
import { getSupabaseAdminClient } from '../config/database';
import {
  findActiveStaffForDoctor,
  findStaffLink,
  setClinicStaffStatus,
  upsertClinicStaffLink,
} from './clinic-staff-service';
import type { ClinicStaffLink } from '../types/clinic-staff';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '../utils/errors';

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

function existingRole(user: User): unknown {
  return user.app_metadata?.role;
}

export async function findAuthUserByEmail(
  email: string,
  _correlationId: string
): Promise<User | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const normalized = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new InternalError('Failed to list users');
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) {
      return match;
    }
    if (data.users.length < perPage) {
      return null;
    }
  }
  return null;
}

async function createStaffUser(
  email: string,
  correlationId: string
): Promise<{ user: User; password: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const password = randomPassword();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'receptionist' },
  });

  if (!created.error && created.data.user) {
    return { user: created.data.user, password };
  }

  const raced = await findAuthUserByEmail(email, correlationId);
  if (raced) {
    throw new ConflictError('That email already has an account');
  }
  throw new InternalError('User create failed and lookup found no account');
}

async function nextStatusForNewLink(
  doctorId: string,
  correlationId: string
): Promise<'active' | 'suspended'> {
  const active = await findActiveStaffForDoctor(doctorId, correlationId);
  return active ? 'suspended' : 'active';
}

export async function provisionClinicStaff(
  input: { email: string; doctorId: string; displayName?: string },
  correlationId: string
): Promise<{ link: ClinicStaffLink; created: boolean; temporaryPassword?: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) {
    throw new ValidationError('A valid email is required');
  }

  const existing = await findAuthUserByEmail(email, correlationId);
  if (existing) {
    const link = await findStaffLink(existing.id, correlationId);
    if (link && link.doctorId !== input.doctorId) {
      throw new ConflictError('Staff account is already linked to another practice');
    }
    if (link) {
      const updated = await upsertClinicStaffLink(
        {
          doctorId: input.doctorId,
          staffUserId: existing.id,
          displayName: input.displayName,
        },
        correlationId
      );
      return { link: updated, created: false };
    }
    if (!isStaffRole(existingRole(existing))) {
      throw new ConflictError('That email already has an account');
    }
    const status = await nextStatusForNewLink(input.doctorId, correlationId);
    const relinked = await upsertClinicStaffLink(
      {
        doctorId: input.doctorId,
        staffUserId: existing.id,
        displayName: input.displayName,
        status,
      },
      correlationId
    );
    return { link: relinked, created: false };
  }

  const status = await nextStatusForNewLink(input.doctorId, correlationId);
  const { user, password } = await createStaffUser(email, correlationId);
  const createdLink = await upsertClinicStaffLink(
    {
      doctorId: input.doctorId,
      staffUserId: user.id,
      displayName: input.displayName,
      status,
    },
    correlationId
  );

  return {
    link: createdLink,
    created: true,
    temporaryPassword: password,
  };
}

export async function setClinicStaffStatusByEmail(
  email: string,
  status: 'active' | 'suspended',
  correlationId: string
): Promise<ClinicStaffLink> {
  const user = await findAuthUserByEmail(email, correlationId);
  if (!user) {
    throw new NotFoundError('No auth user for that email');
  }
  return setClinicStaffStatus(user.id, status, correlationId);
}
