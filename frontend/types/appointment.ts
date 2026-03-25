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
  // Consultation (e-task-3, migration 021)
  consultation_room_sid?: string | null;
  consultation_started_at?: string | null;
  doctor_joined_at?: string | null;
  patient_joined_at?: string | null;
  consultation_ended_at?: string | null;
  consultation_duration_seconds?: number | null;
  verified_at?: string | null;
  clinical_notes?: string | null;
}

export interface AppointmentsListData {
  appointments: Appointment[];
}

export interface AppointmentDetailData {
  appointment: Appointment;
}
