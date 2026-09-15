/**
 * Doctor-only OPD slot session row (sl-01 / osm-02).
 *
 * **Privacy contract:** identical to DoctorQueueSessionRow — returned only to
 * the authenticated doctor whose `doctor_id` matches the queried session.
 * Doctor is already authorized to see full PHI on adjacent surfaces.
 */

/**
 * @deprecated Prefer `VisitLifecycle` + `SlotTiming` + `SlotTag` (OSM-D1).
 * Kept on the wire for one release (OSM-D7). `grace` is legacy and unemitted.
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

/** Axis 1 — exactly one. Primary badge. */
export type VisitLifecycle =
  | 'scheduled'
  | 'in_consult'
  | 'incomplete'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Axis 2 — present while non-terminal; null for completed|cancelled|no_show. */
export interface SlotTiming {
  /** Minutes until slot start; negative once past start. */
  minutesToStart: number;
  /**
   * `due` = still before start, within graceMinutes of start ("about to start").
   * `late` = now past slot start (no post-start grace on the doctor board).
   */
  band: 'early' | 'due' | 'late';
}

/** Axis 3 — zero or more chips. `doctor_away` is client-only (osm-03). */
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

export interface SlotSessionRow {
  appointmentId: string;
  /** Position in the day's chronological order (1-based, after sort by appointment_date). */
  position: number;
  /**
   * @deprecated OSM-D7 compat shim from lifecycle/timing/tags.
   * Prefer `lifecycle` / `timing` / `tags`.
   */
  slotStatus: SlotStatus;
  /** Axis 1 — primary badge. */
  lifecycle: VisitLifecycle;
  /** Axis 2 — null when lifecycle is terminal. */
  timing: SlotTiming | null;
  /** Axis 3 — provenance / modifiers. */
  tags: SlotTag[];
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
  /** Desk or lobby arrival stamp (RQ6). Null when not yet arrived. */
  patientCheckedInAt: string | null;
}

export interface SlotSessionCounts {
  all: number;
  /** lifecycle scheduled + timing early|due (legacy upcoming/grace band). */
  upcoming: number;
  /** lifecycle scheduled + timing late (and non-terminal with late timing). */
  running_late: number;
  in_consultation: number;
  /** Session started, not live, appointment not completed (OSM-D5). */
  incomplete: number;
  completed: number;
  missed: number;
  cancelled: number;
  /**
   * Tag `overflow` count. Overflow rows also count in their lifecycle / timing
   * buckets (OSM-D2) — no longer exclusive.
   */
  overflow: number;
}

export interface SlotSessionPayload {
  entries: SlotSessionRow[];
  counts: SlotSessionCounts;
  snapshotAt: string; // ISO
  date: string; // YYYY-MM-DD echo
}
