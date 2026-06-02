"use client";

/**
 * Sub-batch B · task-video-B1 — countdown banner for the lobby.
 *
 * Renders BELOW `<VideoConsultLobbyHeader>` and ABOVE
 * `<VideoConsultPreCall>` on the patient join page. Self-contained;
 * subscribes to `setInterval(1s)` and computes its state from the
 * scheduled-start ISO + the local clock.
 *
 * State machine (per task acceptance):
 *
 *   Input                                 →  Display
 *   --------------------------------------- ----------------------------------
 *   `scheduledStartAt` is null/missing    →  "Waiting for [counterparty]…"
 *                                            (no countdown — pulse from start)
 *   `now > scheduledStartAt + 30 min`     →  "Waiting for [counterparty]…"
 *                                            (>30 min late at first render)
 *   `now < scheduledStartAt`              →  "Your consult starts in MM:SS"
 *                                            (or "in HH:MM:SS" when ≥1h)
 *   `0 ≤ now - scheduledStartAt < 30 s`   →  "Starting now…"
 *   `now - scheduledStartAt ≥ 30 s`       →  "Waiting for [counterparty]…"
 *
 * The reassuring copy ("Hold tight — Dr. Sharma will join shortly.")
 * lives in this component so the countdown + reassurance are visually
 * unified. Counterparty label is a prop (defaults to "your doctor"
 * for the patient — when the backend exposes the doctor name we'll
 * pass it through; deferred today).
 *
 * Cleanup: the interval is cleared on unmount AND when state
 * transitions away from a "ticking" state (countdown → "Starting
 * now…" → "Waiting…") to save the wakeup. The interval also pauses
 * when the tab is hidden (`document.visibilityState === 'hidden'`)
 * via the `visibilitychange` listener — saves battery on background
 * tabs and re-syncs on focus return.
 *
 * SSR / Next.js: `Date.now()` and `setInterval` are guarded by
 * `useEffect` (client-only), so SSR renders the initial frame using
 * the prop-derived state at render time. There's no hydration
 * mismatch because the initial render uses the same logic on both
 * sides; the post-mount tick takes over from there.
 */

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Phases of the lobby countdown. Exported for tests / sibling
 * components that want to reflect the same state (e.g. a future
 * "doctor is on the way" banner could fade in only when phase is
 * `'starting'` or `'waiting'`).
 */
export type LobbyCountdownPhase = "countdown" | "starting" | "waiting";

export type LobbyCountdownPerspective = "patient" | "doctor";

export interface VideoConsultLobbyCountdownProps {
  /**
   * ISO-8601 timestamp of the scheduled start. `null`/`undefined` =
   * drop-in / instant consult (no countdown — go straight to
   * "Waiting…" with the pulse).
   */
  scheduledStartAt: string | null | undefined;
  /**
   * Display name for the counterparty. Patient side defaults to
   * "your doctor" (we don't yet surface the doctor's name to the
   * patient — see the file-level note in `branding.ts`); doctor
   * side would pass "your patient" / the patient's first name.
   */
  counterpartyLabel: string;
  /** Patient-facing copy (default) vs doctor waiting-room copy (voice B2). */
  perspective?: LobbyCountdownPerspective;
  /**
   * Optional override of `Date.now()` for tests. Production paths
   * never set this.
   */
  nowProvider?: () => number;
}

const STARTING_NOW_WINDOW_MS = 30_000; // 30 s after T-0 → "Starting now…".
const LATE_THRESHOLD_MS = 30 * 60_000; // 30 min late → "Waiting…" immediately.

interface ComputedState {
  phase: LobbyCountdownPhase;
  remainingMs: number;
}

/**
 * Pure phase resolver — testable without React. Returns the phase
 * the banner should render given a scheduled time and "now".
 */
function computePhase(
  scheduledIso: string | null | undefined,
  now: number,
): ComputedState {
  if (!scheduledIso) {
    return { phase: "waiting", remainingMs: 0 };
  }
  const scheduled = new Date(scheduledIso).getTime();
  if (Number.isNaN(scheduled)) {
    return { phase: "waiting", remainingMs: 0 };
  }
  const delta = scheduled - now; // positive = future; negative = past.
  if (delta > 0) {
    return { phase: "countdown", remainingMs: delta };
  }
  // Past — bucket into "starting now" vs "late waiting".
  const elapsed = -delta;
  if (elapsed < STARTING_NOW_WINDOW_MS) {
    return { phase: "starting", remainingMs: 0 };
  }
  // Includes the explicit ">30 min late" branch — collapses into the
  // same "waiting" phase, just with `remainingMs = 0`.
  if (elapsed > LATE_THRESHOLD_MS) {
    return { phase: "waiting", remainingMs: 0 };
  }
  return { phase: "waiting", remainingMs: 0 };
}

/**
 * Format a positive `remainingMs` as "MM:SS" / "HH:MM:SS". Returns
 * an empty string for non-positive inputs.
 */
function formatRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return "";
  const totalSec = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

function elapsedWaitLabel(
  scheduledIso: string | null | undefined,
  now: number,
): string {
  if (!scheduledIso) return "";
  const scheduled = new Date(scheduledIso).getTime();
  if (Number.isNaN(scheduled)) return "";
  const elapsedMs = Math.max(0, now - scheduled);
  return formatRemaining(elapsedMs);
}

export default function VideoConsultLobbyCountdown({
  scheduledStartAt,
  counterpartyLabel,
  perspective = "patient",
  nowProvider,
}: VideoConsultLobbyCountdownProps) {
  // Capture the now-provider in a ref so the tick interval doesn't
  // need to re-subscribe whenever the parent passes a new lambda.
  const nowProviderRef = useRef<() => number>(nowProvider ?? (() => Date.now()));
  useEffect(() => {
    nowProviderRef.current = nowProvider ?? (() => Date.now());
  }, [nowProvider]);

  // Initial computation runs at render time (SSR-safe — `Date.now()`
  // is fine on the server; the resulting phase is just stale by the
  // time hydration finishes, and the post-mount effect takes over).
  const initialState = useMemo(
    () => computePhase(scheduledStartAt, nowProviderRef.current()),
    [scheduledStartAt],
  );
  const [state, setState] = useState<ComputedState>(initialState);

  // Tick every second while the visible label can change: countdown,
  // "starting now", and (doctor) elapsed-wait in the waiting phase.
  const shouldTick =
    state.phase === "countdown" ||
    state.phase === "starting" ||
    (perspective === "doctor" && state.phase === "waiting");

  useEffect(() => {
    if (!shouldTick) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const next = computePhase(scheduledStartAt, nowProviderRef.current());
      setState((prev) => {
        // Avoid re-rendering when nothing meaningful changed (same
        // phase + same display string). Cheap optimisation but it
        // halves the number of paints in the steady state.
        if (
          prev.phase === next.phase &&
          formatRemaining(prev.remainingMs) === formatRemaining(next.remainingMs)
        ) {
          return prev;
        }
        return next;
      });
    };

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(tick, 1000);
      // Tick immediately so the visible value catches up after a
      // visibility-change pause.
      tick();
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Pause when the tab is hidden — saves battery on background
    // tabs. The visibility check is wrapped in a typeof guard for
    // SSR (no `document` on the server).
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        start();
      }
    };

    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [shouldTick, scheduledStartAt, perspective]);

  // ----- Render -----
  // Three visual variants:
  //   countdown → blue informational tone, no pulse.
  //   starting → green confirmation tone, soft pulse on the dot.
  //   waiting → amber reassurance tone, soft pulse to indicate the
  //             counterparty is still expected (not "something's
  //             broken").
  const variantClasses: Record<LobbyCountdownPhase, string> = {
    countdown: "border-blue-200 bg-blue-50 text-blue-900",
    starting: "border-emerald-200 bg-emerald-50 text-emerald-900",
    waiting: "border-amber-200 bg-amber-50 text-amber-900",
  };
  const dotClasses: Record<LobbyCountdownPhase, string> = {
    countdown: "bg-blue-500",
    starting: "bg-emerald-500 animate-pulse",
    waiting: "bg-amber-500 animate-pulse",
  };

  const now = nowProviderRef.current();
  let mainText: string;
  let subText: string | null;
  if (perspective === "doctor") {
    switch (state.phase) {
      case "countdown":
        mainText = `Consult starts in ${formatRemaining(state.remainingMs)}`;
        subText = `${counterpartyLabel} can join once the session is live.`;
        break;
      case "starting":
        mainText = "Patient joining shortly";
        subText = "The join link is active — they may connect any moment.";
        break;
      case "waiting":
      default: {
        const waited = elapsedWaitLabel(scheduledStartAt, now);
        mainText = waited
          ? `Patient hasn't joined yet (waited ${waited})`
          : "Patient hasn't joined yet";
        subText = "You can stay on this screen or resend the join link.";
        break;
      }
    }
  } else {
    switch (state.phase) {
      case "countdown":
        mainText = `Your consult starts in ${formatRemaining(state.remainingMs)}`;
        subText = `Hold tight — ${counterpartyLabel} will join shortly.`;
        break;
      case "starting":
        mainText = "Starting now…";
        subText = `Hold tight — ${counterpartyLabel} will join shortly.`;
        break;
      case "waiting":
      default:
        mainText = `Waiting for ${counterpartyLabel} to join…`;
        subText = "Thanks for your patience.";
        break;
    }
  }

  return (
    <div
      className={
        "flex w-full items-start gap-3 rounded-xl border p-4 " +
        variantClasses[state.phase]
      }
      role="status"
      aria-live="polite"
      data-testid="video-consult-lobby-countdown"
      data-phase={state.phase}
    >
      <span
        aria-hidden
        className={"mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full " + dotClasses[state.phase]}
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{mainText}</p>
        {subText ? (
          <p className="mt-1 text-sm opacity-80">{subText}</p>
        ) : null}
      </div>
    </div>
  );
}

// Re-export pure helpers for tests + future doctor-side reuse.
export { computePhase as __computePhaseForTests, formatRemaining as __formatRemainingForTests };
