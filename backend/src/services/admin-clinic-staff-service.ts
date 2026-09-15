/**
 * Admin console directory for clinic staff (RQ1 fast-follow).
 * Emails are for the UI only — never log them or display_name (DL-9).
 */

import { getSupabaseAdminClient } from '../config/database';
import { logAuditEvent } from '../utils/audit-logger';
import { InternalError } from '../utils/errors';
import {
  deleteClinicStaffLink,
  listClinicStaffRows,
  setClinicStaffStatusById,
  updateClinicStaffDisplayName,
} from './clinic-staff-service';
import { provisionClinicStaff } from './clinic-staff-provision-service';
import type { ClinicStaffLink } from '../types/clinic-staff';

export type AdminClinicStaffItem = {
  id: string;
  doctorId: string;
  doctorEmail: string | null;
  staffUserId: string;
  staffEmail: string | null;
  displayName: string | null;
  role: string;
  status: 'active' | 'suspended';
  createdAt: string;
};

async function authEmail(userId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return null;
  }
  return data.user.email ?? null;
}

export async function listAdminClinicStaff(
  correlationId: string
): Promise<AdminClinicStaffItem[]> {
  const rows = await listClinicStaffRows(correlationId);
  const items: AdminClinicStaffItem[] = [];
  for (const row of rows) {
    const [staffEmail, doctorEmail] = await Promise.all([
      authEmail(row.staff_user_id),
      authEmail(row.doctor_id),
    ]);
    items.push({
      id: row.id,
      doctorId: row.doctor_id,
      doctorEmail,
      staffUserId: row.staff_user_id,
      staffEmail,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    });
  }

  await logAuditEvent({
    correlationId,
    action: 'read_clinic_staff',
    resourceType: 'clinic_staff',
    status: 'success',
    metadata: { count: items.length },
  });

  return items;
}

export async function provisionAdminClinicStaff(
  input: { email: string; doctorId: string; displayName?: string },
  correlationId: string,
  adminActor: string
): Promise<{
  item: AdminClinicStaffItem;
  created: boolean;
  temporaryPassword?: string;
}> {
  const result = await provisionClinicStaff(input, correlationId);
  await logAuditEvent({
    correlationId,
    userId: adminActor,
    action: 'create_clinic_staff',
    resourceType: 'clinic_staff',
    resourceId: result.link.id,
    status: 'success',
    metadata: { created: result.created },
  });

  const [staffEmail, doctorEmail] = await Promise.all([
    authEmail(result.link.staffUserId),
    authEmail(result.link.doctorId),
  ]);

  return {
    created: result.created,
    ...(result.temporaryPassword
      ? { temporaryPassword: result.temporaryPassword }
      : {}),
    item: {
      id: result.link.id,
      doctorId: result.link.doctorId,
      doctorEmail,
      staffUserId: result.link.staffUserId,
      staffEmail,
      displayName: input.displayName?.trim() || null,
      role: result.link.role,
      status: result.link.status,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function setAdminClinicStaffStatus(
  id: string,
  status: 'active' | 'suspended',
  correlationId: string,
  adminActor: string
): Promise<ClinicStaffLink> {
  const link = await setClinicStaffStatusById(id, status, correlationId);
  await logAuditEvent({
    correlationId,
    userId: adminActor,
    action: 'update_clinic_staff',
    resourceType: 'clinic_staff',
    resourceId: link.id,
    status: 'success',
    metadata: { changedFields: ['status'] },
  });
  return link;
}

export async function updateAdminClinicStaffDisplayName(
  id: string,
  displayName: string | null,
  correlationId: string,
  adminActor: string
): Promise<ClinicStaffLink> {
  const link = await updateClinicStaffDisplayName(id, displayName, correlationId);
  await logAuditEvent({
    correlationId,
    userId: adminActor,
    action: 'update_clinic_staff',
    resourceType: 'clinic_staff',
    resourceId: link.id,
    status: 'success',
    metadata: { changedFields: ['display_name'] },
  });
  return link;
}

export async function deleteAdminClinicStaff(
  id: string,
  correlationId: string,
  adminActor: string
): Promise<void> {
  await deleteClinicStaffLink(id, correlationId);
  await logAuditEvent({
    correlationId,
    userId: adminActor,
    action: 'delete_clinic_staff',
    resourceType: 'clinic_staff',
    resourceId: id,
    status: 'success',
  });
}
