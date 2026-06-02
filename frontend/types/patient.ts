/**
 * Patient types aligned with backend API and DB_SCHEMA.
 * API returns snake_case; use as received for display.
 * @see CONTRACTS.md, DB_SCHEMA.md
 */

export type ConsentStatus = "pending" | "granted" | "revoked";

export interface Patient {
  id: string;
  name: string;
  phone: string;
  date_of_birth?: string | null;
  gender?: string | null;
  platform?: string | null;
  platform_external_id?: string | null;
  consent_status?: ConsentStatus | null;
  consent_granted_at?: string | null;
  consent_revoked_at?: string | null;
  consent_method?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientDetailData {
  patient: Patient;
}

/** Summary for list endpoint (e-task-3 / pr-07 table). */
export interface PatientSummary {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medical_record_number?: string | null;
  last_appointment_date?: string | null;
  created_at: string;
  patient_tag?: string | null;
  platform_external_id?: string | null;
  has_allergies?: boolean;
  open_episodes_count?: number;
  overdue_followup?: boolean;
  last_visit_modality?: string | null;
  next_appointment_date?: string | null;
  next_appointment_status?: string | null;
  next_appointment_modality?: string | null;
  platform?: string | null;
}

export interface PatientsListData {
  patients: PatientSummary[];
}

/** Patient in a possible-duplicate group (from GET /api/v1/patients/possible-duplicates). */
export interface DuplicateGroupPatient {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medicalRecordNumber?: string;
}

export interface PossibleDuplicatesData {
  groups: DuplicateGroupPatient[][];
}

/**
 * Filterable segments on the v2 patients list (DL-4 / DL-6).
 * Server-computed; clients pass the literal in `?segment=`.
 */
export type PatientSegmentId =
  | "active-90d" // last_appointment_date >= now() - 90d
  | "new-30d" // created_at >= now() - 30d
  | "at-risk-followup" // any prescription with follow_up_value indicating a date in the past AND no subsequent visit
  | "no-show-prone" // appointments where status = 'no_show' >= 2 of last 4
  | "has-allergies" // patient_allergies row exists with archived_at IS NULL
  | "has-open-episodes" // patient_problem_list_v row exists with source = 'episode' AND episode_status IS NOT 'closed'
  | "untagged"; // patient_tag IS NULL OR ''

export type PatientListSortId =
  | "last-visit-desc"
  | "last-visit-asc"
  | "created-at-desc"
  | "created-at-asc"
  | "name-asc";

/** Query params accepted by `GET /api/v1/patients` (DL-4). */
export interface PatientListFilters {
  q?: string; // free-text; matches name / phone / MRN / IG handle (case-insensitive substring)
  segment?: PatientSegmentId;
  sort?: PatientListSortId;
  page?: number; // 1-indexed
  pageSize?: number; // default 50, max 200
}

/** Response shape from `GET /api/v1/patients`. Extends the v1 shape with pagination metadata. */
export interface PatientsListPagedData {
  patients: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Doctor-scoped saved view for the patients list.
 * Persisted via `doctor_cockpit_layout_presets` with `kind = 'patients_list_view'`.
 */
export interface PatientSavedView {
  id: string;
  name: string;
  is_default: boolean;
  filters: PatientListFilters;
  columns?: string[]; // optional visible-column list (when omitted, defaults apply)
  created_at: string;
  updated_at: string;
}

export interface PatientOverviewSnapshot {
  blood_group: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  preferred_language: string | null;
}

export interface PatientCurrentMedication {
  drug_name: string;
  dose: string | null;
  frequency: string | null;
  prescribed_at: string;
  prescriber_doctor_id: string;
  still_taking: boolean | null;
}

export interface PatientVitalsTrendPoint {
  recorded_at: string;
  value: number;
}

export interface PatientVitalsTrends {
  bp_systolic: PatientVitalsTrendPoint[];
  bp_diastolic: PatientVitalsTrendPoint[];
  heart_rate: PatientVitalsTrendPoint[];
  spo2: PatientVitalsTrendPoint[];
  weight_kg: PatientVitalsTrendPoint[];
  bmi: PatientVitalsTrendPoint[];
}

export type PatientActivityKind =
  | "visit"
  | "message"
  | "prescription"
  | "payment"
  | "no_show"
  | "file_upload";

export interface PatientActivityRow {
  kind: PatientActivityKind;
  occurred_at: string;
  summary: string;
  href: string | null;
}

export interface PatientCarePlan {
  next_step: string | null;
  overdue: string[];
  rationale: string[];
}

export type PatientRiskFlagSeverity = "info" | "warning" | "danger";

export interface PatientRiskFlag {
  code: string; // machine-readable identifier (e.g. 'BP_TREND_RISING')
  label: string; // human-readable explanation
  severity: PatientRiskFlagSeverity;
}

export interface PatientSixVisitStripEntry {
  appointment_id: string;
  occurred_at: string;
  status: import("./appointment").AppointmentStatus;
  modality: import("./appointment").ConsultationModality;
  chief_complaint: string | null;
}

/** DL-5 — `GET /api/v1/patients/:id/overview` response payload. */
export interface PatientOverviewData {
  patient: Patient;
  snapshot: PatientOverviewSnapshot;
  active_problems: import("./patient-chart").ProblemListItem[];
  allergies: import("./patient-chart").PatientAllergy[];
  chronic_conditions: import("./patient-chart").PatientChronicCondition[];
  current_medications: PatientCurrentMedication[];
  vitals_trends: PatientVitalsTrends;
  recent_activity: PatientActivityRow[];
  care_plan: PatientCarePlan | null;
  risk_flags: PatientRiskFlag[];
  six_visit_strip: PatientSixVisitStripEntry[];
}

/** DL-6 — `GET /api/v1/patients/kpis` response payload. */
export interface PatientsKpis {
  active_90d: { count: number; delta_7d: number };
  new_30d: { count: number; delta_7d: number };
  followup_overdue: { count: number; delta_7d: number };
  open_episodes: { count: number; delta_7d: number };
  possible_duplicates: { count: number; delta_7d: number };
  /** Server-computed cache window in seconds (DL-6 = 60). */
  cache_ttl_seconds: number;
}
