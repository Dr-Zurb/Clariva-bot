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

/** Summary for list endpoint (e-task-3). */
export interface PatientSummary {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medical_record_number?: string | null;
  last_appointment_date?: string | null;
  created_at: string;
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
