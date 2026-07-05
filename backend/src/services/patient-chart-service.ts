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
  ConditionMedicationLink,
  ConditionWithMedications,
  CreatePatientAllergyInput,
  CreatePatientChronicConditionInput,
  CreatePatientMedicationInput,
  CreatePatientVitalsInput,
  LinkConditionMedicationInput,
  MedicalBackgroundGrouped,
  PatientAllergy,
  PatientChronicCondition,
  PatientMedication,
  PatientVitalsReading,
  ProblemListItem,
  ResultsTimelineEntry,
  UpdateMedicalBackgroundNotesInput,
  UpdatePatientAllergyInput,
  UpdatePatientChronicConditionInput,
  UpdatePatientMedicationInput,
  UpdatePatientVitalsInput,
} from '../types/patient-chart';
import type { TestResultRow } from '../types/prescription';

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
  table: 'patient_allergies' | 'patient_chronic_conditions' | 'patient_medications' | 'patient_vitals',
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
    status: input.status ?? 'active',
    diagnosed_on: input.diagnosedOn ?? null,
    diagnosed_ago_value: input.diagnosedAgoValue ?? null,
    diagnosed_ago_unit: input.diagnosedAgoUnit ?? null,
    resolved_ago_value: input.resolvedAgoValue ?? null,
    resolved_ago_unit: input.resolvedAgoUnit ?? null,
    on_treatment: input.onTreatment ?? null,
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
  if (input.status !== undefined) update.status = input.status;
  if (input.diagnosedOn !== undefined) update.diagnosed_on = input.diagnosedOn;
  if (input.diagnosedAgoValue !== undefined) update.diagnosed_ago_value = input.diagnosedAgoValue;
  if (input.diagnosedAgoUnit !== undefined) update.diagnosed_ago_unit = input.diagnosedAgoUnit;
  if (input.resolvedAgoValue !== undefined) update.resolved_ago_value = input.resolvedAgoValue;
  if (input.resolvedAgoUnit !== undefined) update.resolved_ago_unit = input.resolvedAgoUnit;
  if (input.onTreatment !== undefined) update.on_treatment = input.onTreatment;
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
// Medications
// ============================================================================

export async function listMedications(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<PatientMedication[]> {
  const { data, error } = await admin()
    .from('patient_medications')
    .select('*')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error, correlationId);
  await logDataAccess(correlationId, userId, 'patient_medications', patientId);
  return (data ?? []) as PatientMedication[];
}

export async function createMedication(
  patientId: string,
  input: CreatePatientMedicationInput,
  correlationId: string,
  userId: string
): Promise<PatientMedication> {
  const insert = {
    doctor_id: userId,
    patient_id: patientId,
    drug_name: input.drugName,
    dose: input.dose ?? input.strength ?? null,
    frequency: input.frequency ?? null,
    status: input.status ?? 'active',
    intake_pattern: input.intakePattern ?? null,
    source: input.source ?? null,
    started_on: input.startedOn ?? null,
    stopped_on: input.stoppedOn ?? null,
    note: input.note ?? null,
    strength: input.strength ?? input.dose ?? null,
    dose_qty: input.doseQty ?? null,
    dose_unit: input.doseUnit ?? null,
    frequency_code: input.frequencyCode ?? null,
    form: input.form ?? null,
    drug_master_id: input.drugMasterId ?? null,
    stopped_ago_value: input.stoppedAgoValue ?? null,
    stopped_ago_unit: input.stoppedAgoUnit ?? null,
    started_ago_value: input.startedAgoValue ?? null,
    started_ago_unit: input.startedAgoUnit ?? null,
    stop_reason: input.stopReason ?? null,
    dose_schedule: input.doseSchedule ?? null,
    strength_value: input.strengthValue ?? null,
    strength_unit: input.strengthUnit ?? null,
    strength_components: input.strengthComponents ?? null,
    food_timing: input.foodTiming ?? null,
  };

  const { data, error } = await admin()
    .from('patient_medications')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientMedication;
  await logDataModification(correlationId, userId, 'create', 'patient_medications', row.id);

  if (input.conditionIds && input.conditionIds.length > 0) {
    await linkMedicationsToConditions(
      patientId,
      row.id,
      input.conditionIds,
      correlationId,
      userId
    );
  }

  return row;
}

export async function updateMedication(
  patientId: string,
  id: string,
  input: UpdatePatientMedicationInput,
  correlationId: string,
  userId: string
): Promise<PatientMedication> {
  await verifyOwnership('patient_medications', id, patientId, userId);

  const update: Record<string, unknown> = {};
  if (input.drugName !== undefined) update.drug_name = input.drugName;
  if (input.dose !== undefined) update.dose = input.dose;
  if (input.frequency !== undefined) update.frequency = input.frequency;
  if (input.status !== undefined) update.status = input.status;
  if (input.intakePattern !== undefined) update.intake_pattern = input.intakePattern;
  if (input.source !== undefined) update.source = input.source;
  if (input.startedOn !== undefined) update.started_on = input.startedOn;
  if (input.stoppedOn !== undefined) update.stopped_on = input.stoppedOn;
  if (input.note !== undefined) update.note = input.note;
  if (input.strength !== undefined) {
    update.strength = input.strength;
    if (input.dose === undefined) update.dose = input.strength;
  }
  if (input.doseQty !== undefined) update.dose_qty = input.doseQty;
  if (input.doseUnit !== undefined) update.dose_unit = input.doseUnit;
  if (input.frequencyCode !== undefined) update.frequency_code = input.frequencyCode;
  if (input.form !== undefined) update.form = input.form;
  if (input.drugMasterId !== undefined) update.drug_master_id = input.drugMasterId;
  if (input.stoppedAgoValue !== undefined) update.stopped_ago_value = input.stoppedAgoValue;
  if (input.stoppedAgoUnit !== undefined) update.stopped_ago_unit = input.stoppedAgoUnit;
  if (input.startedAgoValue !== undefined) update.started_ago_value = input.startedAgoValue;
  if (input.startedAgoUnit !== undefined) update.started_ago_unit = input.startedAgoUnit;
  if (input.stopReason !== undefined) update.stop_reason = input.stopReason;
  if (input.doseSchedule !== undefined) update.dose_schedule = input.doseSchedule;
  if (input.strengthValue !== undefined) update.strength_value = input.strengthValue;
  if (input.strengthUnit !== undefined) update.strength_unit = input.strengthUnit;
  if (input.strengthComponents !== undefined) update.strength_components = input.strengthComponents;
  if (input.foodTiming !== undefined) update.food_timing = input.foodTiming;
  const archivedAt = resolveArchivedAt(input.archivedAt);
  if (archivedAt !== undefined) update.archived_at = archivedAt;

  if (Object.keys(update).length === 0) {
    throw new ForbiddenError('No updatable fields supplied');
  }

  const { data, error } = await admin()
    .from('patient_medications')
    .update(update)
    .eq('id', id)
    .eq('doctor_id', userId)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientMedication;
  await logDataModification(correlationId, userId, 'update', 'patient_medications', row.id);
  return row;
}

// ============================================================================
// Condition ↔ medication links (Phase B)
// ============================================================================

function sortByActiveFirst<T extends { status: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const rank = (s: string) => (s === 'active' ? 0 : 1);
    return rank(a.status) - rank(b.status);
  });
}

export function groupMedicalBackground(
  conditions: PatientChronicCondition[],
  medications: PatientMedication[],
  links: ConditionMedicationLink[]
): Omit<MedicalBackgroundGrouped, 'notes'> {
  const medById = new Map(medications.map((m) => [m.id, m]));
  const medIdsByCondition = new Map<string, string[]>();
  const linkedMedIds = new Set<string>();

  for (const link of links) {
    linkedMedIds.add(link.medication_id);
    const existing = medIdsByCondition.get(link.condition_id) ?? [];
    existing.push(link.medication_id);
    medIdsByCondition.set(link.condition_id, existing);
  }

  const conditionsWithMeds: ConditionWithMedications[] = sortByActiveFirst(conditions).map(
    (condition) => ({
      ...condition,
      medications: (medIdsByCondition.get(condition.id) ?? [])
        .map((id) => medById.get(id))
        .filter((m): m is PatientMedication => m != null),
    })
  );

  const unlinkedMedications = sortByActiveFirst(
    medications.filter((m) => !linkedMedIds.has(m.id))
  );

  return { conditions: conditionsWithMeds, unlinkedMedications, links };
}

async function getMedicalBackgroundNotesRow(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin()
    .from('patient_medical_background_notes')
    .select('notes')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  return (data?.notes as string | null | undefined) ?? null;
}

export async function upsertMedicalBackgroundNotes(
  patientId: string,
  input: UpdateMedicalBackgroundNotesInput,
  correlationId: string,
  userId: string
): Promise<string | null> {
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  const { data: existing, error: existingError } = await admin()
    .from('patient_medical_background_notes')
    .select('doctor_id')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (existingError) handleSupabaseError(existingError, correlationId);

  if (existing) {
    const { data, error } = await admin()
      .from('patient_medical_background_notes')
      .update({ notes })
      .eq('doctor_id', userId)
      .eq('patient_id', patientId)
      .select('notes')
      .single();

    if (error || !data) handleSupabaseError(error, correlationId);
    await logDataModification(
      correlationId,
      userId,
      'update',
      'patient_medical_background_notes',
      patientId,
    );
    return (data.notes as string | null) ?? null;
  }

  const { data, error } = await admin()
    .from('patient_medical_background_notes')
    .insert({ doctor_id: userId, patient_id: patientId, notes })
    .select('notes')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  await logDataModification(
    correlationId,
    userId,
    'create',
    'patient_medical_background_notes',
    patientId,
  );
  return (data.notes as string | null) ?? null;
}

async function linkMedicationsToConditions(
  patientId: string,
  medicationId: string,
  conditionIds: string[],
  correlationId: string,
  userId: string
): Promise<void> {
  const uniqueIds = [...new Set(conditionIds)];
  for (const conditionId of uniqueIds) {
    await linkConditionMedication(
      patientId,
      { conditionId, medicationId },
      correlationId,
      userId
    );
  }
}

export async function listConditionMedicationLinks(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<ConditionMedicationLink[]> {
  const { data, error } = await admin()
    .from('condition_medications')
    .select('*')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId);

  if (error) handleSupabaseError(error, correlationId);
  await logDataAccess(correlationId, userId, 'condition_medications', patientId);
  return (data ?? []) as ConditionMedicationLink[];
}

export async function getMedicalBackground(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<MedicalBackgroundGrouped> {
  const [conditions, medications, links, notes] = await Promise.all([
    listChronicConditions(patientId, correlationId, userId),
    listMedications(patientId, correlationId, userId),
    listConditionMedicationLinks(patientId, correlationId, userId),
    getMedicalBackgroundNotesRow(patientId, correlationId, userId),
  ]);
  return { ...groupMedicalBackground(conditions, medications, links), notes };
}

export async function linkConditionMedication(
  patientId: string,
  input: LinkConditionMedicationInput,
  correlationId: string,
  userId: string
): Promise<ConditionMedicationLink> {
  await verifyOwnership('patient_chronic_conditions', input.conditionId, patientId, userId);
  await verifyOwnership('patient_medications', input.medicationId, patientId, userId);

  const { data: existing, error: existingError } = await admin()
    .from('condition_medications')
    .select('*')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .eq('condition_id', input.conditionId)
    .eq('medication_id', input.medicationId)
    .maybeSingle();

  if (existingError) handleSupabaseError(existingError, correlationId);
  if (existing) return existing as ConditionMedicationLink;

  const insert = {
    doctor_id: userId,
    patient_id: patientId,
    condition_id: input.conditionId,
    medication_id: input.medicationId,
  };

  const { data, error } = await admin()
    .from('condition_medications')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as ConditionMedicationLink;
  await logDataModification(correlationId, userId, 'create', 'condition_medications', row.id);
  return row;
}

export async function unlinkConditionMedication(
  patientId: string,
  linkId: string,
  correlationId: string,
  userId: string
): Promise<void> {
  const { data, error } = await admin()
    .from('condition_medications')
    .select('id, doctor_id, patient_id')
    .eq('id', linkId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data || data.doctor_id !== userId || data.patient_id !== patientId) {
    throw new NotFoundError('Resource not found');
  }

  const { error: deleteError } = await admin()
    .from('condition_medications')
    .delete()
    .eq('id', linkId)
    .eq('doctor_id', userId);

  if (deleteError) handleSupabaseError(deleteError, correlationId);
  await logDataModification(correlationId, userId, 'delete', 'condition_medications', linkId);
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

// ============================================================================
// Investigations & results timeline (soap-data-placement P3 / sdp-05)
// ============================================================================

/**
 * An objective report-scan attachment lives under the `objective/` path
 * segment of the prescription folder (obj-22). The per-visit media count is a
 * coarse indicator (P3-D5) — we match on the segment, not a per-result link.
 */
function isObjectiveAttachment(filePath: string | null | undefined): boolean {
  return typeof filePath === 'string' && filePath.includes('/objective/');
}

/**
 * Project the patient's prescriptions into a date-desc investigations & results
 * timeline (P3-D2): per visit, the ordered investigations
 * (`investigations_orders`) + resulted rows (`test_results_json`) + a per-visit
 * count of objective report-scan attachments.
 *
 * Read-only, no view/migration (P3-D1). Doctor-scoped via the same admin-client
 * + WHERE `doctor_id = userId` path as the other chart reads. Visits with no
 * investigations/results activity (no ordered, no resulted, no media) are
 * omitted — the timeline only surfaces investigation-bearing visits.
 *
 * PHI-safe (P3-D3): `logDataAccess` records the patient id only; investigation
 * and result values are never logged.
 */
export async function getResultsTimeline(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<ResultsTimelineEntry[]> {
  const { data, error } = await admin()
    .from('prescriptions')
    .select('id, appointment_id, created_at, investigations_orders, test_results_json')
    .eq('doctor_id', userId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error, correlationId);

  type PrescriptionRow = {
    id: string;
    appointment_id: string;
    created_at: string;
    investigations_orders: string | null;
    test_results_json: TestResultRow[] | null;
  };
  const rows = (data ?? []) as PrescriptionRow[];

  // Per-visit objective media counts in a single round-trip across all the
  // patient's prescriptions; we count the `objective/` segment in TS.
  const mediaCountByPrescription = new Map<string, number>();
  const prescriptionIds = rows.map((row) => row.id);
  if (prescriptionIds.length > 0) {
    const { data: attachments, error: attachmentError } = await admin()
      .from('prescription_attachments')
      .select('prescription_id, file_path')
      .in('prescription_id', prescriptionIds);

    if (attachmentError) handleSupabaseError(attachmentError, correlationId);

    for (const attachment of (attachments ?? []) as Array<{
      prescription_id: string;
      file_path: string | null;
    }>) {
      if (isObjectiveAttachment(attachment.file_path)) {
        mediaCountByPrescription.set(
          attachment.prescription_id,
          (mediaCountByPrescription.get(attachment.prescription_id) ?? 0) + 1
        );
      }
    }
  }

  const timeline: ResultsTimelineEntry[] = [];
  for (const row of rows) {
    const ordered = row.investigations_orders?.trim() ? row.investigations_orders : null;
    const resulted = Array.isArray(row.test_results_json) ? row.test_results_json : [];
    const mediaCount = mediaCountByPrescription.get(row.id) ?? 0;

    // Only surface visits that carry investigations/results activity.
    if (ordered === null && resulted.length === 0 && mediaCount === 0) {
      continue;
    }

    timeline.push({
      prescriptionId: row.id,
      appointmentId: row.appointment_id,
      visitDate: row.created_at,
      ordered,
      resulted,
      mediaCount,
    });
  }

  await logDataAccess(correlationId, userId, 'prescription', patientId);
  return timeline;
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
