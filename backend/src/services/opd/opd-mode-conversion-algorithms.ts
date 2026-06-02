/**
 * OPD per-day mode conversion — pure algorithms (pdm-04).
 *
 * Split out from `opd-mode-conversion-service.ts` so unit tests can exercise
 * the algorithms without dragging in the orchestrator's heavy import graph
 * (`@react-pdf/renderer` lives downstream of `appointment-service.ts`,
 * which Jest's CJS transformer can't parse without an extra Babel preset).
 *
 * Two helpers, both deterministic and side-effect-free:
 *
 *   - `applySlotToQueue(appointments)` — DL-4 slot→queue token assignment.
 *   - `applyQueueToSlot(appointments, grid)` — DL-4 queue→slot mounting +
 *     overflow placement.
 *
 * Plus one PD-Q4 detector (`isTelemedModality`) the orchestrator uses to
 * compute the `telemedCount` field for the conversion preview dialog.
 *
 * @see backend/src/services/opd/opd-mode-conversion-service.ts
 */

// ============================================================================
// Types — pure helper inputs / outputs
// ============================================================================

/** Slot-mode appointment fed into `applySlotToQueue`. */
export interface SlotAppointmentInput {
  id: string;
  /** ISO datetime — the original slot time. */
  appointmentDate: string;
  /** ISO datetime — used for stable tiebreak when two rows share `appointmentDate`. */
  createdAt: string;
  status: 'pending' | 'confirmed';
  opdSessionDelayMinutes: number | null;
  opdEarlyInviteExpiresAt: string | null;
  opdEarlyInviteResponse: string | null;
}

/** Queue-mode appointment fed into `applyQueueToSlot`. */
export interface QueueAppointmentInput {
  id: string;
  /** ISO datetime — last known scheduled time on the row. */
  appointmentDate: string;
  tokenNumber: number;
  status: 'pending' | 'confirmed';
}

/** Pre-computed slot grid the orchestrator hands to `applyQueueToSlot`. */
export interface SlotGrid {
  /** ISO datetime — first slot's start (informational). */
  sessionStartIso: string;
  /** ISO datetime — exclusive end-of-session boundary. Overflow rows extend past this. */
  sessionEndIso: string;
  /** Slot interval in minutes (drives overflow spacing). */
  intervalMinutes: number;
  /**
   * Array of slot start ISO datetimes inside the day's working windows.
   * Sorted ascending. Length === 0 is a valid input — every queue
   * appointment lands in overflow.
   */
  slots: string[];
}

export type SlotOnlyClearField =
  | 'opd_session_delay_minutes'
  | 'opd_early_invite_expires_at'
  | 'opd_early_invite_response';

export interface QueueAssignment {
  appointmentId: string;
  tokenNumber: number;
  clearFields: SlotOnlyClearField[];
}

export interface SlotToQueueResult {
  assignments: QueueAssignment[];
  /** One notification per affected patient. Equals `assignments.length`. */
  notificationCount: number;
}

export interface SlotAssignment {
  appointmentId: string;
  /** ISO datetime — new appointment_date to write. */
  newAppointmentDate: string;
  /** True iff this row falls past the grid capacity. */
  isOverflow: boolean;
  opdEventType: 'standard' | 'return_after_completed';
}

export interface QueueToSlotResult {
  assignments: SlotAssignment[];
  /** Number of assignments with `isOverflow === true`. */
  overflowCount: number;
  /** One notification per affected patient. Equals `assignments.length`. */
  notificationCount: number;
}

// ============================================================================
// Pure helpers
// ============================================================================

const SLOT_ONLY_CLEAR_FIELDS: SlotOnlyClearField[] = [
  'opd_session_delay_minutes',
  'opd_early_invite_expires_at',
  'opd_early_invite_response',
];

/**
 * Slot → queue (DL-4, lossless): rank by `(appointmentDate, createdAt)` and
 * assign tokens `1..N` in order. The caller writes `opd_queue_entries` rows
 * and clears the slot-only state fields listed in `clearFields`. The
 * appointment's `appointment_date` is NOT modified so a reverse flip is
 * lossless.
 *
 * Idempotent: empty input returns empty result; caller may short-circuit.
 */
export function applySlotToQueue(
  appointments: SlotAppointmentInput[]
): SlotToQueueResult {
  const sorted = [...appointments].sort((a, b) => {
    const dateDiff =
      new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const assignments: QueueAssignment[] = sorted.map((apt, index) => ({
    appointmentId: apt.id,
    tokenNumber: index + 1,
    clearFields: [...SLOT_ONLY_CLEAR_FIELDS],
  }));

  return {
    assignments,
    notificationCount: assignments.length,
  };
}

/**
 * Queue → slot (DL-4, may overflow): rank by `tokenNumber` ASC. The first
 * `min(N, grid.slots.length)` rows land on `grid.slots[index]`. Surplus
 * rows overflow past `grid.sessionEndIso` at
 * `(overflow_index + 1) * grid.intervalMinutes` increments and receive
 * `opd_event_type = 'return_after_completed'`.
 *
 * Empty-grid case: every queue appointment falls into overflow with
 * sequential `overflow_index` starting at 0. The doctor will see them in
 * the post-session overflow tray rather than mounted to a slot.
 */
export function applyQueueToSlot(
  appointments: QueueAppointmentInput[],
  grid: SlotGrid
): QueueToSlotResult {
  const sorted = [...appointments].sort(
    (a, b) => a.tokenNumber - b.tokenNumber
  );
  const capacity = grid.slots.length;
  const sessionEndMs = new Date(grid.sessionEndIso).getTime();
  const intervalMs = grid.intervalMinutes * 60 * 1000;

  const assignments: SlotAssignment[] = [];
  let overflowCount = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const apt = sorted[index]!;
    if (index < capacity) {
      assignments.push({
        appointmentId: apt.id,
        newAppointmentDate: grid.slots[index]!,
        isOverflow: false,
        opdEventType: 'standard',
      });
    } else {
      const overflowIndex = index - capacity;
      const overflowMs = sessionEndMs + (overflowIndex + 1) * intervalMs;
      assignments.push({
        appointmentId: apt.id,
        newAppointmentDate: new Date(overflowMs).toISOString(),
        isOverflow: true,
        opdEventType: 'return_after_completed',
      });
      overflowCount += 1;
    }
  }

  return {
    assignments,
    overflowCount,
    notificationCount: assignments.length,
  };
}

// ============================================================================
// Telemed-modality detection (PD-Q4 — drives the dialog warning)
// ============================================================================

const TELEMED_CONSULTATION_TYPES = new Set(['text', 'voice', 'video', 'chat']);

/**
 * Whether the appointment's `consultation_type` belongs to a telemedicine
 * modality (text / voice / video / chat). In-clinic visits return false.
 * PD-Q4 advisory copy is driven by the count of telemed appointments in
 * the conversion preview.
 */
export function isTelemedModality(consultationType: string | null | undefined): boolean {
  if (!consultationType) return false;
  return TELEMED_CONSULTATION_TYPES.has(consultationType.trim().toLowerCase());
}
