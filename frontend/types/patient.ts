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
  age?: number | null;
  gender?: string | null;
  platform?: string | null;
  platform_external_id?: string | null;
  consent_status?: ConsentStatus | null;
  consent_granted_at?: string | null;
  consent_revoked_at?: string | null;
  consent_method?: string | null;
  created_at: string;
  updated_at: string;
  /** How the row was created. Not PHI. */
  registered_via?:
    | "bot"
    | "front_desk"
    | "booking_for_other"
    | "import"
    | "doctor"
    | null;
  /** Auth user who created the row. Not PHI. */
  created_by?: string | null;
  /** Read-time label for created_by. Never log. */
  created_by_label?: string | null;
  /** Father / spouse / other related name. PHI. */
  guardian_name?: string | null;
  guardian_relation?: "father" | "spouse" | "mother" | "son" | "daughter" | null;
  /** Second contact. PHI. */
  alt_phone?: string | null;
  address?: string | null;
  /** Desk hide stamp. Not PHI. */
  archived_at?: string | null;
  /** Auth user who archived. Not PHI. */
  archived_by?: string | null;
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
  /** Multi-tag labels (migration 191). */
  patient_tags?: string[];
  /** Legacy single label — mirrors patient_tags[0]. */
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
  guardian_name?: string | null;
  guardian_relation?: string | null;
  alt_phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  archived_at?: string | null;
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
  | "new-30d" // first completed visit in rolling 30d (PKD-D3)
  | "revisit-30d" // completed visit in 30d + prior completed (PKD-D4)
  | "at-risk-followup" // any prescription with follow_up_value indicating a date in the past AND no subsequent visit
  | "no-show-prone" // appointments where status = 'no_show' >= 2 of last 4
  | "has-allergies" // patient_allergies row exists with archived_at IS NULL
  | "has-open-episodes" // patient_problem_list_v row exists with source = 'episode' AND episode_status IS NOT 'closed'
  | "incomplete-consult" // session started; appointment never completed (PKD-D2)
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
  /** Case-insensitive membership on patient_tags (ANY). */
  tag?: string;
  sort?: PatientListSortId;
  page?: number; // 1-indexed
  pageSize?: number; // default 50, max 200
  includeArchived?: boolean;
  lean?: boolean;
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

/** List hover-card — `GET /api/v1/patients/:id/overview?view=peek`. */
export interface PatientQuickPeekData {
  patient: { id: string; name: string };
  snapshot: {
    blood_group: string | null;
    height_cm: number | null;
    weight_kg: number | null;
  };
  active_problems: import("./patient-chart").ProblemListItem[];
  allergies: import("./patient-chart").PatientAllergy[];
  chronic_conditions: import("./patient-chart").PatientChronicCondition[];
}

/** Doctor worklist KPIs — `GET /api/v1/patients/kpis` (PKD). */
export interface PatientsKpis {
  incomplete_consults: { count: number; delta_7d: number };
  new_30d: { count: number; delta_7d: number };
  followup_overdue: { count: number; delta_7d: number };
  revisits_30d: { count: number; delta_7d: number };
  /** Server-computed cache window in seconds (DL-6 = 60). */
  cache_ttl_seconds: number;
}
