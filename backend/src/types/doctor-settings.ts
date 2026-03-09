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
  practice_name: string | null;
  timezone: string;
  slot_interval_minutes: number;
  max_advance_booking_days: number;
  min_advance_hours: number;
  business_hours_summary: string | null;
  cancellation_policy_hours: number | null;
  max_appointments_per_day: number | null;
  booking_buffer_minutes: number | null;
  welcome_message: string | null;
  specialty: string | null;
  address_summary: string | null;
  consultation_types: string | null;
  default_notes: string | null;
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
