/**
 * Patient chart types (EHR Sub-batch A / T1.3).
 *
 * Mirrors backend/src/types/patient-chart.ts:
 *   - DB rows are snake_case (matches what the API returns).
 *   - Create/update payloads are camelCase (what the API accepts).
 *
 * @see backend/src/types/patient-chart.ts
 * @see backend/migrations/087_patient_chart_context.sql
 */

// ============================================================================
// DB row shapes (snake_case — returned by the API)
// ============================================================================

export type PatientAllergySeverity = "mild" | "moderate" | "severe" | "unknown";

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

export type PatientConditionStatus = "active" | "resolved";
export type PatientConditionAgoUnit = "days" | "weeks" | "months" | "years";

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

export type PatientMedicationStatus = "active" | "past";
export type PatientMedicationIntakePattern = "regular" | "irregular" | "prn";
export type PatientMedicationSource = "prescribed" | "self" | "otc";

/** Why a chart medication was stopped (migration 134). */
export type PatientMedicationStopReason =
  | "resolved"
  | "side_effects"
  | "cost"
  | "patient_choice"
  | "other";

/**
 * One active ingredient of a fixed-dose combination (migration 138).
 * Combos like Rcinex "600/300" store one entry per salt; `ingredient` is
 * optional (known from drug_master / AI parse, omitted on free-text capture).
 */
export interface MedicationStrengthComponent {
  value: number;
  unit?: import("@/types/prescription").StrengthUnit | null;
  ingredient?: string | null;
}

export interface PatientMedication {
  id: string;
  doctor_id: string;
  patient_id: string;
  drug_name: string;
  /** Legacy strength mirror — prefer `strength` when set. */
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
  dose_unit: import("@/types/prescription").DoseUnit | null;
  frequency_code: import("@/types/prescription").FrequencyCode | null;
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
  strength_unit: import("@/types/prescription").StrengthUnit | null;
  /** Fixed-dose-combination strength, one entry per ingredient (migration 138). */
  strength_components: MedicationStrengthComponent[] | null;
  /** Food/timing relevance — migration 139. */
  food_timing: import("@/types/prescription").FoodTiming | null;
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
// Create / update payloads (camelCase — accepted by the API)
// ============================================================================

export interface CreatePatientAllergyPayload {
  allergen: string;
  severity?: PatientAllergySeverity;
  reaction?: string | null;
  note?: string | null;
}

export interface UpdatePatientAllergyPayload {
  allergen?: string;
  severity?: PatientAllergySeverity;
  reaction?: string | null;
  note?: string | null;
  /** ISO timestamp, the literal `'now'` (server-resolved), or `null` to un-archive. */
  archivedAt?: string | null;
}

export interface CreatePatientConditionPayload {
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

export interface UpdatePatientConditionPayload {
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

export interface CreatePatientMedicationPayload {
  drugName: string;
  dose?: string | null;
  frequency?: string | null;
  status?: PatientMedicationStatus;
  intakePattern?: PatientMedicationIntakePattern | null;
  source?: PatientMedicationSource | null;
  startedOn?: string | null;
  stoppedOn?: string | null;
  note?: string | null;
  conditionIds?: string[];
  // Migration 134
  strength?: string | null;
  doseQty?: number | null;
  doseUnit?: import("@/types/prescription").DoseUnit | null;
  frequencyCode?: import("@/types/prescription").FrequencyCode | null;
  form?: string | null;
  drugMasterId?: string | null;
  stoppedAgoValue?: number | null;
  stoppedAgoUnit?: PatientConditionAgoUnit | null;
  startedAgoValue?: number | null;
  startedAgoUnit?: PatientConditionAgoUnit | null;
  stopReason?: PatientMedicationStopReason | null;
  doseSchedule?: string | null;
  strengthValue?: number | null;
  strengthUnit?: import("@/types/prescription").StrengthUnit | null;
  /** Combo strength components (migration 138). */
  strengthComponents?: MedicationStrengthComponent[] | null;
  /** Food/timing relevance — migration 139. */
  foodTiming?: import("@/types/prescription").FoodTiming | null;
}

export interface UpdatePatientMedicationPayload {
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
  doseUnit?: import("@/types/prescription").DoseUnit | null;
  frequencyCode?: import("@/types/prescription").FrequencyCode | null;
  form?: string | null;
  drugMasterId?: string | null;
  stoppedAgoValue?: number | null;
  stoppedAgoUnit?: PatientConditionAgoUnit | null;
  startedAgoValue?: number | null;
  startedAgoUnit?: PatientConditionAgoUnit | null;
  stopReason?: PatientMedicationStopReason | null;
  doseSchedule?: string | null;
  strengthValue?: number | null;
  strengthUnit?: import("@/types/prescription").StrengthUnit | null;
  /** Combo strength components (migration 138). */
  strengthComponents?: MedicationStrengthComponent[] | null;
  /** Food/timing relevance — migration 139. */
  foodTiming?: import("@/types/prescription").FoodTiming | null;
}

export interface CreatePatientVitalsPayload {
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

export interface UpdatePatientVitalsPayload {
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

// ============================================================================
// Response data shapes (the `data` body inside ApiSuccess<T>)
// ============================================================================

export interface AllergyData {
  allergy: PatientAllergy;
}
export interface AllergiesListData {
  allergies: PatientAllergy[];
}

export interface ConditionData {
  condition: PatientChronicCondition;
}
export interface ConditionsListData {
  conditions: PatientChronicCondition[];
}

export interface MedicationData {
  medication: PatientMedication;
}
export interface MedicationsListData {
  medications: PatientMedication[];
}

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

export interface UpdateMedicalBackgroundNotesPayload {
  notes?: string | null;
}

export interface MedicalBackgroundData {
  medicalBackground: MedicalBackgroundGrouped;
}

export interface ConditionMedicationLinkData {
  link: ConditionMedicationLink;
}

export interface LinkConditionMedicationPayload {
  conditionId: string;
  medicationId: string;
}

export interface VitalsData {
  vitals: PatientVitalsReading;
}
export interface VitalsListData {
  vitals: PatientVitalsReading[];
}

// ============================================================================
// Problem list (T5.25 — patient_problem_list_v)
// ============================================================================

export type ProblemSource = "chronic" | "episode" | "recurring";

/**
 * One row returned by GET /api/v1/patients/:id/chart/problems.
 * Maps directly to the patient_problem_list_v view columns.
 */
export interface ProblemListItem {
  source: ProblemSource;
  doctor_id: string;
  patient_id: string;
  /** Condition name / service key / recurring diagnosis text. */
  label: string;
  /** YYYY-MM-DD date string for chronic/episode rows; null for recurring. */
  since_date: string | null;
  /** Number of occurrences in last 6 months (recurring only). */
  occurrence_count: number | null;
  /** Episode lifecycle status (episode rows only). */
  episode_status: string | null;
  /** Follow-ups consumed (episode rows only). */
  followups_used: number | null;
  /** Maximum follow-ups allowed (episode rows only). */
  max_followups: number | null;
}

export interface ProblemsListData {
  problems: ProblemListItem[];
}

// ============================================================================
// Component-shared types
// ============================================================================

export type PatientChartLayout = "desktop" | "mobile" | "in-call";
export type PatientChartMode = "default" | "readonly";
