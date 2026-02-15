/**
 * Patient Service Functions
 *
 * Service functions for patient-related database operations.
 * Patients contain PHI (name, phone, date_of_birth) which is encrypted at rest.
 * Supports placeholder patients per platform user (e-task-3) via platform/platform_external_id.
 */

import { getSupabaseAdminClient, supabase } from '../config/database';
import { Patient, InsertPatient, UpdatePatient } from '../types';
import { ConflictError, ForbiddenError, InternalError, NotFoundError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';

/**
 * Find patient by ID
 *
 * @param id - Patient UUID
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientById(
  id: string,
  correlationId: string
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Get patient by ID for authenticated doctor (API dashboard).
 * Verifies doctor has access via conversation or appointment link (RLS-aligned).
 * No PHI in logs; uses logDataAccess for audit.
 *
 * @param patientId - Patient UUID
 * @param doctorId - Doctor (auth.users) UUID
 * @param correlationId - Request correlation ID
 * @returns Patient
 * @throws ForbiddenError if doctor has no link to patient
 * @throws NotFoundError if patient not found after access check
 */
export async function getPatientForDoctor(
  patientId: string,
  doctorId: string,
  correlationId: string
): Promise<Patient> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle();

  if (conv) {
    const patient = await findPatientByIdWithAdmin(patientId, correlationId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }
    await logDataAccess(correlationId, doctorId, 'patient', patientId);
    return patient;
  }

  const { data: apt } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle();

  if (apt) {
    const patient = await findPatientByIdWithAdmin(patientId, correlationId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }
    await logDataAccess(correlationId, doctorId, 'patient', patientId);
    return patient;
  }

  throw new ForbiddenError('Access denied: You do not have access to this patient');
}

/**
 * Find patient by ID using service role (webhook worker context).
 * Use when no user JWT is available (e.g. webhook processing).
 *
 * @param id - Patient UUID
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientByIdWithAdmin(
  id: string,
  correlationId: string
): Promise<Patient | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Find patient by phone number
 * 
 * Used to look up existing patients before creating new ones.
 * Phone numbers are unique identifiers for patients.
 * 
 * @param phone - Patient phone number
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 * 
 * @throws InternalError if database operation fails
 */
export async function findPatientByPhone(
  phone: string,
  correlationId: string
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error) {
    // Not found is OK (return null)
    if (error.code === 'PGRST116') {
      return null;
    }
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Create a new patient
 * 
 * Creates patient record. Used when processing webhooks from platforms.
 * 
 * @param data - Patient data to insert
 * @param correlationId - Request correlation ID
 * @returns Created patient
 * 
 * @throws ConflictError if patient with phone number already exists
 * @throws InternalError if database operation fails
 * 
 * Note: Uses service role client (webhook processing has no user context)
 */
export async function createPatient(
  data: InsertPatient,
  correlationId: string
): Promise<Patient> {
  // Check if patient already exists
  const existing = await findPatientByPhone(data.phone, correlationId);
  if (existing) {
    throw new ConflictError('Patient with this phone number already exists');
  }

  // Create patient (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert(data)
    .select()
    .single();

  if (error || !patient) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log (system operation - no user)
  await logDataModification(
    correlationId,
    undefined as any, // System operation (webhook processing)
    'create',
    'patient',
    patient.id
  );

  return patient as Patient;
}

/**
 * Update patient information
 * 
 * Updates patient record. Used when patient information changes.
 * 
 * @param id - Patient ID
 * @param data - Update data
 * @param correlationId - Request correlation ID
 * @returns Updated patient
 * 
 * @throws NotFoundError if patient not found
 * @throws InternalError if database operation fails
 * 
 * Note: Uses service role client (webhook processing has no user context)
 */
export async function updatePatient(
  id: string,
  data: UpdatePatient,
  correlationId: string
): Promise<Patient> {
  // Update patient (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: updated, error } = await supabaseAdmin
    .from('patients')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Get changed fields (field names only, not values)
  const changedFields = Object.keys(data as Record<string, unknown>).filter(
    (key) => key !== 'id'
  );

  // Audit log (system operation - no user)
  await logDataModification(
    correlationId,
    undefined as any, // System operation
    'update',
    'patient',
    id,
    changedFields
  );

  return updated as Patient;
}

/**
 * Find patient by platform and platform external ID (e.g. Instagram PSID).
 * Used to look up placeholder patients when processing webhooks.
 *
 * @param platform - Platform name (e.g. 'instagram')
 * @param platformExternalId - Platform user ID (e.g. sender PSID)
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientByPlatformExternalId(
  platform: string,
  platformExternalId: string,
  correlationId: string
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('platform', platform)
    .eq('platform_external_id', platformExternalId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Find or create a placeholder patient for a platform user (e-task-3 MVP).
 * Creates a patient with placeholder name/phone and platform identifiers when not found.
 *
 * @param doctorId - Doctor ID (for audit context; not stored on patient)
 * @param platform - Platform name (e.g. 'instagram')
 * @param platformExternalId - Platform user ID (e.g. Instagram PSID)
 * @param correlationId - Request correlation ID
 * @returns Existing or newly created patient
 */
export async function findOrCreatePlaceholderPatient(
  _doctorId: string,
  platform: string,
  platformExternalId: string,
  correlationId: string
): Promise<Patient> {
  const existing = await findPatientByPlatformExternalId(
    platform,
    platformExternalId,
    correlationId
  );
  if (existing) {
    return existing;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  // Placeholder phone is unique and never matches real patients
  const placeholderPhone = `placeholder-${platform}-${platformExternalId}`;
  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert({
      name: 'Placeholder',
      phone: placeholderPhone,
      platform,
      platform_external_id: platformExternalId,
    } as InsertPatient)
    .select()
    .single();

  if (error || !patient) {
    // Race: another webhook created the same placeholder; fetch and return it
    const isUniqueViolation =
      error?.code === '23505' ||
      (typeof error?.message === 'string' &&
        /duplicate|unique|already exists/i.test(error.message));
    if (isUniqueViolation) {
      const existing = await findPatientByPlatformExternalId(
        platform,
        platformExternalId,
        correlationId
      );
      if (existing) return existing;
    }
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(
    correlationId,
    undefined as any,
    'create',
    'patient',
    (patient as Patient).id
  );

  return patient as Patient;
}
