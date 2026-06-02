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
  diagnosedOn?: string | null;
  note?: string | null;
}

export interface UpdatePatientConditionPayload {
  condition?: string;
  diagnosedOn?: string | null;
  note?: string | null;
  archivedAt?: string | null;
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
