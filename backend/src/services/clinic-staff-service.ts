/**
 * clinic_staff lookups and writes (receptionist-portal P1).
 *
 * Service-role only. The row is authoritative for staff access (DL-4);
 * there is no lookup cache. Never log display_name (DL-9).
 */

import { getSupabaseAdminClient } from '../config/database';
import type { ClinicStaffLink } from '../types/clinic-staff';
import { handleSupabaseError } from '../utils/db-helpers';
import { ConflictError, InternalError, NotFoundError } from '../utils/errors';

type ClinicStaffRow = {
  id: string;
  doctor_id: string;
  staff_user_id: string;
  role: string;
  status: 'active' | 'suspended';
};

export type ClinicStaffAdminRow = ClinicStaffRow & {
  display_name: string | null;
  created_at: string;
};

function toLink(row: ClinicStaffRow): ClinicStaffLink {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    staffUserId: row.staff_user_id,
    role: row.role,
    status: row.status,
  };
}

/**
 * Fetch the staff link regardless of status.
 * Distinguishing missing vs suspended is the middleware's job.
 */
export async function findStaffLink(
  staffUserId: string,
  correlationId: string
): Promise<ClinicStaffLink | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .select('id, doctor_id, staff_user_id, role, status')
    .eq('staff_user_id', staffUserId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    return null;
  }

  return toLink(data as ClinicStaffRow);
}

export async function findActiveStaffForDoctor(
  doctorId: string,
  correlationId: string
): Promise<ClinicStaffLink | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .select('id, doctor_id, staff_user_id, role, status')
    .eq('doctor_id', doctorId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    return null;
  }

  return toLink(data as ClinicStaffRow);
}

export async function listClinicStaffRowsForDoctor(
  doctorId: string,
  correlationId: string
): Promise<ClinicStaffAdminRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .select('id, doctor_id, staff_user_id, role, status, display_name, created_at')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (data ?? []) as ClinicStaffAdminRow[];
}

async function suspendOtherActiveStaff(
  doctorId: string,
  keepStaffUserId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const active = await findActiveStaffForDoctor(doctorId, correlationId);
  if (!active || active.staffUserId === keepStaffUserId) {
    return;
  }

  const { error } = await admin
    .from('clinic_staff')
    .update({ status: 'suspended' })
    .eq('id', active.id)
    .eq('status', 'active');

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

export async function upsertClinicStaffLink(
  input: {
    doctorId: string;
    staffUserId: string;
    displayName?: string;
    status?: 'active' | 'suspended';
  },
  correlationId: string
): Promise<ClinicStaffLink> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const existing = await findStaffLink(input.staffUserId, correlationId);
  if (existing && existing.doctorId !== input.doctorId) {
    throw new ConflictError('Staff account is already linked to another practice');
  }

  let status = input.status;
  if (!status) {
    if (existing && existing.doctorId === input.doctorId) {
      status = existing.status;
    } else {
      const active = await findActiveStaffForDoctor(input.doctorId, correlationId);
      status = active ? 'suspended' : 'active';
    }
  }

  if (status === 'active') {
    await suspendOtherActiveStaff(input.doctorId, input.staffUserId, correlationId);
  }

  const payload: Record<string, unknown> = {
    doctor_id: input.doctorId,
    staff_user_id: input.staffUserId,
    role: 'receptionist',
    status,
  };
  if (input.displayName !== undefined) {
    payload.display_name = input.displayName;
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .upsert(payload, { onConflict: 'staff_user_id' })
    .select('id, doctor_id, staff_user_id, role, status')
    .single();

  if (error || !data) {
    handleSupabaseError(error, correlationId);
  }

  return toLink(data as ClinicStaffRow);
}

export async function setClinicStaffStatus(
  staffUserId: string,
  status: 'active' | 'suspended',
  correlationId: string
): Promise<ClinicStaffLink> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  if (status === 'active') {
    const existing = await findStaffLink(staffUserId, correlationId);
    if (!existing) {
      throw new NotFoundError('Staff account is not linked to a practice');
    }
    await suspendOtherActiveStaff(existing.doctorId, staffUserId, correlationId);
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .update({ status })
    .eq('staff_user_id', staffUserId)
    .select('id, doctor_id, staff_user_id, role, status')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  return toLink(data as ClinicStaffRow);
}

/** Admin directory — includes display_name for the console only. Never log it. */
export async function listClinicStaffRows(
  correlationId: string
): Promise<ClinicStaffAdminRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .select('id, doctor_id, staff_user_id, role, status, display_name, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (data ?? []) as ClinicStaffAdminRow[];
}

export async function setClinicStaffStatusById(
  id: string,
  status: 'active' | 'suspended',
  correlationId: string,
  opts?: { doctorId: string }
): Promise<ClinicStaffLink> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: current, error: readError } = await admin
    .from('clinic_staff')
    .select('id, doctor_id, staff_user_id, role, status')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    handleSupabaseError(readError, correlationId);
  }

  if (!current || (opts?.doctorId && (current as ClinicStaffRow).doctor_id !== opts.doctorId)) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  const row = current as ClinicStaffRow;
  if (status === 'active') {
    await suspendOtherActiveStaff(row.doctor_id, row.staff_user_id, correlationId);
  }

  let query = admin
    .from('clinic_staff')
    .update({ status })
    .eq('id', id);
  if (opts?.doctorId) {
    query = query.eq('doctor_id', opts.doctorId);
  }

  const { data, error } = await query
    .select('id, doctor_id, staff_user_id, role, status')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  return toLink(data as ClinicStaffRow);
}

export async function updateClinicStaffDisplayName(
  id: string,
  displayName: string | null,
  correlationId: string,
  opts?: { doctorId: string }
): Promise<ClinicStaffLink> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: current, error: readError } = await admin
    .from('clinic_staff')
    .select('id, doctor_id, staff_user_id, role, status')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    handleSupabaseError(readError, correlationId);
  }

  if (!current || (opts?.doctorId && (current as ClinicStaffRow).doctor_id !== opts.doctorId)) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  let query = admin
    .from('clinic_staff')
    .update({ display_name: displayName })
    .eq('id', id);
  if (opts?.doctorId) {
    query = query.eq('doctor_id', opts.doctorId);
  }

  const { data, error } = await query
    .select('id, doctor_id, staff_user_id, role, status')
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  return toLink(data as ClinicStaffRow);
}

export async function deleteClinicStaffLink(
  id: string,
  correlationId: string,
  opts?: { doctorId: string }
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: current, error: readError } = await admin
    .from('clinic_staff')
    .select('id, doctor_id')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    handleSupabaseError(readError, correlationId);
  }

  if (
    !current ||
    (opts?.doctorId && (current as { doctor_id: string }).doctor_id !== opts.doctorId)
  ) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  let del = admin.from('clinic_staff').delete().eq('id', id);
  if (opts?.doctorId) {
    del = del.eq('doctor_id', opts.doctorId);
  }

  const { error } = await del;
  if (error) {
    handleSupabaseError(error, correlationId);
  }
}
