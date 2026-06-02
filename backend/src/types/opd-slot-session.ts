/**
 * Doctor-only OPD slot session row (sl-01).
 *
 * **Privacy contract:** identical to DoctorQueueSessionRow — returned only to
 * the authenticated doctor whose `doctor_id` matches the queried session.
 * Doctor is already authorized to see full PHI on adjacent surfaces.
 */
export type SlotStatus =
  | 'upcoming'
  | 'grace'
  | 'running_late'
  | 'in_consultation'
  | 'completed'
  | 'missed'
  | 'cancelled'
  | 'overflow';

export interface SlotSessionRow {
  appointmentId: string;
  /** Position in the day's chronological order (1-based, after sort by appointment_date). */
  position: number;
  /** Server-derived from appointments.status + appointment_date + consultation_sessions.status + grace policy. */
  slotStatus: SlotStatus;
  /** Original DB status — for UI affordances that need raw appointment.status (e.g., 'pending' vs 'confirmed'). */
  appointmentStatus: string;
  /** Slot start time. ISO string in UTC; client renders in doctor TZ. */
  scheduledAt: string;
  /** Slot duration in minutes if known (consultation_type-derived); null otherwise. */
  durationMinutes: number | null;

  // Patient identity (PHI — doctor-scoped)
  patientName: string;
  medicalRecordNumber: string | null;
  patientPhone: string;

  // Demographics (optional)
  age: number | null;
  gender: string | null;

  // Visit details
  reasonForVisit: string | null;
  serviceLabel: string | null;
  catalogServiceKey: string | null;
  consultationType: string | null;

  // Slot-specific state
  /** From appointments.opd_session_delay_minutes (mig 030). */
  delayMinutes: number | null;
  /** ISO; from appointments.opd_early_invite_expires_at (mig 029). null when no offer. */
  earlyInviteExpiresAt: string | null;
  /** From appointments.opd_early_invite_response (mig 029). */
  earlyInviteResponse: 'accepted' | 'declined' | null;

  // Episode / return-flow markers
  episodeId: string | null;
  /** From appointments.opd_event_type (mig 031). */
  opdEventType: 'standard' | 'return_after_completed' | null;

  // Inline-expand panel fields
  patientId: string | null;
  patientNote: string | null;
}

export interface SlotSessionCounts {
  all: number;
  upcoming: number; // includes 'grace'
  running_late: number;
  in_consultation: number;
  completed: number;
  missed: number;
  cancelled: number;
  overflow: number;
}

export interface SlotSessionPayload {
  entries: SlotSessionRow[];
  counts: SlotSessionCounts;
  snapshotAt: string; // ISO
  date: string; // YYYY-MM-DD echo
}
