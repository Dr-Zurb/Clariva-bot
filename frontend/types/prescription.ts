/**
 * Prescription types aligned with backend API (Prescription V1).
 * API returns snake_case; frontend uses camelCase for payloads.
 * @see backend/src/types/prescription.ts
 */

export type PrescriptionType = "structured" | "photo" | "both";

/** Structured follow-up unit (cockpit-v2 / migration 103). */
export type FollowUpUnit = "days" | "weeks" | "months" | "as_needed";

/** BP measurement posture (objective-tab Vitals 2.0 / migration 151). */
export type VitalsBpPosture = "sitting" | "standing" | "supine";

/** BP measurement limb (objective-tab Vitals 2.0 / migration 151). */
export type VitalsBpLimb = "left_arm" | "right_arm" | "left_leg" | "right_leg";

/**
 * Severity on a structured complaint card (subjective-tab / migration 116).
 * `minimal` is legacy (kept so old saved cards still validate); the UI now offers
 * mild / moderate / severe / very_severe (subj-14 refine).
 */
export type ComplaintSeverity =
  | "minimal"
  | "mild"
  | "moderate"
  | "severe"
  | "very_severe"
  | number;

/** Schema-routing category for a complaint card (complaint_master.category). */
export type ComplaintCategory =
  | "pain"
  | "fever"
  | "cough"
  | "git"
  | "urinary"
  | "respiratory"
  | "ent"
  | "derm"
  | "eye"
  | "ear"
  | "cardiac"
  | "dizziness"
  | "gynae"
  | "mental"
  | "trauma"
  | "default";

/** One chief-complaint card in the subjective tab. */
export interface Complaint {
  id: string;
  name: string;
  onset?: string;
  duration?: string;
  location?: string;
  character?: string;
  radiation?: string;
  severity?: ComplaintSeverity | null;
  timing?: string;
  aggravating?: string;
  relieving?: string;
  /** Laterality / position chips (subj-14): Left/Right/Both/Upper/Lower/etc. */
  laterality?: string;
  /** Numeric pain rating 0–10 (NRS) — pain-category cards only. */
  painScore?: number | null;
  /** Exact fever reading (1 decimal) — fever-category cards. */
  temperature?: number | null;
  /** Unit for `temperature` (default °F in UI). */
  temperatureUnit?: "F" | "C" | null;
  /** Categorical fever band linked to `temperature`. */
  feverGrade?: "mild" | "moderate" | "high" | "very_high" | null;
  /** How the fever was assessed: felt only / home thermometer / at clinic. */
  measuredBy?: string | null;
  /** Who reported subjective fever — only when `measuredBy` is "Felt only". */
  reportedBy?: "Patient" | "Attendant" | "Clinician" | string | null;
  /** Episodes or frequency (e.g. "5/day") — GIT / urinary schemas. */
  frequency?: string;
  /** Colour / content (sputum, stool blood-mucus, urine, discharge). */
  color?: string;
  associated?: string[];
  /** Full mini-cards for associated symptoms (one nesting level; subj-12). */
  associatedComplaints?: Complaint[];
  notes?: string;
  /** Schema category from complaint_master (subj-06). */
  category?: ComplaintCategory | null;
}

/** Per-system exam status (objective-tab / migration 150). */
export type ExamSystemStatus = "normal" | "abnormal";

/**
 * One structured per-system examination finding stored in
 * `prescriptions.examination_json` (objective-tab / migration 150). Mirrors
 * backend/src/types/prescription.ts:ExamSystemFinding. `examination_findings`
 * TEXT is derived from this on save (OBJ-D2); the `systemId` vocabulary +
 * ordering is frozen by obj-02's exam registry.
 */
export interface ExamSystemFinding {
  systemId: string;
  status: ExamSystemStatus;
  findings?: string[];
  notes?: string | null;
}

/** Leaf custom sub-subsection — cannot nest further (subj-19 / migration 144). */
export interface CustomSubsectionChild {
  id: string;
  title: string;
  body?: string | null;
}

/** Doctor-defined custom subsection with optional sub-subsections (depth 2). */
export interface CustomSubsection {
  id: string;
  title: string;
  body?: string | null;
  children: CustomSubsectionChild[];
}

export interface Prescription {
  id: string;
  appointment_id: string;
  patient_id: string | null;
  doctor_id: string;
  type: PrescriptionType;
  cc: string | null;
  hopi: string | null;
  provisional_diagnosis: string | null;
  /** @deprecated API alias — prefer `investigations_orders`. */
  investigations?: string | null;
  investigations_orders?: string | null;
  follow_up: string | null;
  patient_education: string | null;
  clinical_notes: string | null;
  sent_to_patient_at: string | null;
  created_at: string;
  updated_at: string;
  vitals_bp_systolic?: number | null;
  vitals_bp_diastolic?: number | null;
  vitals_hr?: number | null;
  vitals_temp_c?: number | null;
  vitals_spo2?: number | null;
  vitals_wt_kg?: number | null;
  vitals_ht_cm?: number | null;
  // objective-tab / migration 151 — Vitals 2.0 extended vitals (canonical units).
  vitals_rr?: number | null;
  vitals_pain_score?: number | null;
  vitals_glucose_mg_dl?: number | null;
  vitals_gcs_total?: number | null;
  vitals_bp_posture?: VitalsBpPosture | null;
  vitals_bp_limb?: VitalsBpLimb | null;
  vitals_head_circumference_cm?: number | null;
  vitals_muac_cm?: number | null;
  vitals_waist_cm?: number | null;
  examination_findings?: string | null;
  /** objective-tab / migration 150 — structured per-system exam findings. */
  examination_json?: ExamSystemFinding[];
  differential_diagnosis?: string[] | null;
  advice?: string | null;
  follow_up_value?: number | null;
  follow_up_unit?: FollowUpUnit | null;
  referral?: string | null;
  test_results?: string | null;
  complaints?: Complaint[];
  family_history?: string | null;
  family_history_structured?: import("@/lib/cockpit/family-history").FamilyHistoryStructured | null;
  social_history?: string | null;
  social_history_structured?: import("@/lib/cockpit/social-history").SocialHistoryStructured | null;
  past_surgical_history?: string | null;
  past_surgical_history_structured?: import("@/lib/cockpit/past-surgical-history").PastSurgicalHistoryStructured | null;
  custom_subsections?: CustomSubsection[];
}

/**
 * EHR Sub-batch B1 / T2-D4 enums. Mirrors the backend exactly
 * (backend/src/types/prescription.ts) which in turn mirrors the
 * CHECK constraints in migration 090. Source of truth for the
 * vocabulary lives in the SQL migration; keep this in lockstep.
 */
export type FrequencyCode =
  | "OD"
  | "BID"
  | "TID"
  | "QID"
  | "QHS"
  | "PRN"
  | "STAT"
  | "CUSTOM"
  /** Interval / weekly — chart meds & extended Rx (patient_medications migration 136). */
  | "Q4H"
  | "Q6H"
  | "Q8H"
  | "Q12H"
  | "Q24H"
  | "QW";

/** Drug strength unit (patient_medications migration 136). */
export type StrengthUnit = "mg" | "g" | "mcg" | "iu" | "pct";

export type DurationUnit =
  | "days"
  | "weeks"
  | "months"
  | "until-finished"
  | "continue";

export type RouteCode =
  | "oral"
  | "IV"
  | "IM"
  | "SC"
  | "topical"
  | "inhaled"
  | "rectal"
  | "nasal"
  | "sublingual"
  | "other";

/** Per-dose unit (migration 133 — medicine card redesign). */
export type DoseUnit =
  | "tab"
  | "cap"
  | "ml"
  | "spoon"
  | "drops"
  | "puff"
  | "sachet"
  | "unit"
  | "application";

/** Structured food/timing instruction (migration 133). */
export type FoodTiming =
  | "before_food"
  | "after_food"
  | "with_food"
  | "empty_stomach"
  | "bedtime";

export interface PrescriptionMedicine {
  id: string;
  prescription_id: string;
  medicine_name: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  sort_order: number;
  created_at: string;
  // EHR Sub-batch B1 / T2.9 — structured columns. NULL on rows
  // created before migration 090 ran (gracefully degrades to free-text).
  drug_master_id: string | null;
  frequency_code: FrequencyCode | null;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  route_code: RouteCode | null;
  // Migration 133 — dose details. NULL on rows created before the
  // medicine card redesign.
  dose_qty: number | null;
  dose_unit: DoseUnit | null;
  form: string | null;
  food_timing: FoodTiming | null;
}

export interface PrescriptionAttachment {
  id: string;
  prescription_id: string;
  file_path: string;
  file_type: string | null;
  caption: string | null;
  uploaded_at: string;
}

export interface PrescriptionWithRelations extends Prescription {
  prescription_medicines?: PrescriptionMedicine[];
  prescription_attachments?: PrescriptionAttachment[];
}

/**
 * Lightweight summary row returned by
 * `GET /api/v1/patients/:patientId/prescriptions/recent` (EHR T1.6).
 *
 * Mirrors backend/src/types/prescription.ts:PrescriptionRecentSummary.
 * Locked-in shape — B1's T2.14 ("copy from last visit") is expected to
 * reuse this surface.
 */
export interface PrescriptionRecentSummary {
  id: string;
  appointment_id: string;
  created_at: string;
  provisional_diagnosis: string | null;
  sent_to_patient_at: string | null;
  medicine_count: number;
}

/**
 * Per-medicine payload shape for create / update. Includes the T2.9
 * structured fields. All structured fields are optional + nullable so
 * older clients (or the photo-only flow) can post payloads without
 * touching them.
 */
export interface MedicinePayload {
  medicineName: string;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  sortOrder?: number;
  // T2.9 structured fields
  drugMasterId?: string | null;
  frequencyCode?: FrequencyCode | null;
  durationValue?: number | null;
  durationUnit?: DurationUnit | null;
  routeCode?: RouteCode | null;
  // Migration 133 — dose details
  doseQty?: number | null;
  doseUnit?: DoseUnit | null;
  form?: string | null;
  foodTiming?: FoodTiming | null;
}

/** Subjective-tab structured fields (camelCase API). */
export interface SubjectivePayload {
  complaints?: Complaint[];
  familyHistory?: string | null;
  familyHistoryStructured?: import("@/lib/cockpit/family-history").FamilyHistoryStructured | null;
  socialHistory?: string | null;
  socialHistoryStructured?: import("@/lib/cockpit/social-history").SocialHistoryStructured | null;
  pastSurgicalHistory?: string | null;
  pastSurgicalHistoryStructured?: import("@/lib/cockpit/past-surgical-history").PastSurgicalHistoryStructured | null;
  customSubsections?: CustomSubsection[];
  /** Derived plain-text mirror for PDF/SMS (computed on save; not persisted). */
  customSubsectionsText?: string | null;
}

/** cockpit-v2 structured SOAP fields (camelCase API). */
export interface StructuredSoapPayload {
  vitalsBpSystolic?: number | null;
  vitalsBpDiastolic?: number | null;
  vitalsHr?: number | null;
  vitalsTempC?: number | null;
  vitalsSpo2?: number | null;
  vitalsWtKg?: number | null;
  vitalsHtCm?: number | null;
  // objective-tab / migration 151 — Vitals 2.0 extended vitals (canonical units).
  vitalsRr?: number | null;
  vitalsPainScore?: number | null;
  vitalsGlucoseMgDl?: number | null;
  vitalsGcsTotal?: number | null;
  vitalsBpPosture?: VitalsBpPosture | null;
  vitalsBpLimb?: VitalsBpLimb | null;
  vitalsHeadCircumferenceCm?: number | null;
  vitalsMuacCm?: number | null;
  vitalsWaistCm?: number | null;
  examinationFindings?: string | null;
  /** objective-tab / migration 150 — structured per-system exam findings. */
  examinationJson?: ExamSystemFinding[];
  differentialDiagnosis?: string[] | null;
  advice?: string | null;
  followUpValue?: number | null;
  followUpUnit?: FollowUpUnit | null;
  referral?: string | null;
  testResults?: string | null;
}

/** Payload for creating a prescription (camelCase) */
export interface CreatePrescriptionPayload extends StructuredSoapPayload, SubjectivePayload {
  appointmentId: string;
  patientId?: string | null;
  type: PrescriptionType;
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  investigations?: string | null;
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: MedicinePayload[];
}

/** Payload for updating a prescription (partial) */
export interface UpdatePrescriptionPayload extends StructuredSoapPayload, SubjectivePayload {
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  investigations?: string | null;
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: MedicinePayload[];
}
