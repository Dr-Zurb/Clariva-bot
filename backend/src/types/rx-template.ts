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
  DurationUnit,
  FrequencyCode,
  RouteCode,
} from './prescription';

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
}

/** `name` is required on create; everything else is optional. */
export type CreateRxTemplateInput = RxTemplateInput & { name: string };

/** Update shape — at least one field required (enforced at validation). */
export type UpdateRxTemplateInput = RxTemplateInput;
