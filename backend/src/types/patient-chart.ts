/**
 * Patient Chart Types (EHR Sub-batch A / T1.2)
 *
 * Types for patient_allergies, patient_chronic_conditions, patient_vitals.
 * PHI: allergens, conditions, vitals readings. Doctor-only access.
 *
 * All three entities share the patient-chart pattern:
 *   - patient-level (NOT visit-level) data
 *   - doctor-scoped (each doctor has their own row for the same patient)
 *   - soft-deletable via archived_at (the standard list query filters
 *     WHERE archived_at IS NULL)
 *
 * The DB representation uses snake_case columns (mirrors migration 087);
 * the API surface uses camelCase (mirrors prescription types).
 */

// ============================================================================
// DB row shapes (snake_case — mirrors migration 087)
// ============================================================================

export type PatientAllergySeverity = 'mild' | 'moderate' | 'severe' | 'unknown';

export interface PatientAllergy {
  id: string;
  doctor_id: string;
  patient_id: string;
  allergen: string;
  severity: PatientAllergySeverity;
  reaction: string | null;
  note: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientChronicCondition {
  id: string;
  doctor_id: string;
  patient_id: string;
  condition: string;
  diagnosed_on: string | null;
  note: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientVitalsReading {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  temperature_c: number | null;
  spo2: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  note: string | null;
  recorded_at: string;
  archived_at: string | null;
  created_at: string;
}

// ============================================================================
// Create / update inputs (camelCase — accepted by the API)
// ============================================================================

export interface CreatePatientAllergyInput {
  allergen: string;
  severity?: PatientAllergySeverity;
  reaction?: string | null;
  note?: string | null;
}

export interface UpdatePatientAllergyInput {
  allergen?: string;
  severity?: PatientAllergySeverity;
  reaction?: string | null;
  note?: string | null;
  archivedAt?: string | null;
}

export interface CreatePatientChronicConditionInput {
  condition: string;
  diagnosedOn?: string | null;
  note?: string | null;
}

export interface UpdatePatientChronicConditionInput {
  condition?: string;
  diagnosedOn?: string | null;
  note?: string | null;
  archivedAt?: string | null;
}

export interface CreatePatientVitalsInput {
  appointmentId?: string | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  heartRate?: number | null;
  temperatureC?: number | null;
  spo2?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  note?: string | null;
  recordedAt?: string | null;
}

export interface UpdatePatientVitalsInput {
  appointmentId?: string | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  heartRate?: number | null;
  temperatureC?: number | null;
  spo2?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  note?: string | null;
  recordedAt?: string | null;
  archivedAt?: string | null;
}

/**
 * Discriminator for the three resource groups exposed under
 * `/api/v1/patients/:patientId/chart/{allergies,conditions,vitals}`.
 */
export type PatientChartResource = 'allergies' | 'conditions' | 'vitals';

// ============================================================================
// Problem list (T5.25 — patient_problem_list_v view)
// ============================================================================

export type ProblemSource = 'chronic' | 'episode' | 'recurring';

/**
 * One row from `patient_problem_list_v`.
 * Columns are nullable where the source does not provide them:
 *   - chronic:   since_date, no occurrence_count / episode fields
 *   - episode:   since_date, episode_status, followups_used, max_followups
 *   - recurring: occurrence_count, no since_date / episode fields
 */
export interface ProblemListItem {
  source: ProblemSource;
  doctor_id: string;
  patient_id: string;
  /** Display label: condition name / service key / recurring diagnosis. */
  label: string;
  /** ISO date string (YYYY-MM-DD) for chronic/episode rows; null for recurring. */
  since_date: string | null;
  /** Number of occurrences in the last 6 months (recurring only). */
  occurrence_count: number | null;
  /** Episode lifecycle status (episode rows only). */
  episode_status: string | null;
  /** Follow-ups consumed (episode rows only). */
  followups_used: number | null;
  /** Maximum follow-ups allowed (episode rows only). */
  max_followups: number | null;
}
