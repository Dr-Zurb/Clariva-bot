/**
 * clinic_staff lookups and writes (receptionist-portal P1).
 *
 * Service-role only. The row is authoritative for staff access (DL-4);
 * there is no lookup cache. Never log display_name (DL-9).
 */

import {
  DEFAULT_STAFF_CAPABILITIES,
  normalizeStaffCapabilities,
  roleForCapabilities,
  seatsOverlap,
} from '../auth/staff-capabilities';
import { getSupabaseAdminClient } from '../config/database';
import type { ClinicStaffLink } from '../types/clinic-staff';
import { handleSupabaseError } from '../utils/db-helpers';
import { ConflictError, InternalError, NotFoundError } from '../utils/errors';

const LINK_COLUMNS = 'id, doctor_id, staff_user_id, role, status, capabilities';

type ClinicStaffRow = {
  id: string;
  doctor_id: string;
  staff_user_id: string;
  role: string;
  status: 'active' | 'suspended';
  capabilities?: string[] | null;
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
    capabilities: normalizeStaffCapabilities(row.capabilities ?? DEFAULT_STAFF_CAPABILITIES),
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
    .select(LINK_COLUMNS)
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

export async function listActiveStaffForDoctor(
  doctorId: string,
  correlationId: string
): Promise<ClinicStaffLink[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .select(LINK_COLUMNS)
    .eq('doctor_id', doctorId)
    .eq('status', 'active');

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return ((data ?? []) as ClinicStaffRow[]).map(toLink);
}

/** First active front_desk seat, else first active row. */
export async function findActiveStaffForDoctor(
  doctorId: string,
  correlationId: string
): Promise<ClinicStaffLink | null> {
  const rows = await listActiveStaffForDoctor(doctorId, correlationId);
  return rows.find((row) => row.capabilities.includes('front_desk')) ?? rows[0] ?? null;
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
    .select('id, doctor_id, staff_user_id, role, status, capabilities, display_name, created_at')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (data ?? []) as ClinicStaffAdminRow[];
}

async function suspendConflictingActiveStaff(
  doctorId: string,
  keepStaffUserId: string,
  incomingCapabilities: readonly string[],
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const actives = await listActiveStaffForDoctor(doctorId, correlationId);
  for (const other of actives) {
    if (other.staffUserId === keepStaffUserId) continue;
    if (!seatsOverlap(other.capabilities, incomingCapabilities)) continue;
    const { error } = await admin
      .from('clinic_staff')
      .update({ status: 'suspended' })
      .eq('id', other.id)
      .eq('status', 'active');
    if (error) {
      handleSupabaseError(error, correlationId);
    }
  }
}

export async function upsertClinicStaffLink(
  input: {
    doctorId: string;
    staffUserId: string;
    displayName?: string;
    status?: 'active' | 'suspended';
    capabilities?: string[];
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

  const capabilities = normalizeStaffCapabilities(
    input.capabilities ?? existing?.capabilities
  );

  let status = input.status;
  if (!status) {
    if (existing && existing.doctorId === input.doctorId) {
      status = existing.status;
    } else {
      const actives = await listActiveStaffForDoctor(input.doctorId, correlationId);
      const conflict = actives.some((row) => seatsOverlap(row.capabilities, capabilities));
      status = conflict ? 'suspended' : 'active';
    }
  }

  if (status === 'active') {
    await suspendConflictingActiveStaff(
      input.doctorId,
      input.staffUserId,
      capabilities,
      correlationId
    );
  }

  const payload: Record<string, unknown> = {
    doctor_id: input.doctorId,
    staff_user_id: input.staffUserId,
    role: roleForCapabilities(capabilities),
    status,
    capabilities,
  };
  if (input.displayName !== undefined) {
    payload.display_name = input.displayName;
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .upsert(payload, { onConflict: 'staff_user_id' })
    .select(LINK_COLUMNS)
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
    await suspendConflictingActiveStaff(
      existing.doctorId,
      staffUserId,
      existing.capabilities,
      correlationId
    );
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .update({ status })
    .eq('staff_user_id', staffUserId)
    .select(LINK_COLUMNS)
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
    .select('id, doctor_id, staff_user_id, role, status, capabilities, display_name, created_at')
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
    .select(LINK_COLUMNS)
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
    await suspendConflictingActiveStaff(
      row.doctor_id,
      row.staff_user_id,
      toLink(row).capabilities,
      correlationId
    );
  }

  let query = admin
    .from('clinic_staff')
    .update({ status })
    .eq('id', id);
  if (opts?.doctorId) {
    query = query.eq('doctor_id', opts.doctorId);
  }

  const { data, error } = await query
    .select(LINK_COLUMNS)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  return toLink(data as ClinicStaffRow);
}

export async function updateClinicStaffCapabilities(
  id: string,
  capabilities: string[],
  correlationId: string,
  opts?: { doctorId: string }
): Promise<ClinicStaffLink> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const next = normalizeStaffCapabilities(capabilities);
  const { data: current, error: readError } = await admin
    .from('clinic_staff')
    .select(LINK_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    handleSupabaseError(readError, correlationId);
  }

  if (!current || (opts?.doctorId && (current as ClinicStaffRow).doctor_id !== opts.doctorId)) {
    throw new NotFoundError('Staff account is not linked to a practice');
  }

  const row = current as ClinicStaffRow;
  if (row.status === 'active') {
    await suspendConflictingActiveStaff(row.doctor_id, row.staff_user_id, next, correlationId);
  }

  let query = admin
    .from('clinic_staff')
    .update({ capabilities: next, role: roleForCapabilities(next) })
    .eq('id', id);
  if (opts?.doctorId) {
    query = query.eq('doctor_id', opts.doctorId);
  }

  const { data, error } = await query.select(LINK_COLUMNS).maybeSingle();
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
    .select(LINK_COLUMNS)
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
    .select(LINK_COLUMNS)
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
