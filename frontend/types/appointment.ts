/**
 * Appointment types aligned with backend API and CONTRACTS.
 * API returns snake_case; use as received for display.
 * @see CONTRACTS.md, DB_SCHEMA.md
 */

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed";

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
}

export interface AppointmentsListData {
  appointments: Appointment[];
}

export interface AppointmentDetailData {
  appointment: Appointment;
}
