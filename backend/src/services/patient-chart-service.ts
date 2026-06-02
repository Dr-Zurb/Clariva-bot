/**
 * Patient Chart Service (EHR Sub-batch A / T1.2)
 *
 * CRUD for patient_allergies, patient_chronic_conditions, patient_vitals.
 * Backs the <PatientChartPanel> surface introduced in EHR Sub-batch A.
 *
 * Auth model
 * ----------
 * Uses the admin (service-role) client and TS-enforces `doctor_id = userId`
 * on every read / write. This matches the codebase convention established by
 * `prescription-service.ts`, `consultation-quick-actions-service.ts`, and
 * `consultation-auto-fallback-service.ts`. The migration 087 RLS policies
 * (auth.uid() = doctor_id) remain as defense-in-depth for any future
 * user-JWT consumer.
 *
 * The source plan T1.2 sketch suggested a per-request user-scoped client; we
 * intentionally diverge to align with the rest of the codebase. Behaviour is
 * equivalent — ownership is enforced; only the enforcement layer differs.
 *
 * PHI: allergens, chronic conditions, vitals readings. No PHI in logs.
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { ForbiddenError, InternalError, NotFoundError } from '../utils/errors';
import type {
  CreatePatientAllergyInput,
  CreatePatientChronicConditionInput,
  CreatePatientVitalsInput,
  PatientAllergy,
  PatientChronicCondition,
  PatientVitalsReading,
  ProblemListItem,
  UpdatePatientAllergyInput,
  UpdatePatientChronicConditionInput,
  UpdatePatientVitalsInput,
} from '../types/patient-chart';

// ============================================================================
// Internal helpers
// ============================================================================

function admin() {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new InternalError('Service role client not available');
  }
  return client;
}

/**
 * Resolve `archivedAt` semantics from the input.
 * - `'now'` (sentinel) → ISO timestamp at call time
 * - ISO string → passed through
 * - `null` → un-archive (revive the row)
 * - undefined → no change
 */
function resolveArchivedAt(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === 'now') return new Date().toISOString();
  return value;
}

/**
 * Verify the row identified by `id` exists AND belongs to the user before
 * any UPDATE / DELETE. Returns the row's primary key on success; raises
 * NotFoundError on miss (no leakage between miss vs. forbidden).
 */
async function verifyOwnership(
  table: 'patient_allergies' | 'patient_chronic_conditions' | 'patient_vitals',
  id: string,
  patientId: string,
  userId: string
): Promise<void> {
  const { data, error } = await admin()
    .from(table)
    .select('id, doctor_id, patient_id')
    .eq('id', id)
    .maybeSingle();

  if (error) handleSupabaseError(error, 'verifyOwnership');
  if (!data) throw new NotFoundError('Resource not found');
  if (data.doctor_id !== userId || data.patient_id !== patientId) {
    // Same response as not-found to avoid information leakage.
    throw new NotFoundError('Resource not found');
  }
}

// ============================================================================
// Allergies
// ============================================================================

export async function listAllergies(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<PatientAllergy[]> {
  const { data, error } = await admin()
    .from('patient_allergies')
    .select('*')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error, correlationId);
  await logDataAccess(correlationId, userId, 'patient_allergies', patientId);
  return (data ?? []) as PatientAllergy[];
}

export async function createAllergy(
  patientId: string,
  input: CreatePatientAllergyInput,
  correlationId: string,
  userId: string
): Promise<PatientAllergy> {
  const insert = {
    doctor_id: userId,
    patient_id: patientId,
    allergen: input.allergen,
    severity: input.severity ?? 'unknown',
    reaction: input.reaction ?? null,
    note: input.note ?? null,
  };

  const { data, error } = await admin()
    .from('patient_allergies')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientAllergy;
  await logDataModification(correlationId, userId, 'create', 'patient_allergies', row.id);
  return row;
}

export async function updateAllergy(
  patientId: string,
  id: string,
  input: UpdatePatientAllergyInput,
  correlationId: string,
  userId: string
): Promise<PatientAllergy> {
  await verifyOwnership('patient_allergies', id, patientId, userId);

  const update: Record<string, unknown> = {};
  if (input.allergen !== undefined) update.allergen = input.allergen;
  if (input.severity !== undefined) update.severity = input.severity;
  if (input.reaction !== undefined) update.reaction = input.reaction;
  if (input.note !== undefined) update.note = input.note;
  const archivedAt = resolveArchivedAt(input.archivedAt);
  if (archivedAt !== undefined) update.archived_at = archivedAt;

  if (Object.keys(update).length === 0) {
    throw new ForbiddenError('No updatable fields supplied');
  }

  const { data, error } = await admin()
    .from('patient_allergies')
    .update(update)
    .eq('id', id)
    .eq('doctor_id', userId)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientAllergy;
  await logDataModification(correlationId, userId, 'update', 'patient_allergies', row.id);
  return row;
}

// ============================================================================
// Chronic conditions
// ============================================================================

export async function listChronicConditions(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<PatientChronicCondition[]> {
  const { data, error } = await admin()
    .from('patient_chronic_conditions')
    .select('*')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error, correlationId);
  await logDataAccess(correlationId, userId, 'patient_chronic_conditions', patientId);
  return (data ?? []) as PatientChronicCondition[];
}

export async function createChronicCondition(
  patientId: string,
  input: CreatePatientChronicConditionInput,
  correlationId: string,
  userId: string
): Promise<PatientChronicCondition> {
  const insert = {
    doctor_id: userId,
    patient_id: patientId,
    condition: input.condition,
    diagnosed_on: input.diagnosedOn ?? null,
    note: input.note ?? null,
  };

  const { data, error } = await admin()
    .from('patient_chronic_conditions')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientChronicCondition;
  await logDataModification(correlationId, userId, 'create', 'patient_chronic_conditions', row.id);
  return row;
}

export async function updateChronicCondition(
  patientId: string,
  id: string,
  input: UpdatePatientChronicConditionInput,
  correlationId: string,
  userId: string
): Promise<PatientChronicCondition> {
  await verifyOwnership('patient_chronic_conditions', id, patientId, userId);

  const update: Record<string, unknown> = {};
  if (input.condition !== undefined) update.condition = input.condition;
  if (input.diagnosedOn !== undefined) update.diagnosed_on = input.diagnosedOn;
  if (input.note !== undefined) update.note = input.note;
  const archivedAt = resolveArchivedAt(input.archivedAt);
  if (archivedAt !== undefined) update.archived_at = archivedAt;

  if (Object.keys(update).length === 0) {
    throw new ForbiddenError('No updatable fields supplied');
  }

  const { data, error } = await admin()
    .from('patient_chronic_conditions')
    .update(update)
    .eq('id', id)
    .eq('doctor_id', userId)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientChronicCondition;
  await logDataModification(correlationId, userId, 'update', 'patient_chronic_conditions', row.id);
  return row;
}

// ============================================================================
// Vitals (history; one row per reading)
// ============================================================================

export async function listVitals(
  patientId: string,
  correlationId: string,
  userId: string,
  limit?: number
): Promise<PatientVitalsReading[]> {
  let query = admin()
    .from('patient_vitals')
    .select('*')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .is('archived_at', null)
    .order('recorded_at', { ascending: false });

  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) handleSupabaseError(error, correlationId);
  await logDataAccess(correlationId, userId, 'patient_vitals', patientId);
  return (data ?? []) as PatientVitalsReading[];
}

export async function createVitals(
  patientId: string,
  input: CreatePatientVitalsInput,
  correlationId: string,
  userId: string
): Promise<PatientVitalsReading> {
  const insert: Record<string, unknown> = {
    doctor_id: userId,
    patient_id: patientId,
    appointment_id: input.appointmentId ?? null,
    bp_systolic: input.bpSystolic ?? null,
    bp_diastolic: input.bpDiastolic ?? null,
    heart_rate: input.heartRate ?? null,
    temperature_c: input.temperatureC ?? null,
    spo2: input.spo2 ?? null,
    weight_kg: input.weightKg ?? null,
    height_cm: input.heightCm ?? null,
    note: input.note ?? null,
  };

  // BMI: only set if caller passed it explicitly. Otherwise the DB trigger
  // (patient_vitals_bmi_autocompute) derives it from weight + height.
  if (input.bmi !== undefined && input.bmi !== null) {
    insert.bmi = input.bmi;
  }

  if (input.recordedAt) {
    insert.recorded_at = input.recordedAt;
  }

  const { data, error } = await admin()
    .from('patient_vitals')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientVitalsReading;
  await logDataModification(correlationId, userId, 'create', 'patient_vitals', row.id);
  return row;
}

// ============================================================================
// Problem list (T5.25 — patient_problem_list_v)
// ============================================================================

/**
 * Read the unified problem list for a patient from `patient_problem_list_v`.
 *
 * RLS on the view is inherited from the base tables (patient_chronic_conditions,
 * care_episodes, prescriptions). The admin client enforces doctor_id ownership
 * via the WHERE clause, matching the codebase pattern; the view's RLS adds a
 * defence-in-depth layer for any future user-JWT consumer.
 *
 * Rows are sorted by sort_key DESC (most recent first within each source).
 */
export async function getProblemList(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<ProblemListItem[]> {
  const { data, error } = await admin()
    .from('patient_problem_list_v')
    .select('source,doctor_id,patient_id,label,since_date,occurrence_count,episode_status,followups_used,max_followups,sort_key')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .order('sort_key', { ascending: false });

  if (error) handleSupabaseError(error, correlationId);
  await logDataAccess(correlationId, userId, 'patient_problem_list_v', patientId);
  return (data ?? []) as unknown as ProblemListItem[];
}

export async function updateVitals(
  patientId: string,
  id: string,
  input: UpdatePatientVitalsInput,
  correlationId: string,
  userId: string
): Promise<PatientVitalsReading> {
  await verifyOwnership('patient_vitals', id, patientId, userId);

  const update: Record<string, unknown> = {};
  if (input.appointmentId !== undefined) update.appointment_id = input.appointmentId;
  if (input.bpSystolic !== undefined) update.bp_systolic = input.bpSystolic;
  if (input.bpDiastolic !== undefined) update.bp_diastolic = input.bpDiastolic;
  if (input.heartRate !== undefined) update.heart_rate = input.heartRate;
  if (input.temperatureC !== undefined) update.temperature_c = input.temperatureC;
  if (input.spo2 !== undefined) update.spo2 = input.spo2;
  if (input.weightKg !== undefined) update.weight_kg = input.weightKg;
  if (input.heightCm !== undefined) update.height_cm = input.heightCm;
  if (input.bmi !== undefined) update.bmi = input.bmi;
  if (input.note !== undefined) update.note = input.note;
  if (input.recordedAt !== undefined) update.recorded_at = input.recordedAt;
  const archivedAt = resolveArchivedAt(input.archivedAt);
  if (archivedAt !== undefined) update.archived_at = archivedAt;

  if (Object.keys(update).length === 0) {
    throw new ForbiddenError('No updatable fields supplied');
  }

  const { data, error } = await admin()
    .from('patient_vitals')
    .update(update)
    .eq('id', id)
    .eq('doctor_id', userId)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientVitalsReading;
  await logDataModification(correlationId, userId, 'update', 'patient_vitals', row.id);
  return row;
}
