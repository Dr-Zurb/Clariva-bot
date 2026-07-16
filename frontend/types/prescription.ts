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

/**
 * Visit-level clinical trajectory (assessment-tab / migration 160). Mirrors the
 * backend type + the `prescriptions_assessment_acuity_chk` CHECK constraint.
 */
export type AssessmentAcuity = "improving" | "stable" | "worsening";

/** Diagnosis role within a visit (assessment-tab / migration 161; asmt-05 adds differential). */
export type DiagnosisKind = "primary" | "secondary" | "differential";

/**
 * Clinical certainty for a structured diagnosis row (migration 161).
 * Role-gated in the UI:
 * - committed (primary/secondary): `confirmed` | `provisional` (labelled Provisional)
 * - differential: `provisional` (Considering) | `excluded` (Ruled out)
 * `rule_out` is deprecated — tolerated on hydrate, mapped to `provisional`.
 */
export type DiagnosisCertainty =
  | "provisional"
  | "rule_out"
  | "confirmed"
  | "excluded";

/** Visit-relative status for a structured diagnosis row (migration 161). */
export type DiagnosisStatus = "new" | "ongoing" | "resolved";

/**
 * One structured diagnosis row stored in `prescriptions.diagnoses_json`
 * (assessment-tab / migration 161). Mirrors backend DiagnosisRow.
 * `provisional_diagnosis` TEXT is derived from the primary label on save
 * (ASMT-D4).
 */
export interface DiagnosisRow {
  id: string;
  label: string;
  kind: DiagnosisKind;
  certainty: DiagnosisCertainty;
  status: DiagnosisStatus;
  note?: string | null;
  /**
   * Per-diagnosis clinical trajectory (improving / stable / worsening).
   * Replaces the dormant visit-level `assessment_acuity` column for new edits.
   * Differentials typically leave this null.
   */
  acuity?: AssessmentAcuity | null;
  /**
   * Optional link to `patient_chronic_conditions.id` (asmt-04, dormant writer).
   * Kept so older saved rows still hydrate; Assessment no longer creates or
   * edits this link. Null = unlinked.
   */
  conditionId?: string | null;
  /**
   * assessment-tab / asmt-06 — optional ICD-11 (MMS) code from
   * `diagnosis_catalog` when the row was resolved via the catalog autocomplete.
   * Additive + OPTIONAL: uncoded rows still save (ASMT-D3) and coding never
   * alters the derived provisional/differential TEXT (ASMT-D4/D4'). `label`
   * stays the doctor-facing text and may differ from `codeTitle`.
   */
  code?: string | null;
  /** Canonical ICD-11 title for `code` (asmt-06); null when uncoded. */
  codeTitle?: string | null;
}

/**
 * Order kind for a structured investigation order (migration 167 / inv-lib-05).
 * Mirrors backend `InvestigationOrderKind`. `panel|analyte|imaging` are
 * catalog-backed; `custom` is free-typed text with no catalog entry.
 * `panel` rows may carry editable `members` (named basket / INV-D11).
 */
export type InvestigationOrderKind = "panel" | "analyte" | "imaging" | "custom";

/** Contrast preference for CT/MRI / contrast studies (requisition). */
export type InvestigationImagingContrast = "plain" | "contrast" | "both";

/** Urgency for imaging requisition. */
export type InvestigationImagingUrgency = "routine" | "urgent";

/**
 * Light requisition details for CT/MRI / Doppler (site, contrast, indication).
 * Encoded into flat `investigations_orders` TEXT on serialize (INV-D8).
 */
export interface InvestigationImagingRequisition {
  contrast?: InvestigationImagingContrast | null;
  /** Laterality / site, e.g. left, right, bilateral. */
  site?: string | null;
  indication?: string | null;
  urgency?: InvestigationImagingUrgency | null;
}

/** One member inside a named investigation basket (INV-D11). */
export interface InvestigationOrderMember {
  id: string;
  label: string;
  kind: InvestigationOrderKind;
}

/**
 * One structured investigation order stored in
 * `prescriptions.investigations_orders_json` (migration 167 / inv-lib-05).
 * Mirrors backend `InvestigationOrder`. Panels, viewable imaging (X-rays), and
 * free-text custom orders are named baskets: `label` is the editable title;
 * `members` lists analytes, views, or nested orders. Flat `investigations_orders`
 * TEXT is derived on save (INV-D8/D11).
 */
export interface InvestigationOrder {
  id: string;
  label: string;
  kind: InvestigationOrderKind;
  /**
   * Catalog template id this basket was seeded from (panel id or imaging id).
   * Null for freeform / custom groups.
   */
  sourcePanelId?: string | null;
  /** Basket members — present for expandable `panel` / viewable `imaging` / `custom`. */
  members?: InvestigationOrderMember[] | null;
  /** CT/MRI-style requisition fields (optional). */
  requisition?: InvestigationImagingRequisition | null;
}

/** BP measurement limb (objective-tab Vitals 2.0 / migration 151). */
export type VitalsBpLimb = "left_arm" | "right_arm" | "left_leg" | "right_leg";

/** Who performed the BP measurement (teleconsult provenance). */
export type BpMeasuredBy = "patient" | "caregiver" | "nurse" | "physician" | "other";

/** How BP was measured (device / technique). */
export type BpMethod =
  | "auto_upper_arm"
  | "manual_auscultatory"
  | "wrist_monitor"
  | "wearable"
  | "kiosk";

/** Where BP was measured. */
export type BpSetting = "home" | "clinic" | "hospital" | "pharmacy" | "work";

/** Visit-level measurement provenance (shared who / where). */
export interface MeasurementContext {
  measuredBy?: BpMeasuredBy | null;
  setting?: BpSetting | null;
}

/** Visit-level default BP measurement context (vitals_json.bpContext). */
export interface BpContext {
  measuredBy?: BpMeasuredBy | null;
  method?: BpMethod | null;
  setting?: BpSetting | null;
}

/** One BP measurement row (vitals-section · multi-reading BP). */
export interface BpReading {
  systolic: number | null;
  diastolic: number | null;
  posture?: VitalsBpPosture | null;
  limb?: VitalsBpLimb | null;
  /** Optional clinician label, e.g. "3 min", "rest". */
  sequenceLabel?: string | null;
  /** Per-row override; null = inherit visit `bpContext`. */
  measuredBy?: BpMeasuredBy | null;
  method?: BpMethod | null;
  setting?: BpSetting | null;
  /** Optional free-text note for this reading (flows into derived BP text). */
  note?: string | null;
}

/** Visit-level default glucose device (vitals_json.glucoseContext). */
export interface GlucoseContext {
  device?: import("@/lib/cockpit/categorical-vitals-schema").VitalsGlucoseDevice | null;
}

/** One blood-glucose reading row (vitals-section · multi-reading glucose). */
export interface GlucoseReading {
  valueMgDl: number | null;
  timing?: import("@/lib/cockpit/categorical-vitals-schema").VitalsGlucoseTiming | null;
  device?: import("@/lib/cockpit/categorical-vitals-schema").VitalsGlucoseDevice | null;
  sequenceLabel?: string | null;
  note?: string | null;
}

/**
 * Vitals 3.0 — json-backed extended vitals (vitals-section / migration 156).
 * Mirrors `backend/src/types/prescription.ts#VitalsJson`. Numeric values are in
 * canonical units; categorical values store the enum (sourced from the
 * `categorical-vitals-schema` registry, the FE single source). All keys
 * optional/nullable; `gcs_total` stays a column (E/V/M sub-scores live here).
 */
export interface VitalsJson {
  // Respiratory
  vitalsO2FlowLMin?: number | null;
  vitalsFio2Pct?: number | null;
  vitalsPefrLMin?: number | null;
  // Metabolic
  vitalsBloodKetonesMmolL?: number | null;
  vitalsHipCm?: number | null;
  // Neuro
  vitalsGcsE?: number | null;
  vitalsGcsV?: number | null;
  vitalsGcsM?: number | null;
  vitalsPupilSizeLeftMm?: number | null;
  vitalsPupilSizeRightMm?: number | null;
  vitalsCapillaryRefillS?: number | null;
  // Obstetric
  vitalsFetalHeartRateBpm?: number | null;
  vitalsFundalHeightCm?: number | null;
  // Categorical / context
  vitalsO2DeliveryMethod?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsO2DeliveryMethod
    | null;
  vitalsGlucoseTiming?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsGlucoseTiming
    | null;
  vitalsPupilReactivityLeft?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsPupilReactivity
    | null;
  vitalsPupilReactivityRight?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsPupilReactivity
    | null;
  vitalsAvpu?: import("@/lib/cockpit/categorical-vitals-schema").VitalsAvpu | null;
  vitalsPulseRhythm?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsPulseRhythm
    | null;
  vitalsTempSite?: import("@/lib/cockpit/categorical-vitals-schema").VitalsTempSite | null;
  vitalsTempDevice?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsTempDevice
    | null;
  vitalsSpo2Device?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsSpo2Device
    | null;
  vitalsHrSource?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsHrSource
    | null;
  vitalsGlucoseDevice?:
    | import("@/lib/cockpit/categorical-vitals-schema").VitalsGlucoseDevice
    | null;
  /** Multi-reading BP rows; primary (index 0) mirrors legacy columns. */
  bpReadings?: BpReading[] | null;
  /** Multi-reading glucose rows; primary (index 0) mirrors legacy column + timing. */
  glucoseReadings?: GlucoseReading[] | null;
  /** Visit-level default glucose device. */
  glucoseContext?: GlucoseContext | null;
  /** Visit-level who / where for all vitals (teleconsult provenance). */
  measurementContext?: MeasurementContext | null;
  /** Visit-level BP cuff method; who/where may also live in `measurementContext`. */
  bpContext?: BpContext | null;
  /**
   * Per-vital who/where override when a reading differs from visit defaults.
   * Keys are `VitalKey` strings; absent = inherit `measurementContext`.
   */
  vitalProvenance?: Record<string, MeasurementContext> | null;
  /**
   * vit-14: doctor-authored custom-vital VALUES for this visit. Each entry is
   * SELF-DESCRIBING (carries its own label/unit/kind snapshot) so the derived
   * text + historical render survive a later rename/removal of the per-doctor
   * definition (`doctor_settings.vitals_custom`). Absent/empty = none, which
   * keeps `deriveVitalsText` byte-identical for shipped-column rows (V3-D5).
   */
  vitalsCustom?: VitalsCustomValueEntry[] | null;
  /**
   * Optional per-vital notes keyed by registry `VitalKey`, cluster menu key,
   * or custom vital id. BP/glucose reading notes stay on reading rows.
   */
  vitalNotes?: Record<string, string> | null;
}

/**
 * vit-14: a single per-visit custom-vital value (self-describing snapshot).
 * `kind: "numeric"` → `value` is a finite number (with optional `unit`);
 * `kind: "text"` → `value` is a non-empty string.
 */
export interface VitalsCustomValueEntry {
  id: string;
  label: string;
  unit?: string | null;
  kind: "numeric" | "text";
  value: number | string;
  note?: string | null;
}

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
 * One structured finding entry within a system row (obj-31). Legacy string
 * findings in `examination_json` hydrate into this shape on load.
 */
export interface ExamFindingEntry {
  findingId: string;
  attributes?: Record<string, string>;
}

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
  findings?: ExamFindingEntry[];
  notes?: string | null;
}

/** Source of a structured test-result row (objective-tab / migration 154). */
export type TestResultSource = "patient_report" | "in_clinic_poc";

/** Clinical interpretation of a structured test-result row (migration 154). */
export type TestResultInterpretation = "normal" | "high" | "low" | "abnormal";

/**
 * One structured point-of-care / patient-brought result row stored in
 * `prescriptions.test_results_json` (objective-tab / migration 154). Mirrors
 * backend/src/types/prescription.ts:TestResultRow. `test_results` TEXT is
 * derived from this on save (OBJ-D2); patient-brought vs in-clinic POC share
 * one shape, discriminated by `source` (P5-D2).
 */
export interface TestResultRow {
  id: string;
  source: TestResultSource;
  name: string;
  value?: string | null;
  unit?: string | null;
  date?: string | null;
  interpretation?: TestResultInterpretation | null;
  notes?: string | null;
  /**
   * objective-reports / migration 159 — links this row to a `LabReport.id`
   * header. Absent or referencing an unknown header = ungrouped ("Other
   * results"). Optional → existing rows stay valid.
   */
  reportId?: string | null;
  /** Reference-range low bound for high/low flagging (migration 159). */
  refLow?: number | null;
  /** Reference-range high bound for high/low flagging (migration 159). */
  refHigh?: number | null;
  /** Non-numeric reference range, e.g. "Negative"/"<200" (migration 159). */
  refText?: string | null;
}

/** Report kind for a grouped lab/imaging panel (objective-reports / migration 159). */
export type LabReportKind = "lab" | "imaging";

/** How a lab report header was created (objective-reports / migration 159). */
export type LabReportEntryMethod = "manual" | "extracted";

/**
 * A lab / imaging report header that GROUPS structured `TestResultRow`s into a
 * verifiable panel, stored in `prescriptions.lab_reports_json` JSONB (migration
 * 159). Mirrors backend/src/types/prescription.ts:LabReport. Rows link via
 * `TestResultRow.reportId`; an unknown/absent reportId collapses to ungrouped
 * ("Other results"). `entryMethod` distinguishes manual entry from
 * extracted-then-verified (rpt-05). Report headers / ranges do NOT leak into the
 * derived `test_results` TEXT — OBJ-D2 stays byte-identical.
 */
export interface LabReport {
  id: string;
  kind: LabReportKind;
  title: string;
  reportDate?: string | null;
  labName?: string | null;
  attachmentIds: string[];
  /** Imaging narrative / impression (imaging reports). */
  findings?: string | null;
  entryMethod: LabReportEntryMethod;
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
  /**
   * assessment-tab / migration 160 — clinical-impression note + visit acuity.
   * Both nullable; clinician-only (ASMT-D5), never on patient output.
   */
  assessment_note?: string | null;
  assessment_acuity?: AssessmentAcuity | null;
  /**
   * assessment-tab / migration 161 — structured diagnosis rows. Primary label
   * derives into `provisional_diagnosis` on save (ASMT-D4). Empty = legacy
   * free-text passthrough.
   */
  diagnoses_json?: DiagnosisRow[];
  /** @deprecated API alias — prefer `investigations_orders`. */
  investigations?: string | null;
  investigations_orders?: string | null;
  /**
   * Structured investigation orders (migration 167 / inv-lib-05). Additive; the
   * flat `investigations_orders` string stays authoritative for display.
   */
  investigations_orders_json?: InvestigationOrder[];
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
  /** vitals-section / migration 156 — json-backed extended vitals (additive). */
  vitals_json?: VitalsJson;
  examination_findings?: string | null;
  /** objective-tab / migration 150 — structured per-system exam findings. */
  examination_json?: ExamSystemFinding[];
  differential_diagnosis?: string[] | null;
  advice?: string | null;
  follow_up_value?: number | null;
  follow_up_unit?: FollowUpUnit | null;
  referral?: string | null;
  test_results?: string | null;
  /** objective-tab / migration 154 — structured test results. `test_results` is derived from this on save (OBJ-D2). */
  test_results_json?: TestResultRow[];
  /** objective-reports / migration 159 — lab/imaging report headers grouping test-result rows (PHI). */
  lab_reports_json?: LabReport[];
  complaints?: Complaint[];
  family_history?: string | null;
  family_history_structured?: import("@/lib/cockpit/family-history").FamilyHistoryStructured | null;
  social_history?: string | null;
  social_history_structured?: import("@/lib/cockpit/social-history").SocialHistoryStructured | null;
  past_surgical_history?: string | null;
  past_surgical_history_structured?: import("@/lib/cockpit/past-surgical-history").PastSurgicalHistoryStructured | null;
  custom_subsections?: CustomSubsection[];
  /** assessment-plan-custom-sections / migration 177 — custom Assessment sections (depth-2). */
  assessment_custom_sections?: CustomSubsection[];
  /** assessment-plan-custom-sections / migration 177 — custom Plan sections (depth-2). */
  plan_custom_sections?: CustomSubsection[];
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
  /** assessment-plan-custom-sections — custom Assessment sections (depth-2). */
  assessmentCustomSections?: CustomSubsection[];
  /** assessment-plan-custom-sections — custom Plan sections (depth-2). */
  planCustomSections?: CustomSubsection[];
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
  /** vitals-section / migration 156 — json-backed extended vitals (additive). */
  vitalsJson?: VitalsJson;
  examinationFindings?: string | null;
  /** objective-tab / migration 150 — structured per-system exam findings. */
  examinationJson?: ExamSystemFinding[];
  differentialDiagnosis?: string[] | null;
  /**
   * assessment-tab / migration 160 — clinical-impression note + visit acuity.
   * Optional/nullable; clinician-only (ASMT-D5).
   */
  assessmentNote?: string | null;
  assessmentAcuity?: AssessmentAcuity | null;
  /**
   * assessment-tab / migration 161 — structured diagnoses. `provisionalDiagnosis`
   * TEXT is derived from the primary label on save (ASMT-D4).
   */
  diagnosesJson?: DiagnosisRow[];
  /**
   * Structured investigation orders (migration 167 / inv-lib-05). Derived from
   * the order labels on save; the flat `investigations` string stays
   * authoritative for output (INV-D8).
   */
  investigationsOrdersJson?: InvestigationOrder[];
  advice?: string | null;
  followUpValue?: number | null;
  followUpUnit?: FollowUpUnit | null;
  referral?: string | null;
  testResults?: string | null;
  /** objective-tab / migration 154 — structured test results. `testResults` is derived from this on save (OBJ-D2). */
  testResultsJson?: TestResultRow[];
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
