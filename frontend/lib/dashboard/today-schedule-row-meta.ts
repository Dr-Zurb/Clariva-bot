/**
 * Pure helper: maps an appointment + current time → display meta for a
 * TodaysSchedule row.
 *
 * Outcome-based styling replaces the old time-pastness opacity-60 heuristic
 * (pf-13 / plan-patient-seeing-flow.md § P4.3).
 *
 * Evaluation order (highest priority first):
 *   1. consultation_session.status === 'live'   → "live" (in-progress call)
 *   2. appointment.status === 'completed'        → "completed" (done, dimmed)
 *   3. status ∈ {cancelled, no_show}            → "cancelled" (strikethrough)
 *   4. active status + now > appt + threshold   → "late" (warning chip + no-show btn)
 *   5. active status + now > appt              → "amber" (soft nudge dot)
 *   6. else                                     → "normal"
 *
 * `now` is injected so callers can test this function deterministically.
 * In production, pass `new Date()`.
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-13-todays-schedule-outcomes.md
 */

import type { Appointment, AppointmentStatus } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RowVariant =
  | "live"       // call in progress — left accent + pulse dot
  | "completed"  // done — dimmed + green Done badge + ✓
  | "cancelled"  // cancelled or no_show — strikethrough + destructive badge
  | "late"       // past threshold — warning chip + Mark no-show button
  | "amber"      // just past appt_date — soft amber dot, no chip
  | "normal";    // future or not-yet-overdue

export type RowBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "warning";

export interface RowMeta {
  variant: RowVariant;
  /** Apply opacity-60 to the whole row. */
  dimmed: boolean;
  /** Apply line-through to the patient name. */
  strikethrough: boolean;
  /** Left green accent border (live row). */
  accentBorder: boolean;
  /** Pulsing green dot (live). */
  pulseDot: boolean;
  /** Small amber dot (silent nudge — just past appt time, not yet late). */
  amberDot: boolean;
  /** Show the "Late" warning chip. Also gates the "Mark no-show" button. */
  showLateChip: boolean;
  /** Show a ✓ icon next to the patient name. */
  showCheckIcon: boolean;
  /** Text for the status badge. */
  badgeLabel: string;
  /** Badge component variant. */
  badgeVariant: RowBadgeVariant;
  /** Extra className applied to the Badge for colour overrides. */
  badgeClassName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_LATE_THRESHOLD_MIN = 15;

const ACTIVE_STATUSES = new Set<AppointmentStatus>(["pending", "confirmed"]);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Returns the display meta for one appointment row.
 *
 * @param appointment      - The appointment object from the API.
 * @param now              - Current time (pass `new Date()` in production).
 * @param lateThresholdMin - Minutes after `appointment_date` before the row
 *                           shows the "Late" chip. Defaults to 15.
 *                           Read from `doctor_settings.auto_no_show_after_min`
 *                           when available so the cue aligns with the
 *                           auto-no-show worker.
 */
export function getRowMeta(
  appointment: Appointment,
  now: Date,
  lateThresholdMin: number = DEFAULT_LATE_THRESHOLD_MIN
): RowMeta {
  const { status, consultation_session } = appointment;
  const apptMs = new Date(appointment.appointment_date).getTime();
  const nowMs = now.getTime();
  const thresholdMs = lateThresholdMin * 60_000;

  // 1. Live consultation in progress (highest priority — shows even if status
  //    is technically still 'confirmed' on the appointment row).
  if (consultation_session?.status === "live") {
    return {
      variant: "live",
      dimmed: false,
      strikethrough: false,
      accentBorder: true,
      pulseDot: true,
      amberDot: false,
      showLateChip: false,
      showCheckIcon: false,
      badgeLabel: "Live",
      badgeVariant: "outline",
      badgeClassName:
        "border-green-400 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300",
    };
  }

  // 2. Appointment concluded successfully.
  if (status === "completed") {
    return {
      variant: "completed",
      dimmed: true,
      strikethrough: false,
      accentBorder: false,
      pulseDot: false,
      amberDot: false,
      showLateChip: false,
      showCheckIcon: true,
      badgeLabel: "Done",
      badgeVariant: "outline",
      badgeClassName:
        "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300",
    };
  }

  // 3. Cancelled or no-show — strikethrough + destructive.
  if (status === "cancelled" || status === "no_show") {
    return {
      variant: "cancelled",
      dimmed: true,
      strikethrough: true,
      accentBorder: false,
      pulseDot: false,
      amberDot: false,
      showLateChip: false,
      showCheckIcon: false,
      badgeLabel: status === "no_show" ? "No show" : "Cancelled",
      badgeVariant: "outline",
      badgeClassName: "border-transparent bg-destructive/10 text-destructive",
    };
  }

  // 4. Late: active status AND more than lateThresholdMin past appointment_date.
  if (ACTIVE_STATUSES.has(status) && nowMs > apptMs + thresholdMs) {
    return {
      variant: "late",
      dimmed: false,
      strikethrough: false,
      accentBorder: false,
      pulseDot: false,
      amberDot: false,
      showLateChip: true,
      showCheckIcon: false,
      badgeLabel: "Late",
      badgeVariant: "warning",
      badgeClassName: "",
    };
  }

  // 5. Amber nudge: active status AND past appt_date but still within threshold.
  if (ACTIVE_STATUSES.has(status) && nowMs > apptMs) {
    return {
      variant: "amber",
      dimmed: false,
      strikethrough: false,
      accentBorder: false,
      pulseDot: false,
      amberDot: true,
      showLateChip: false,
      showCheckIcon: false,
      badgeLabel: status === "confirmed" ? "Confirmed" : "Pending",
      badgeVariant: status === "confirmed" ? "default" : "secondary",
      badgeClassName: "",
    };
  }

  // 6. Normal (future or on-time).
  return {
    variant: "normal",
    dimmed: false,
    strikethrough: false,
    accentBorder: false,
    pulseDot: false,
    amberDot: false,
    showLateChip: false,
    showCheckIcon: false,
    badgeLabel: status === "confirmed" ? "Confirmed" : status === "pending" ? "Pending" : status,
    badgeVariant: status === "confirmed" ? "default" : "secondary",
    badgeClassName: "",
  };
}
