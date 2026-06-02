/**
 * Doctor Rx Template frontend types (EHR Sub-batch B1 / T2.11 + T2.12).
 *
 * Mirrors backend/src/types/rx-template.ts. Snake_case for the row
 * shape (PostgREST output); camelCase for the per-medicine entries
 * inside `medicines_json` (matches `MedicinePayload`).
 */

import type {
  DurationUnit,
  FrequencyCode,
  RouteCode,
} from "@/types/prescription";

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
}

export type CreateRxTemplatePayload = RxTemplatePayload & { name: string };
export type UpdateRxTemplatePayload = RxTemplatePayload;
