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
import { logDataAccess, logDataModification, logAuditEvent } from '../utils/audit-logger';

/** Summary for list endpoint (e-task-3). No PHI in logs. */
export interface PatientSummary {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medical_record_number?: string | null;
  last_appointment_date?: string | null;
  created_at: string;
}

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
 * Find patient by Medical Record Number (MRN).
 * Uses admin client (webhook/API contexts).
 *
 * @param medicalRecordNumber - Human-readable Patient ID (e.g. P-00001)
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientByMrn(
  medicalRecordNumber: string,
  correlationId: string
): Promise<Patient | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const normalized = medicalRecordNumber.trim().toUpperCase();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from('patients')
    .select('*')
    .eq('medical_record_number', normalized)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * List patients for a doctor (e-task-3).
 * Returns distinct patients linked via appointments or conversations who have a
 * medical record number (registered after first successful payment path).
 * Ordered by last appointment date desc, then created_at desc.
 *
 * @param doctorId - Doctor UUID
 * @param correlationId - Request correlation ID
 * @returns PatientSummary[]
 */
export async function listPatientsForDoctor(
  doctorId: string,
  correlationId: string
): Promise<PatientSummary[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const patientIds = new Set<string>();

  const { data: aptRows, error: aptErr } = await admin
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .not('patient_id', 'is', null);

  if (aptErr) handleSupabaseError(aptErr, correlationId);
  for (const row of aptRows ?? []) {
    const pid = (row as { patient_id: string | null }).patient_id;
    if (pid) patientIds.add(pid);
  }

  const { data: convRows, error: convErr } = await admin
    .from('conversations')
    .select('patient_id')
    .eq('doctor_id', doctorId);

  if (convErr) handleSupabaseError(convErr, correlationId);
  for (const row of convRows ?? []) {
    patientIds.add((row as { patient_id: string }).patient_id);
  }

  if (patientIds.size === 0) return [];

  const { data: patients, error: patErr } = await admin
    .from('patients')
    .select('id, name, phone, age, gender, medical_record_number, created_at')
    .in('id', Array.from(patientIds));

  if (patErr) handleSupabaseError(patErr, correlationId);

  const ids = Array.from(patientIds);
  const { data: lastAptRows, error: lastErr } = await admin
    .from('appointments')
    .select('patient_id, appointment_date')
    .eq('doctor_id', doctorId)
    .in('patient_id', ids)
    .order('appointment_date', { ascending: false });

  if (lastErr) handleSupabaseError(lastErr, correlationId);

  const lastByPatient = new Map<string, string>();
  for (const row of lastAptRows ?? []) {
    const r = row as { patient_id: string; appointment_date: string };
    if (!lastByPatient.has(r.patient_id)) {
      lastByPatient.set(r.patient_id, r.appointment_date);
    }
  }

  // Exclude merged patients (anonymized: name [Merged], phone merged-{id})
  const activePatients = (patients ?? []).filter(
    (p: { name?: string; phone?: string }) =>
      p.name !== '[Merged]' && !(p.phone ?? '').startsWith('merged-')
  );

  const registeredPatients = activePatients.filter(
    (p: { medical_record_number?: string | null }) =>
      p.medical_record_number != null && String(p.medical_record_number).trim() !== ''
  );

  const summaries: PatientSummary[] = registeredPatients.map((p) => {
    const patient = p as {
      id: string;
      name: string;
      phone: string;
      age?: number | null;
      gender?: string | null;
      medical_record_number?: string | null;
      created_at: string;
    };
    return {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      age: patient.age ?? undefined,
      gender: patient.gender ?? undefined,
      medical_record_number: patient.medical_record_number,
      last_appointment_date: lastByPatient.get(patient.id) ?? null,
      created_at:
        typeof patient.created_at === 'string'
          ? patient.created_at
          : (patient.created_at as Date).toISOString(),
    };
  });

  summaries.sort((a, b) => {
    const aDate = a.last_appointment_date ? new Date(a.last_appointment_date).getTime() : 0;
    const bDate = b.last_appointment_date ? new Date(b.last_appointment_date).getTime() : 0;
    if (bDate !== aDate) return bDate - aDate;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  await logDataAccess(correlationId, doctorId, 'patient', undefined);

  return summaries;
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
 * Create a patient for "booking for someone else" flow (e-task-1 2026-03-18).
 * Creates a standalone patient with collected details; no platform link.
 * Used when user books for mother, father, etc. — consent implied by chat.
 *
 * @param doctorId - Doctor ID (for audit context; patients table has no doctor_id)
 * @param data - Collected patient data (name, phone required; age, gender, email optional)
 * @param correlationId - Request correlation ID
 * @returns Created patient
 */
export async function createPatientForBooking(
  _doctorId: string,
  data: { name: string; phone: string; age?: number; gender?: string; email?: string },
  correlationId: string
): Promise<Patient> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const now = new Date();
  const insertData: InsertPatient = {
    name: data.name.trim(),
    phone: data.phone.trim(),
    age: data.age ?? undefined,
    gender: data.gender?.trim() || undefined,
    email: data.email?.trim() || undefined,
    platform: null,
    platform_external_id: null,
    consent_status: 'granted',
    consent_granted_at: now,
    consent_method: 'instagram_dm_booking_for_other',
  };

  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert(insertData)
    .select()
    .single();

  if (error || !patient) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(
    correlationId,
    undefined as any,
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
 * Merge source patient into target patient (e-task-6).
 * Moves all appointments and conversations from source to target, then anonymizes source.
 * Doctor must have access to both patients (via appointments or conversations).
 *
 * @param doctorId - Doctor UUID (must have access to both patients)
 * @param sourcePatientId - Patient to merge (will be anonymized)
 * @param targetPatientId - Patient to keep (receives all data)
 * @param correlationId - Request correlation ID
 * @throws ForbiddenError if doctor has no access to either patient
 * @throws NotFoundError if either patient not found
 */
export async function mergePatients(
  doctorId: string,
  sourcePatientId: string,
  targetPatientId: string,
  correlationId: string
): Promise<void> {
  if (sourcePatientId === targetPatientId) {
    throw new ForbiddenError('Source and target patient must be different');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  // Validate doctor has access to both patients
  await getPatientForDoctor(sourcePatientId, doctorId, correlationId);
  await getPatientForDoctor(targetPatientId, doctorId, correlationId);

  // Update appointments: move from source to target
  const { error: aptErr } = await admin
    .from('appointments')
    .update({ patient_id: targetPatientId })
    .eq('doctor_id', doctorId)
    .eq('patient_id', sourcePatientId);

  if (aptErr) handleSupabaseError(aptErr, correlationId);

  // Update conversations: move from source to target
  const { error: convErr } = await admin
    .from('conversations')
    .update({ patient_id: targetPatientId })
    .eq('doctor_id', doctorId)
    .eq('patient_id', sourcePatientId);

  if (convErr) handleSupabaseError(convErr, correlationId);

  // Anonymize source patient (COMPLIANCE: don't hard-delete PHI)
  const { error: anonErr } = await admin
    .from('patients')
    .update({
      name: '[Merged]',
      phone: `merged-${sourcePatientId}`,
      email: null,
      date_of_birth: null,
      age: null,
      gender: null,
      platform: null,
      platform_external_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourcePatientId);

  if (anonErr) handleSupabaseError(anonErr, correlationId);

  await logDataModification(correlationId, doctorId, 'update', 'patient', sourcePatientId, [
    'merge_anonymize',
  ]);
  await logAuditEvent({
    correlationId,
    userId: doctorId,
    action: 'merge_patients',
    resourceType: 'patient',
    resourceId: targetPatientId,
    status: 'success',
    metadata: { sourcePatientId, targetPatientId },
  });
}

/**
 * Assign MRN to a patient after their first successful payment (migration 046).
 * No-op if patient already has an MRN (returning patient).
 * Uses raw SQL nextval('patient_mrn_seq') to guarantee unique sequential IDs.
 *
 * @returns The MRN (newly assigned or pre-existing), or null if patient not found.
 */
export async function assignMrnAfterPayment(
  patientId: string,
  correlationId: string
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: patient, error: fetchErr } = await admin
    .from('patients')
    .select('id, medical_record_number')
    .eq('id', patientId)
    .single();

  if (fetchErr || !patient) return null;

  if (patient.medical_record_number) return patient.medical_record_number;

  const { data: seqRow, error: seqErr } = await admin.rpc('assign_patient_mrn', {
    p_patient_id: patientId,
  });

  if (seqErr) {
    handleSupabaseError(seqErr, correlationId);
  }

  const mrn: string | null = typeof seqRow === 'string' ? seqRow : (seqRow as any)?.mrn ?? null;

  if (mrn) {
    await logDataModification(correlationId, undefined as any, 'update', 'patient', patientId, [
      'medical_record_number',
    ]);
  }

  return mrn;
}

/**
 * Idempotent registration: assign MRN when missing (same RPC as `assignMrnAfterPayment`).
 * Call after booking completes without payment (zero-fee catalog, free-of-cost, queue with no charge)
 * or keep using `assignMrnAfterPayment` from the payment webhook for paid flows.
 */
export async function ensurePatientMrnIfEligible(
  patientId: string,
  correlationId: string
): Promise<string | null> {
  return assignMrnAfterPayment(patientId, correlationId);
}

/**
 * Find patient by platform and platform external ID (e.g. Instagram PSID).
 * Used to look up placeholder patients when processing webhooks.
 * Uses admin client to bypass RLS (webhook has no auth context; anon would see no rows).
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
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
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

  if (error) {
    const isUniqueViolation =
      error?.code === '23505' ||
      (typeof error?.message === 'string' &&
        /duplicate|unique|already exists/i.test(error.message));
    if (isUniqueViolation) {
      const delays = [200, 400, 800];
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        const existingPatient = await findPatientByPlatformExternalId(
          platform,
          platformExternalId,
          correlationId
        );
        if (existingPatient) return existingPatient;
        if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
    handleSupabaseError(error, correlationId);
  }

  if (!patient) throw new InternalError('Patient create returned no data');

  await logDataModification(
    correlationId,
    undefined as any,
    'create',
    'patient',
    patient.id
  );

  return patient as Patient;
}
