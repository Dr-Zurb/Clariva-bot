/**
 * Appointment types aligned with backend API and CONTRACTS.
 * API returns snake_case; use as received for display.
 * @see CONTRACTS.md, DB_SCHEMA.md
 */

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

/**
 * Consultation modality persisted on the appointment row at booking time.
 * Mirrors backend `appointments.consultation_type` (text|voice|video|in_clinic).
 * Plan 04 / Task 20: drives the primary CTA in `<ConsultationLauncher>`.
 */
export type ConsultationModality = "text" | "voice" | "video" | "in_clinic";

/**
 * Derived nested summary the API attaches in place of the dropped legacy
 * `consultation_room_sid` / `consultation_started_at` /
 * `consultation_ended_at` columns (Task 35). Populated by the backend
 * appointment-service enrichment layer from the latest
 * `consultation_sessions` row for the appointment.
 *
 * `provider_session_id` replaces the old `consultation_room_sid` as the
 * "has a consultation been started?" boolean gate. `actual_started_at`
 * and `actual_ended_at` replace the two matching timestamp columns.
 */
export interface ConsultationSessionSummary {
  id: string;
  modality: "text" | "voice" | "video";
  status: "scheduled" | "live" | "ended" | "no_show" | "cancelled";
  provider: string;
  provider_session_id: string | null;
  actual_started_at: string | null;
  actual_ended_at: string | null;
}

export interface Appointment {
  id: string;
  doctor_id: string;
  patient_id?: string | null;
  patient_name: string;
  patient_phone: string;
  appointment_date: string; // ISO 8601 from API
  status: AppointmentStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  /** Booked modality. May be absent on legacy rows; treat absence as 'video' (the v0 default). */
  consultation_type?: ConsultationModality | null;
  // Consultation lifecycle persisted directly on appointments (migration 021
  // — still active post-Task-35; these fields drive payout verification).
  doctor_joined_at?: string | null;
  patient_joined_at?: string | null;
  consultation_duration_seconds?: number | null;
  verified_at?: string | null;
  clinical_notes?: string | null;
  /**
   * Compact `consultation_sessions` summary (Task 35). `null` / `undefined`
   * when no consultation row exists yet for this appointment.
   */
  consultation_session?: ConsultationSessionSummary | null;
}

export interface AppointmentsListData {
  appointments: Appointment[];
}

export interface AppointmentDetailData {
  appointment: Appointment;
}
