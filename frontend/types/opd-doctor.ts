/**
 * Doctor-only OPD queue row.
 *
 * **Privacy contract (OQ-D1, OQ-D7):**
 * Mirrors backend/src/services/opd-doctor-service.ts § DoctorQueueSessionRow.
 * Returned ONLY for the authenticated doctor. The doctor is already authorized
 * to see full PHI on every adjacent surface; initials masking from e-task-opd-06
 * was a misapplied rule and is removed by OQ-D1.
 *
 * Any future patient-facing / receptionist / kiosk surface MUST consume a
 * different endpoint with its own filtered payload — DO NOT reuse this shape.
 */
export interface DoctorQueueSessionRow {
  entryId: string;
  appointmentId: string;
  tokenNumber: number;
  position: number;
  queueStatus: string;
  sessionDate: string;
  queueCreatedAt: string;

  patientName: string;
  medicalRecordNumber: string | null;
  patientPhone: string;

  age: number | null;
  gender: string | null;

  appointmentStatus: string;
  scheduledAt: string;
  reasonForVisit: string | null;
  serviceLabel: string | null;
  catalogServiceKey: string | null;
  consultationType: string | null;

  episodeId: string | null;
  opdEventType: 'standard' | 'return_after_completed' | null;

  /** appointments.patient_id — null for walk-ins with no linked patient row. */
  patientId: string | null;
  /** appointments.notes — booking message from patient (PHI; doctor-scoped). */
  patientNote: string | null;
}

// ── Slot session (sl-01) ───────────────────────────────────────────────────

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
  position: number;
  slotStatus: SlotStatus;
  appointmentStatus: string;
  scheduledAt: string;
  durationMinutes: number | null;

  patientName: string;
  medicalRecordNumber: string | null;
  patientPhone: string;

  age: number | null;
  gender: string | null;

  reasonForVisit: string | null;
  serviceLabel: string | null;
  catalogServiceKey: string | null;
  consultationType: string | null;

  delayMinutes: number | null;
  earlyInviteExpiresAt: string | null;
  earlyInviteResponse: 'accepted' | 'declined' | null;

  episodeId: string | null;
  opdEventType: 'standard' | 'return_after_completed' | null;

  patientId: string | null;
  patientNote: string | null;
}

export interface SlotSessionCounts {
  all: number;
  upcoming: number;
  running_late: number;
  in_consultation: number;
  completed: number;
  missed: number;
  cancelled: number;
  overflow: number;
}
