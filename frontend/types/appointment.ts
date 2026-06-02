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

/**
 * CP-D6: sex value returned on the appointment payload — sourced from
 * `patients.gender` and narrowed to the three API-contracted values.
 * Kept separate from any `PatientGender` in patient.ts because the wire
 * format on the appointment surface only carries these three values.
 */
export type PatientSex = "male" | "female" | "other";

export interface Appointment {
  id: string;
  doctor_id: string;
  patient_id?: string | null;
  patient_name: string;
  patient_phone: string | null;
  /**
   * CP-D6: server-computed from patients.date_of_birth at fetch time.
   * Null when appointment.patient_id is null (legacy guest rows) or DOB
   * is unset on the patient record.
   */
  patient_age: number | null;
  /**
   * CP-D6: read directly from patients.gender. Null for guest rows
   * or patients with unset gender.
   */
  patient_sex: PatientSex | null;
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
  /**
   * CS-03: JOIN-derived from `opd_queue_entries.event_type`.
   * `'token'` for individual token slots; `'group'` for group/walk-in OPD events.
   * `null` / absent for non-queue appointments (no `opd_queue_entries` row).
   * Distinct from the appointments-table `opd_event_type` field (migration 031),
   * which carries 'standard' | 'return_after_completed' visit-type semantics.
   */
  opd_queue_event_type?: 'group' | 'token' | null;
  /**
   * CS-03: JOIN-derived from `opd_queue_entries.token_number`.
   * The patient's queue position token for the session.
   * `null` / absent for non-queue appointments.
   */
  opd_token_number?: number | null;
}

export interface AppointmentsListData {
  appointments: Appointment[];
}

export interface AppointmentDetailData {
  appointment: Appointment;
}
