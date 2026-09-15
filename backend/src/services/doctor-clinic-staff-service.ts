/**
 * Doctor-facing clinic-staff directory (many logins, one active).
 * Emails are for the UI only — never log them or display_name (DL-9).
 */

import { getSupabaseAdminClient } from '../config/database';
import { logAuditEvent, logDataModification } from '../utils/audit-logger';
import { InternalError } from '../utils/errors';
import {
  deleteClinicStaffLink,
  listClinicStaffRowsForDoctor,
  setClinicStaffStatusById,
  updateClinicStaffCapabilities,
  updateClinicStaffDisplayName,
} from './clinic-staff-service';
import { provisionClinicStaff } from './clinic-staff-provision-service';
import type { ClinicStaffLink } from '../types/clinic-staff';

export type DoctorClinicStaffItem = {
  id: string;
  staffUserId: string;
  staffEmail: string | null;
  displayName: string | null;
  role: string;
  status: 'active' | 'suspended';
  capabilities: string[];
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

async function toItem(
  row: {
    id: string;
    staff_user_id: string;
    display_name: string | null;
    role: string;
    status: 'active' | 'suspended';
    capabilities?: string[] | null;
    created_at: string;
  },
  staffEmail?: string | null
): Promise<DoctorClinicStaffItem> {
  return {
    id: row.id,
    staffUserId: row.staff_user_id,
    staffEmail: staffEmail === undefined ? await authEmail(row.staff_user_id) : staffEmail,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    capabilities: row.capabilities ?? ['front_desk', 'vitals', 'history', 'internal_labs', 'papers'],
    createdAt: row.created_at,
  };
}

export async function listDoctorClinicStaff(
  doctorId: string,
  correlationId: string
): Promise<DoctorClinicStaffItem[]> {
  const rows = await listClinicStaffRowsForDoctor(doctorId, correlationId);
  const items: DoctorClinicStaffItem[] = [];
  for (const row of rows) {
    items.push(await toItem(row));
  }

  await logAuditEvent({
    correlationId,
    userId: doctorId,
    action: 'read_clinic_staff',
    resourceType: 'clinic_staff',
    status: 'success',
    metadata: { count: items.length },
  });

  return items;
}

export async function provisionDoctorClinicStaff(
  doctorId: string,
  input: { email: string; displayName?: string; capabilities?: string[] },
  correlationId: string
): Promise<{
  item: DoctorClinicStaffItem;
  created: boolean;
  temporaryPassword?: string;
}> {
  const result = await provisionClinicStaff(
    {
      email: input.email,
      doctorId,
      displayName: input.displayName,
      capabilities: input.capabilities,
    },
    correlationId
  );

  await logDataModification(
    correlationId,
    doctorId,
    'create',
    'clinic_staff',
    result.link.id,
    undefined
  );

  const staffEmail = await authEmail(result.link.staffUserId);
  return {
    created: result.created,
    ...(result.temporaryPassword
      ? { temporaryPassword: result.temporaryPassword }
      : {}),
    item: {
      id: result.link.id,
      staffUserId: result.link.staffUserId,
      staffEmail,
      displayName: input.displayName?.trim() || null,
      role: result.link.role,
      status: result.link.status,
      capabilities: result.link.capabilities,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function setDoctorClinicStaffStatus(
  doctorId: string,
  id: string,
  status: 'active' | 'suspended',
  correlationId: string
): Promise<ClinicStaffLink> {
  const link = await setClinicStaffStatusById(id, status, correlationId, {
    doctorId,
  });
  await logDataModification(
    correlationId,
    doctorId,
    'update',
    'clinic_staff',
    link.id,
    ['status']
  );
  return link;
}

export async function updateDoctorClinicStaffCapabilities(
  doctorId: string,
  id: string,
  capabilities: string[],
  correlationId: string
): Promise<ClinicStaffLink> {
  const link = await updateClinicStaffCapabilities(id, capabilities, correlationId, {
    doctorId,
  });
  await logDataModification(
    correlationId,
    doctorId,
    'update',
    'clinic_staff',
    link.id,
    ['capabilities']
  );
  return link;
}

export async function updateDoctorClinicStaffDisplayName(
  doctorId: string,
  id: string,
  displayName: string | null,
  correlationId: string
): Promise<ClinicStaffLink> {
  const link = await updateClinicStaffDisplayName(id, displayName, correlationId, {
    doctorId,
  });
  await logDataModification(
    correlationId,
    doctorId,
    'update',
    'clinic_staff',
    link.id,
    ['display_name']
  );
  return link;
}

export async function deleteDoctorClinicStaff(
  doctorId: string,
  id: string,
  correlationId: string
): Promise<void> {
  await deleteClinicStaffLink(id, correlationId, { doctorId });
  await logDataModification(correlationId, doctorId, 'delete', 'clinic_staff', id);
}
