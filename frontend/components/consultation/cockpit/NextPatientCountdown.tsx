"use client";

/**
 * NextPatientCountdown (pf-11)
 *
 * A 5-second cancellable countdown overlay that mounts inside EndedCard when
 * the cockpit is in `ended` / `wrap_up` state and the doctor's
 * `patient_flow_advance` setting is `'countdown'`.
 *
 * Behaviour by mode
 *   'countdown' → shows this overlay; auto-navigates to next patient on zero.
 *   'instant'   → renders null visually; navigates immediately on mount (one-shot).
 *   'manual'    → renders null. Doctor stays until they move manually.
 *   next === null → renders null; EndOfDayCard (pf-18) handles that branch.
 *
 * Cancellation is persisted to sessionStorage so a page reload on the same
 * ended appointment does not re-trigger the countdown.
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-11-next-patient-countdown.md
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getDoctorSettings } from "@/lib/api";
import type { PatientFlowAdvance } from "@/types/doctor-settings";
import { useNextAppointmentRoute } from "@/hooks/useNextAppointmentRoute";
import { cn } from "@/lib/utils";
import { EndOfDayCard } from "./EndOfDayCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COUNTDOWN_SECONDS = 5;

function cancelStorageKey(appointmentId: string): string {
  return `pf11_cancelled_${appointmentId}`;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface NextPatientCountdownProps {
  currentAppointmentId: string;
  /**
   * 'auto'   = triggered by a successful Send Rx → wrap-up flow.
   * 'manual' = doctor explicitly pressed "Done with patient".
   * Informational — used for future analytics; does not affect timer logic.
   */
  triggeredAt?: "auto" | "manual";
  /** Bearer token forwarded to useNextAppointmentRoute and getDoctorSettings. */
  token: string;
  /** Called when the doctor presses Cancel. Parent can use this to restore full EndedCard. */
  onCancel?: () => void;
  /** Called after successful auto-navigate (timer reached zero). */
  onDone?: () => void;
}

// ---------------------------------------------------------------------------
// CountdownRing — inline SVG progress ring (~30 LOC)
// ---------------------------------------------------------------------------

function CountdownRing({
  seconds,
  total,
}: {
  seconds: number;
  total: number;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, seconds / total));
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="relative h-16 w-16 flex-shrink-0" aria-hidden>
      <svg
        className="absolute inset-0 -rotate-90"
        viewBox="0 0 64 64"
        fill="none"
      >
        {/* Background track */}
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted-foreground/20"
        />
        {/* Progress arc */}
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="text-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      {/* Countdown digit — tabular-nums prevents layout jitter */}
      <span className="absolute inset-0 flex items-center justify-center tabular-nums text-2xl font-semibold leading-none">
        {seconds}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NextPatientCountdown
// ---------------------------------------------------------------------------

export function NextPatientCountdown({
  currentAppointmentId,
  triggeredAt: _triggeredAt,
  token,
  onCancel,
  onDone,
}: NextPatientCountdownProps): JSX.Element | null {
  const router = useRouter();

  // ── Doctor settings: load patient_flow_advance ───────────────────────────
  const [flowAdvance, setFlowAdvance] = useState<PatientFlowAdvance | null>(
    null,
  );

  useEffect(() => {
    getDoctorSettings(token)
      .then((res) => {
        // Default to 'countdown' when the field is absent (pre-migration rows).
        setFlowAdvance(res.data.settings.patient_flow_advance ?? "countdown");
      })
      .catch(() => {
        // On error, use the safest UX default: show the countdown so the
        // doctor at least gets a pause before being advanced.
        setFlowAdvance("countdown");
      });
  }, [token]);

  // ── Next appointment route ────────────────────────────────────────────────
  const { next } = useNextAppointmentRoute({
    currentAppointmentId,
    token,
  });

  // ── Cancel state (sessionStorage prevents re-trigger on same appt reload) ─
  const [cancelled, setCancelled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      sessionStorage.getItem(cancelStorageKey(currentAppointmentId)) === "1"
    );
  });

  // ── Countdown seconds ─────────────────────────────────────────────────────
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);

  // ── Instant mode: strict-mode double-fire guard ───────────────────────────
  const instantFiredRef = useRef(false);

  // Instant: fire once on mount when settings + next are available.
  useEffect(() => {
    if (flowAdvance !== "instant") return;
    if (!next) return;
    if (instantFiredRef.current) return;
    instantFiredRef.current = true;
    router.push(next.url);
  }, [flowAdvance, next, router]);

  // Countdown: tick interval — reset if cancelled or mode changes.
  useEffect(() => {
    if (flowAdvance !== "countdown") return;
    if (!next || cancelled) return;

    const id = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);

    return () => clearInterval(id);
    // Intentionally omit `seconds` — we want a single long-lived interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowAdvance, next?.url, cancelled]);

  // Countdown: navigate when the timer reaches zero.
  useEffect(() => {
    if (flowAdvance !== "countdown") return;
    if (!next || cancelled) return;
    if (seconds > 0) return;

    router.push(next.url);
    onDone?.();
    // `onDone` deliberately excluded — callers should memoize if needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, flowAdvance, next, cancelled, router]);

  // ── Render guards ─────────────────────────────────────────────────────────

  // Settings still loading — render nothing rather than flashing briefly.
  if (flowAdvance === null) return null;

  // 'instant' → navigate effect fires above; no visual UI to render.
  // 'manual'  → stay put; no UI.
  if (flowAdvance !== "countdown") return null;

  // No next patient — day is done. Render EndOfDayCard inside the same overlay
  // wrapper so the transition from the countdown to the EOD card is seamless
  // (no unmount/remount flash of the absolute-positioned container).
  if (!next) {
    return (
      <div
        className={cn(
          "absolute inset-0 z-10 flex items-start justify-center overflow-y-auto rounded-lg",
          "bg-background/95 backdrop-blur-sm",
          "p-6",
        )}
      >
        <EndOfDayCard token={token} />
      </div>
    );
  }

  // Already cancelled (either in this session or via sessionStorage).
  if (cancelled) return null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCancel() {
    sessionStorage.setItem(cancelStorageKey(currentAppointmentId), "1");
    setCancelled(true);
    onCancel?.();
  }

  function handleGoNow() {
    // Don't write the cancel flag — this was a deliberate "go now", not a
    // real cancel. We just skip the remaining seconds.
    router.push(next!.url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Auto-advancing to next patient in ${seconds} seconds. Press Cancel to stay.`}
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center rounded-lg",
        "bg-background/95 backdrop-blur-sm",
        "p-6",
      )}
    >
      <div className="w-full max-w-sm space-y-5">
        {/* ── Countdown ring + destination copy ───────────────────────── */}
        <div className="flex items-center gap-4">
          <CountdownRing seconds={seconds} total={COUNTDOWN_SECONDS} />

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">
              {next.label}
            </p>
            <p className="text-sm text-muted-foreground">
              {next.positionLabel}
            </p>
            <p className="text-sm text-muted-foreground">
              Going in{" "}
              <span className="tabular-nums font-medium text-foreground">
                {seconds}
              </span>
              …
            </p>
          </div>
        </div>

        {/* ── Action buttons ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className={cn(
              "flex-1 rounded-md border border-border bg-background",
              "px-4 py-2 text-sm font-medium text-foreground",
              "hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "transition-colors",
            )}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleGoNow}
            className={cn(
              "flex-1 rounded-md bg-primary",
              "px-4 py-2 text-sm font-medium text-primary-foreground",
              "hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "transition-colors",
            )}
          >
            Go now ▸
          </button>
        </div>
      </div>
    </div>
  );
}
