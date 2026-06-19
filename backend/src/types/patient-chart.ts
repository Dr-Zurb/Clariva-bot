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

export type PatientConditionStatus = 'active' | 'resolved';
export type PatientConditionAgoUnit = 'days' | 'weeks' | 'months' | 'years';

export interface PatientChronicCondition {
  id: string;
  doctor_id: string;
  patient_id: string;
  condition: string;
  status: PatientConditionStatus;
  diagnosed_on: string | null;
  diagnosed_ago_value: number | null;
  diagnosed_ago_unit: PatientConditionAgoUnit | null;
  resolved_ago_value: number | null;
  resolved_ago_unit: PatientConditionAgoUnit | null;
  on_treatment: boolean | null;
  note: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientMedicationStatus = 'active' | 'past';
export type PatientMedicationIntakePattern = 'regular' | 'irregular' | 'prn';
export type PatientMedicationSource = 'prescribed' | 'self' | 'otc';

/** Why a chart medication was stopped (migration 134). */
export type PatientMedicationStopReason =
  | 'resolved'
  | 'side_effects'
  | 'cost'
  | 'patient_choice'
  | 'other';

/**
 * One active ingredient of a fixed-dose combination (migration 138).
 * Combos like Rcinex "600/300" store one entry per salt; `ingredient` is
 * optional (known from drug_master / AI parse, omitted on free-text capture).
 */
export interface MedicationStrengthComponent {
  value: number;
  unit?: import('./prescription').StrengthUnit | null;
  ingredient?: string | null;
}

export interface PatientMedication {
  id: string;
  doctor_id: string;
  patient_id: string;
  drug_name: string;
  /** Legacy strength mirror — prefer `strength` when set (migration 134). */
  dose: string | null;
  frequency: string | null;
  status: PatientMedicationStatus;
  intake_pattern: PatientMedicationIntakePattern | null;
  source: PatientMedicationSource | null;
  started_on: string | null;
  stopped_on: string | null;
  note: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Migration 134 — structured chart-med fields
  strength: string | null;
  dose_qty: number | null;
  dose_unit: import('./prescription').DoseUnit | null;
  frequency_code: import('./prescription').FrequencyCode | null;
  form: string | null;
  drug_master_id: string | null;
  stopped_ago_value: number | null;
  stopped_ago_unit: PatientConditionAgoUnit | null;
  /** Relative start timing — migration 137 ("for 5 years"). */
  started_ago_value: number | null;
  started_ago_unit: PatientConditionAgoUnit | null;
  stop_reason: PatientMedicationStopReason | null;
  /** Dose timing pattern e.g. 1-0-1 (migration 135). */
  dose_schedule: string | null;
  /** Structured strength (migration 136). */
  strength_value: number | null;
  strength_unit: import('./prescription').StrengthUnit | null;
  /** Fixed-dose-combination strength, one entry per ingredient (migration 138). */
  strength_components: MedicationStrengthComponent[] | null;
  /** Food/timing relevance — migration 139 (mirrors prescription_medicines). */
  food_timing: import('./prescription').FoodTiming | null;
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
  status?: PatientConditionStatus;
  diagnosedOn?: string | null;
  diagnosedAgoValue?: number | null;
  diagnosedAgoUnit?: PatientConditionAgoUnit | null;
  resolvedAgoValue?: number | null;
  resolvedAgoUnit?: PatientConditionAgoUnit | null;
  onTreatment?: boolean | null;
  note?: string | null;
}

export interface UpdatePatientChronicConditionInput {
  condition?: string;
  status?: PatientConditionStatus;
  diagnosedOn?: string | null;
  diagnosedAgoValue?: number | null;
  diagnosedAgoUnit?: PatientConditionAgoUnit | null;
  resolvedAgoValue?: number | null;
  resolvedAgoUnit?: PatientConditionAgoUnit | null;
  onTreatment?: boolean | null;
  note?: string | null;
  archivedAt?: string | null;
}

export interface CreatePatientMedicationInput {
  drugName: string;
  dose?: string | null;
  frequency?: string | null;
  status?: PatientMedicationStatus;
  intakePattern?: PatientMedicationIntakePattern | null;
  source?: PatientMedicationSource | null;
  startedOn?: string | null;
  stoppedOn?: string | null;
  note?: string | null;
  /** Optional condition IDs to link on create (M:N). */
  conditionIds?: string[];
  // Migration 134
  strength?: string | null;
  doseQty?: number | null;
  doseUnit?: import('./prescription').DoseUnit | null;
  frequencyCode?: import('./prescription').FrequencyCode | null;
  form?: string | null;
  drugMasterId?: string | null;
  stoppedAgoValue?: number | null;
  stoppedAgoUnit?: PatientConditionAgoUnit | null;
  startedAgoValue?: number | null;
  startedAgoUnit?: PatientConditionAgoUnit | null;
  stopReason?: PatientMedicationStopReason | null;
  doseSchedule?: string | null;
  strengthValue?: number | null;
  strengthUnit?: import('./prescription').StrengthUnit | null;
  /** Combo strength components (migration 138). */
  strengthComponents?: MedicationStrengthComponent[] | null;
  /** Food/timing relevance — migration 139. */
  foodTiming?: import('./prescription').FoodTiming | null;
}

export interface UpdatePatientMedicationInput {
  drugName?: string;
  dose?: string | null;
  frequency?: string | null;
  status?: PatientMedicationStatus;
  intakePattern?: PatientMedicationIntakePattern | null;
  source?: PatientMedicationSource | null;
  startedOn?: string | null;
  stoppedOn?: string | null;
  note?: string | null;
  archivedAt?: string | null;
  // Migration 134
  strength?: string | null;
  doseQty?: number | null;
  doseUnit?: import('./prescription').DoseUnit | null;
  frequencyCode?: import('./prescription').FrequencyCode | null;
  form?: string | null;
  drugMasterId?: string | null;
  stoppedAgoValue?: number | null;
  stoppedAgoUnit?: PatientConditionAgoUnit | null;
  startedAgoValue?: number | null;
  startedAgoUnit?: PatientConditionAgoUnit | null;
  stopReason?: PatientMedicationStopReason | null;
  doseSchedule?: string | null;
  strengthValue?: number | null;
  strengthUnit?: import('./prescription').StrengthUnit | null;
  /** Combo strength components (migration 138). */
  strengthComponents?: MedicationStrengthComponent[] | null;
  /** Food/timing relevance — migration 139. */
  foodTiming?: import('./prescription').FoodTiming | null;
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
export type PatientChartResource = 'allergies' | 'conditions' | 'medications' | 'vitals';

// ============================================================================
// Condition ↔ medication links (Phase B — problem-oriented charting)
// ============================================================================

export interface ConditionMedicationLink {
  id: string;
  doctor_id: string;
  patient_id: string;
  condition_id: string;
  medication_id: string;
  created_at: string;
}

export interface ConditionWithMedications extends PatientChronicCondition {
  medications: PatientMedication[];
}

export interface MedicalBackgroundGrouped {
  conditions: ConditionWithMedications[];
  unlinkedMedications: PatientMedication[];
  links: ConditionMedicationLink[];
  /** Section-level PMH notes (migration 140). */
  notes: string | null;
}

export interface UpdateMedicalBackgroundNotesInput {
  notes?: string | null;
}

export interface LinkConditionMedicationInput {
  conditionId: string;
  medicationId: string;
}

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
