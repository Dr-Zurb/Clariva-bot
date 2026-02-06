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
