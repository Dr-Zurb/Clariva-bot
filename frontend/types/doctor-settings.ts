/**
 * Doctor settings types aligned with backend API.
 * @see backend/src/types/doctor-settings.ts, e-task-2
 */

export interface DoctorSettings {
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

/** Partial update payload for PATCH */
export type PatchDoctorSettingsPayload = Partial<{
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
  /** Appointment fee in smallest unit (paise INR, cents USD). e.g. 50000 = ₹500 */
  appointment_fee_minor: number | null;
  /** Currency code e.g. INR, USD */
  appointment_fee_currency: string | null;
}>;
