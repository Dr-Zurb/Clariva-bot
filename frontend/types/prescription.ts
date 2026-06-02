/**
 * Prescription types aligned with backend API (Prescription V1).
 * API returns snake_case; frontend uses camelCase for payloads.
 * @see backend/src/types/prescription.ts
 */

export type PrescriptionType = "structured" | "photo" | "both";

/** Structured follow-up unit (cockpit-v2 / migration 103). */
export type FollowUpUnit = "days" | "weeks" | "months" | "as_needed";

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
  examination_findings?: string | null;
  differential_diagnosis?: string[] | null;
  advice?: string | null;
  follow_up_value?: number | null;
  follow_up_unit?: FollowUpUnit | null;
  referral?: string | null;
  test_results?: string | null;
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
  | "CUSTOM";

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
  examinationFindings?: string | null;
  differentialDiagnosis?: string[] | null;
  advice?: string | null;
  followUpValue?: number | null;
  followUpUnit?: FollowUpUnit | null;
  referral?: string | null;
  testResults?: string | null;
}

/** Payload for creating a prescription (camelCase) */
export interface CreatePrescriptionPayload extends StructuredSoapPayload {
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
export interface UpdatePrescriptionPayload extends StructuredSoapPayload {
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  investigations?: string | null;
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: MedicinePayload[];
}
