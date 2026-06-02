import type { SlotStatus } from '../../types/opd-slot-session';

export interface DeriveSlotStatusInput {
  appointmentStatus: string;
  scheduledAtMs: number;
  nowMs: number;
  graceMinutes: number;
  consultationLive: boolean;
  opdEventType: 'standard' | 'return_after_completed' | null;
  /** True iff this appointment was created after the day's last originally-booked slot. */
  isAppendedAfterDay: boolean;
}

/**
 * Server-derived slotStatus (DL-3, sl-01).
 *
 * Order of precedence (first match wins):
 *   1. cancelled
 *   2. completed
 *   3. in_consultation       (consultation_sessions.status = 'live')
 *   4. missed                (appointments.status = 'no_show')
 *   5. overflow              (opd_event_type = 'return_after_completed' OR appended after day)
 *   6. upcoming              (now < scheduledAt - graceMinutes)
 *   7. grace                 (now within ±graceMinutes of scheduledAt, no live consult)
 *   8. running_late          (now > scheduledAt + graceMinutes, no live consult, not no_show)
 */
export function deriveSlotStatus(input: DeriveSlotStatusInput): SlotStatus {
  if (input.appointmentStatus === 'cancelled') return 'cancelled';
  if (input.appointmentStatus === 'completed') return 'completed';
  if (input.consultationLive) return 'in_consultation';
  if (input.appointmentStatus === 'no_show') return 'missed';
  if (input.opdEventType === 'return_after_completed' || input.isAppendedAfterDay) {
    return 'overflow';
  }

  const graceMs = input.graceMinutes * 60_000;
  const startsIn = input.scheduledAtMs - input.nowMs;

  if (startsIn > graceMs) return 'upcoming';
  if (startsIn >= -graceMs) return 'grace';
  return 'running_late';
}
