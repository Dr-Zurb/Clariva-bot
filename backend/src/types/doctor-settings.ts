/**
 * Doctor Settings Type Definitions (e-task-4.1)
 *
 * Per-doctor appointment fee and currency (and optional country).
 * When a value is null, the app uses env fallback.
 *
 * Payout columns (migration 025): payout_schedule, payout_minor, razorpay_linked_account_id.
 * RBH-09 (migration 033): instagram_receptionist_paused, instagram_receptionist_pause_message.
 */

/** When doctor receives payouts. NULL = default weekly in payout service. */
export type PayoutSchedule = 'per_appointment' | 'daily' | 'weekly' | 'monthly';

/** OPD scheduling mode (migration 028, e-task-opd-01). */
export type OpdMode = 'slot' | 'queue';

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
  /** When doctor receives payouts. Migration 025. */
  payout_schedule: PayoutSchedule | null;
  /** Min amount (paise) before payout; NULL = pay any. Migration 025. */
  payout_minor: number | null;
  /** Razorpay Route Linked Account ID for India. Migration 025. */
  razorpay_linked_account_id: string | null;
  /** OPD: fixed slots vs token queue. Migration 028. Default slot. */
  opd_mode: OpdMode;
  /** Optional JSON policies (grace minutes, caps); keys documented in DB_SCHEMA. Migration 028. */
  opd_policies: Record<string, unknown> | null;
  /**
   * When true, automated Instagram DM replies and comment outreach (DM + public reply) are off.
   * Migration 033, RBH-09.
   */
  instagram_receptionist_paused: boolean;
  /** Optional custom patient-facing DM when paused; null = default copy (no “instant human” promise). */
  instagram_receptionist_pause_message: string | null;
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
