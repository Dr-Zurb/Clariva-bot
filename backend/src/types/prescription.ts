/**
 * Prescription Types (Prescription V1)
 *
 * Types for prescriptions, prescription_medicines, prescription_attachments.
 * PHI: diagnosis, medications, clinical notes.
 */

export type PrescriptionType = 'structured' | 'photo' | 'both';

/**
 * Structured follow-up unit (cockpit-v2 / migration 103, DL-28).
 *
 * Lifted from the migration's CHECK constraint
 * (`prescriptions_follow_up_unit_chk`) to keep TS in lockstep with
 * the DB. If you change either side, change both. `as_needed` carries
 * no numeric value (the pairing CHECK enforces this).
 */
export type FollowUpUnit = 'days' | 'weeks' | 'months' | 'as_needed';

export interface Prescription {
  id: string;
  appointment_id: string;
  episode_id: string | null;
  patient_id: string | null;
  doctor_id: string;
  type: PrescriptionType;
  cc: string | null;
  hopi: string | null;
  provisional_diagnosis: string | null;
  /**
   * Investigations / tests the doctor has ORDERED (e.g. "CBC, LFT").
   * Renamed from `investigations` in migration 103 (cockpit-v2). Distinct
   * from `test_results`, which carries the doctor's interpretation of
   * returned results.
   */
  investigations_orders: string | null;
  /**
   * Legacy free-text follow-up. STAYS for the cockpit-v2 deprecation
   * window — the new structured form populates it on send as the
   * rendered "<value> <unit>" string. Phase 3 drops it.
   */
  follow_up: string | null;
  patient_education: string | null;
  clinical_notes: string | null;
  sent_to_patient_at: string | null;
  created_at: string;
  updated_at: string;

  // --------------------------------------------------------------------------
  // cockpit-v2 / migration 103 / DL-28 — structured SOAP fields.
  // All NULLABLE: doctor mid-call can save a draft with only CC + Dx.
  // --------------------------------------------------------------------------

  // Objective — structured vitals (replaces the free-text vitals tracker).
  vitals_bp_systolic: number | null;
  vitals_bp_diastolic: number | null;
  vitals_hr: number | null;
  vitals_temp_c: number | null;
  vitals_spo2: number | null;
  vitals_wt_kg: number | null;
  vitals_ht_cm: number | null;

  // Objective — free-text examination findings.
  examination_findings: string | null;

  // Assessment — differential-diagnosis list. NULL = not recorded;
  // the cockpit coerces empty array `[]` → NULL on save.
  differential_diagnosis: string[] | null;

  // Plan — advice, structured follow-up, referral, test_results.
  advice: string | null;
  follow_up_value: number | null;
  follow_up_unit: FollowUpUnit | null;
  referral: string | null;
  test_results: string | null;
}

/**
 * EHR Sub-batch B1 / T2-D4 enums. Lifted from the migration 090
 * CHECK constraint to keep TS in lockstep with the DB. If you change
 * either side, change both.
 */
export type FrequencyCode =
  | 'OD'
  | 'BID'
  | 'TID'
  | 'QID'
  | 'QHS'
  | 'PRN'
  | 'STAT'
  | 'CUSTOM';

export type DurationUnit =
  | 'days'
  | 'weeks'
  | 'months'
  | 'until-finished'
  | 'continue';

export type RouteCode =
  | 'oral'
  | 'IV'
  | 'IM'
  | 'SC'
  | 'topical'
  | 'inhaled'
  | 'rectal'
  | 'nasal'
  | 'sublingual'
  | 'other';

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
  // EHR Sub-batch B1 / T2.9 — structured columns. NULL on legacy rows
  // and on rows where the doctor entered free-text without picking
  // structured values.
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
 * Lightweight summary row for the EHR "Previous prescriptions" panel
 * (T1.6). Excludes full body fields (cc/hopi/investigations_orders/
 * follow_up/patient_education/clinical_notes) and per-medicine detail; the panel
 * only renders the headline + medicine count + a link / expand affordance
 * that hits the existing detail endpoint.
 *
 * The shape is locked because B1's "copy from last visit" task (T2.14)
 * is expected to reuse this same surface — see master batch §B1.
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
 * Input shape for a single medicine row (camelCase). T2.9 added the
 * structured fields; all are optional + nullable so legacy callers
 * (which only know about the free-text fields) remain valid payloads.
 */
export interface MedicineInput {
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

/**
 * cockpit-v2 / migration 103 / DL-28 — shared structured-SOAP input
 * shape. Used by both create and update inputs to keep the camelCase
 * cockpit form payload in lockstep with the snake_case DB row. All
 * fields nullable / optional: cv2-05's section components can save
 * partial drafts.
 */
export interface StructuredSoapInput {
  // Objective — vitals
  vitalsBpSystolic?: number | null;
  vitalsBpDiastolic?: number | null;
  vitalsHr?: number | null;
  vitalsTempC?: number | null;
  vitalsSpo2?: number | null;
  vitalsWtKg?: number | null;
  vitalsHtCm?: number | null;

  // Objective — exam findings
  examinationFindings?: string | null;

  // Assessment — DDx
  differentialDiagnosis?: string[] | null;

  // Plan — advice / structured follow-up / referral / test results
  advice?: string | null;
  followUpValue?: number | null;
  followUpUnit?: FollowUpUnit | null;
  referral?: string | null;
  testResults?: string | null;
}

/** Input for creating a prescription (camelCase from API) */
export interface CreatePrescriptionInput extends StructuredSoapInput {
  appointmentId: string;
  patientId?: string | null;
  type: PrescriptionType;
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  /**
   * Investigations / tests ORDERED by the doctor. Camel-case public-API
   * field name stays as `investigations` for the cockpit-v2 deprecation
   * window even though the DB column is now `investigations_orders`;
   * `TODO(cv2-07)` renames the field to `investigationsOrders` once the
   * cockpit form & all external callers migrate.
   */
  investigations?: string | null;
  /**
   * Legacy free-text follow-up. STAYS for backwards-compat; new clients
   * should populate `followUpValue` + `followUpUnit` instead. Phase 3
   * drops both this field and the underlying column.
   */
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: MedicineInput[];
}

/** Input for updating a prescription (partial) */
export interface UpdatePrescriptionInput extends StructuredSoapInput {
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  /** See `CreatePrescriptionInput.investigations` — same deprecation note. */
  investigations?: string | null;
  /** See `CreatePrescriptionInput.followUp` — same deprecation note. */
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: MedicineInput[];
}
