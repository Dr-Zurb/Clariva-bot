/** Axis 3 — chips. Declared early so queue + slot rows can share it. */
export type SlotTag =
  | 'overflow'
  | 'walk_in'
  | 'return_visit'
  | 'rebooked'
  | 'early_invited'
  | 'delayed'
  | 'doctor_away'
  | 'patient_waiting'
  | 'patient_stepped_away';

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
  /** Desk or lobby arrival stamp (RQ6). */
  patientCheckedInAt?: string | null;

  /** Lobby presence tags (crc-02). Optional for older payloads. */
  tags?: SlotTag[];
}

// ── Slot session (sl-01 / osm-02) ───────────────────────────────────────────

/**
 * @deprecated Prefer `VisitLifecycle` + `SlotTiming` + `SlotTag` (OSM-D1).
 * Kept for one release (OSM-D7). `grace` is legacy and unemitted.
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

/** Axis 1 — primary badge. */
export type VisitLifecycle =
  | 'scheduled'
  | 'in_consult'
  | 'incomplete'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Axis 2 — null when lifecycle is terminal. */
export interface SlotTiming {
  minutesToStart: number;
  band: 'early' | 'due' | 'late';
}

export interface SlotSessionRow {
  appointmentId: string;
  position: number;
  /**
   * @deprecated OSM-D7 compat. Prefer `lifecycle` / `timing` / `tags`.
   */
  slotStatus: SlotStatus;
  /** Axis 1 — present from osm-02; optional for older payloads. */
  lifecycle?: VisitLifecycle;
  /** Axis 2 */
  timing?: SlotTiming | null;
  /** Axis 3 */
  tags?: SlotTag[];
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
  /** Desk or lobby arrival stamp (RQ6). */
  patientCheckedInAt?: string | null;
}

export interface SlotSessionCounts {
  all: number;
  upcoming: number;
  running_late: number;
  in_consultation: number;
  /** osm-02 — session started, not live, appointment not completed. */
  incomplete?: number;
  completed: number;
  missed: number;
  cancelled: number;
  overflow: number;
}
