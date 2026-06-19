/**
 * Doctor Rx Template Types (EHR Sub-batch B1 / T2.11).
 *
 * Per-doctor saved Rx blueprints. Snake_case mirrors the DB row shape.
 * Medicine entries inside `medicines_json` use camelCase to match the
 * `MedicineInput` shape exposed via the prescription create/update APIs
 * — Apply (T2.12) just spreads each entry straight into the Rx form
 * state without rekeying.
 */

import type {
  CustomSubsection,
  DoseUnit,
  DurationUnit,
  FoodTiming,
  FrequencyCode,
  PrescriptionComplaint,
  RouteCode,
  SocialHistoryStructured,
  FamilyHistoryStructured,
  PastSurgicalHistoryStructured,
} from './prescription';

/**
 * Template subsection scope (subj-15). One table, one discriminator.
 * `custom_block` (subj-39) carries a single doctor-defined custom Subjective
 * subsection inside `subjective_json.customSubsections`.
 */
export const RX_TEMPLATE_SCOPE_VALUES = [
  'subjective_full',
  'chief_complaints',
  'past_medical',
  'past_surgical',
  'family_history',
  'social_history',
  'allergies',
  'custom_block',
] as const;

export type RxTemplateScope = (typeof RX_TEMPLATE_SCOPE_VALUES)[number];

/** Structured subjective bundle stored in `subjective_json` (subj-08). */
export interface RxTemplateSubjective {
  complaints?: PrescriptionComplaint[];
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

/** PMH condition snapshot inside `pmh_json` (subj-17). Recreate-able subset. */
export interface RxTemplatePmhCondition {
  condition: string;
  status?: 'active' | 'resolved';
  note?: string | null;
}

/** PMH medication snapshot inside `pmh_json` (subj-17). Applied as additional meds. */
export interface RxTemplatePmhMedication {
  drugName: string;
  dose?: string | null;
  strength?: string | null;
  frequency?: string | null;
  status?: 'active' | 'past';
  form?: string | null;
  note?: string | null;
}

/** Snapshot of a patient's PMH chart slice stored in `pmh_json` (subj-17). */
export interface RxTemplatePmh {
  conditions?: RxTemplatePmhCondition[];
  medications?: RxTemplatePmhMedication[];
}

/** Allergy snapshot inside `allergies_json` (subj-17). Recreate-able subset. */
export interface RxTemplateAllergyEntry {
  allergen: string;
  severity?: 'mild' | 'moderate' | 'severe' | 'unknown';
  reaction?: string | null;
}

/** Snapshot of a patient's allergy chart slice stored in `allergies_json` (subj-17). */
export interface RxTemplateAllergies {
  allergies?: RxTemplateAllergyEntry[];
}

/**
 * Shape of a single medicine inside `doctor_rx_templates.medicines_json`.
 * Mirrors `MedicineInput` (camelCase) so Apply can hand the array
 * straight to <PrescriptionForm>'s state.
 */
export interface RxTemplateMedicine {
  drugMasterId?: string | null;
  medicineName: string;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  sortOrder?: number;
  // T2.9 structured fields
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
  pmh_json: RxTemplatePmh;
  allergies_json: RxTemplateAllergies;
  scope: RxTemplateScope;
  use_count: number;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Shared input shape for create + update (PATCH is partial). */
export interface RxTemplateInput {
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
  pmh?: RxTemplatePmh;
  allergies?: RxTemplateAllergies;
  scope?: RxTemplateScope;
}

/** `name` is required on create; everything else is optional. */
export type CreateRxTemplateInput = RxTemplateInput & { name: string };

/** Update shape — at least one field required (enforced at validation). */
export type UpdateRxTemplateInput = RxTemplateInput;
