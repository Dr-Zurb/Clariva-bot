/**
 * Doctor Rx Template frontend types (EHR Sub-batch B1 / T2.11 + T2.12).
 *
 * Mirrors backend/src/types/rx-template.ts. Snake_case for the row
 * shape (PostgREST output); camelCase for the per-medicine entries
 * inside `medicines_json` (matches `MedicinePayload`).
 */

import type {
  CustomSubsection,
  DoseUnit,
  DurationUnit,
  ExamSystemFinding,
  FoodTiming,
  FrequencyCode,
  RouteCode,
  Complaint,
  TestResultRow,
  VitalsBpLimb,
  VitalsBpPosture,
} from "@/types/prescription";
import type { SocialHistoryStructured } from "@/lib/cockpit/social-history";
import type { FamilyHistoryStructured } from "@/lib/cockpit/family-history";
import type { PastSurgicalHistoryStructured } from "@/lib/cockpit/past-surgical-history";

/**
 * Template subsection scope (subj-15). Mirrors backend RX_TEMPLATE_SCOPE_VALUES.
 * `custom_block` (subj-39) carries a single doctor-defined custom Subjective
 * subsection inside `subjective_json.customSubsections`.
 */
export const RX_TEMPLATE_SCOPE_VALUES = [
  "subjective_full",
  "chief_complaints",
  "past_medical",
  "past_surgical",
  "family_history",
  "social_history",
  "allergies",
  "custom_block",
  "objective_full",
  "vitals",
  "exam_systemic",
  "exam_general",
  "exam_cvs",
  "exam_resp",
  "exam_abd",
  "exam_cns",
  "objective_custom_block",
  "test_results",
  "point_of_care",
] as const;

export type RxTemplateScope = (typeof RX_TEMPLATE_SCOPE_VALUES)[number];

/** Structured subjective bundle in `subjective_json` (subj-08). */
export interface RxTemplateSubjective {
  complaints?: Complaint[];
  familyHistory?: string | null;
  familyHistoryStructured?: FamilyHistoryStructured | null;
  socialHistory?: string | null;
  socialHistoryStructured?: SocialHistoryStructured | null;
  pastSurgicalHistory?: string | null;
  pastSurgicalHistoryStructured?: PastSurgicalHistoryStructured | null;
  /**
   * Doctor-defined custom subsections (subj-39). `custom_block` templates carry
   * one; `subjective_full` may carry several. Optional — absent ⇒ today's
   * behaviour for every existing template.
   */
  customSubsections?: CustomSubsection[];
}

/**
 * Structured objective bundle in `objective_json` (obj-16). Mirrors backend
 * RxTemplateObjective: structured exam findings + the `vitals_*` subset +
 * `testResults` + doctor-defined custom objective sections. Config, not PHI.
 */
export interface RxTemplateObjective {
  examinationJson?: ExamSystemFinding[];
  vitalsBpSystolic?: number | null;
  vitalsBpDiastolic?: number | null;
  vitalsHr?: number | null;
  vitalsTempC?: number | null;
  vitalsSpo2?: number | null;
  vitalsWtKg?: number | null;
  vitalsHtCm?: number | null;
  vitalsRr?: number | null;
  vitalsPainScore?: number | null;
  vitalsGlucoseMgDl?: number | null;
  vitalsGcsTotal?: number | null;
  vitalsBpPosture?: VitalsBpPosture | null;
  vitalsBpLimb?: VitalsBpLimb | null;
  vitalsHeadCircumferenceCm?: number | null;
  vitalsMuacCm?: number | null;
  vitalsWaistCm?: number | null;
  testResults?: string | null;
  /** obj-23: structured POC / patient-brought result rows (mirror of test_results_json). */
  testResultsJson?: TestResultRow[];
  customSections?: CustomSubsection[];
}

/** PMH condition snapshot inside `pmh_json` (subj-17). */
export interface RxTemplatePmhCondition {
  condition: string;
  status?: "active" | "resolved";
  note?: string | null;
}

/** PMH medication snapshot inside `pmh_json` (subj-17). Applied as additional meds. */
export interface RxTemplatePmhMedication {
  drugName: string;
  dose?: string | null;
  strength?: string | null;
  frequency?: string | null;
  status?: "active" | "past";
  form?: string | null;
  note?: string | null;
}

/** Snapshot of a patient's PMH chart slice stored in `pmh_json` (subj-17). */
export interface RxTemplatePmh {
  conditions?: RxTemplatePmhCondition[];
  medications?: RxTemplatePmhMedication[];
}

/** Allergy snapshot inside `allergies_json` (subj-17). */
export interface RxTemplateAllergyEntry {
  allergen: string;
  severity?: "mild" | "moderate" | "severe" | "unknown";
  reaction?: string | null;
}

/** Snapshot of a patient's allergy chart slice stored in `allergies_json` (subj-17). */
export interface RxTemplateAllergies {
  allergies?: RxTemplateAllergyEntry[];
}

export interface RxTemplateMedicine {
  drugMasterId?: string | null;
  medicineName: string;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  sortOrder?: number;
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

export interface DoctorRxTemplate {
  id: string;
  doctor_id: string;
  name: string;
  description: string | null;
  cc: string | null;
  hopi: string | null;
  provisional_diagnosis: string | null;
  investigations: string | null;
  follow_up: string | null;
  patient_education: string | null;
  clinical_notes: string | null;
  medicines_json: RxTemplateMedicine[];
  subjective_json: RxTemplateSubjective;
  objective_json: RxTemplateObjective;
  pmh_json: RxTemplatePmh;
  allergies_json: RxTemplateAllergies;
  scope: RxTemplateScope;
  use_count: number;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Shared payload shape for create + update (PATCH is partial). */
export interface RxTemplatePayload {
  name?: string;
  description?: string | null;
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  investigations?: string | null;
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: RxTemplateMedicine[];
  subjective?: RxTemplateSubjective;
  objective?: RxTemplateObjective;
  pmh?: RxTemplatePmh;
  allergies?: RxTemplateAllergies;
  scope?: RxTemplateScope;
}

export type CreateRxTemplatePayload = RxTemplatePayload & { name: string };
export type UpdateRxTemplatePayload = RxTemplatePayload;
