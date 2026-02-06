/**
 * Doctor Settings Type Definitions (e-task-4.1)
 *
 * Per-doctor appointment fee and currency (and optional country).
 * When a value is null, the app uses env fallback.
 */

export interface DoctorSettingsRow {
  doctor_id: string;
  appointment_fee_minor: number | null;
  appointment_fee_currency: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Resolved values for payment link creation.
 * Non-null from DB; fallback applied by caller from env.
 */
export interface DoctorPaymentSettings {
  amountMinor: number;
  currency: string;
  doctorCountry: string;
}
