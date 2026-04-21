"use client";

import type { RecordingStateSnapshot } from "@/hooks/useRecordingState";

/**
 * Persistent "🔴 Recording paused" banner that both doctor and patient
 * see during a mid-consult pause.  Plan 07 · Task 28 · Decision 4 LOCKED.
 *
 * Source of truth is the hook-owned `RecordingStateSnapshot` passed in
 * via the `state` prop. The host is expected to mount
 * `useRecordingState(...)` once and fan-out the same snapshot into both
 * this component and `<RecordingControls>` so they stay consistent
 * without duplicate network traffic.
 *
 * Copy differs by role per task-28 Notes #3:
 *   - Doctor: "🔴 Recording paused — reason: '<reason>'. Resume when ready."
 *   - Patient: "🔴 Recording paused by your doctor — reason: '<reason>'."
 *
 * Accessibility:
 *   - `role="status"` + `aria-live="polite"` so screen readers announce
 *     pause/resume events without interrupting the user.
 */
export interface RecordingPausedIndicatorProps {
  /** Snapshot from `useRecordingState`. */
  state:           RecordingStateSnapshot;
  /** Viewer role — drives copy. Both roles render when paused. */
  currentUserRole: "doctor" | "patient";
  /** Optional className for the container. */
  className?:      string;
}

function formatReason(reason: string | undefined): string {
  const t = (reason ?? "").trim();
  if (!t) return "No reason provided";
  return t;
}

export default function RecordingPausedIndicator({
  state,
  currentUserRole,
  className,
}: RecordingPausedIndicatorProps): JSX.Element | null {
  if (!state.paused) return null;

  const reasonLabel = formatReason(state.pauseReason);
  const copy =
    currentUserRole === "doctor"
      ? `Recording paused — reason: "${reasonLabel}". Resume when ready.`
      : `Recording paused by your doctor — reason: "${reasonLabel}".`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="recording-paused-indicator"
      className={
        className ??
        "flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      }
    >
      <span aria-hidden="true" className="text-red-600">
        ●
      </span>
      <span className="leading-snug">{copy}</span>
    </div>
  );
}
