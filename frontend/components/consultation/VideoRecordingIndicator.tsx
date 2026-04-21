"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  revokeVideoRecording,
  VideoEscalationError,
} from "@/lib/api/recording-escalation";

/**
 * Plan 08 · Task 42 · Decision 10 LOCKED.
 *
 * Overlay pill that both parties see during a mid-consult video
 * recording. Shape: `🔴 Recording video` on a semi-opaque red
 * background with a 2s pulse animation on the dot. Patient variant
 * adds a trailing `·` + `[Stop]` link that opens a small confirmation
 * tooltip (NOT a modal — task-42 Notes #1 resolution).
 *
 * The component is intentionally side-effect-light: the network call
 * lives in `revokeVideoRecording`, and the Realtime-driven hide
 * happens via the parent (`<VideoRoom>`) re-rendering with
 * `isActive={false}` once the `video_escalation_audit.revoked_at`
 * UPDATE propagates through `useVideoEscalationState`. Keeping the
 * subscription out of this component avoids a race between the local
 * tooltip dismiss and the Realtime-driven fade-out.
 *
 * ## Accessibility
 *
 *   - `role="status"` + `aria-live="polite"` on the container so the
 *     indicator's appearance / disappearance is announced to screen
 *     readers without interrupting.
 *   - Patient `[Stop]` is a `<button>` with a descriptive
 *     `aria-label` that clarifies audio continues.
 *   - Keyboard focus: `[Stop]` is reachable via Tab; `Enter` / `Space`
 *     triggers the tooltip; the tooltip's CTAs are focusable in
 *     order; `Esc` closes the tooltip.
 *   - Pulse animation honours `prefers-reduced-motion` via the
 *     Tailwind `motion-reduce:animate-none` variant (falls back to a
 *     solid red dot).
 *
 * ## Positioning (by parent)
 *
 * The parent `<VideoRoom>` mounts the indicator inside the video
 * canvas area. The component is layout-agnostic — it renders a pill
 * with no fixed positioning. The parent is responsible for the
 * `absolute top-4 right-4` (desktop) / top-right of the `[Video]`
 * tab (mobile) framing. See task-42 acceptance "Positioning".
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-42-video-recording-indicator-and-patient-revoke.md
 */

export interface VideoRecordingIndicatorProps {
  /** When true, the indicator is visible. Driven by the parent's
   *  escalation-state hook (`state.kind === 'locked' && reason ===
   *  'already_recording_video'`). False fades the indicator out. */
  isActive:          boolean;
  /** Doctor view shows the indicator only. Patient view adds the
   *  `[Stop]` affordance + confirmation tooltip. */
  viewerRole:        "doctor" | "patient";
  /** `consultation_sessions.id`. Required for the patient revoke
   *  call; the doctor view ignores it. */
  sessionId?:        string | null;
  /** Supabase auth JWT for the patient revoke call. Required when
   *  `viewerRole === 'patient'`. */
  token?:            string | null;
  /** Optional Tailwind overrides on the outer wrapper. The parent
   *  typically passes `absolute top-4 right-4 z-20` or similar. */
  className?:        string;
}

type Stage =
  | "idle"           // tooltip closed
  | "confirming"    // tooltip open, awaiting patient CTA
  | "submitting"    // patient hit "Yes, stop" — awaiting server
  | "error";        // server returned an error — inline message shown

export default function VideoRecordingIndicator({
  isActive,
  viewerRole,
  sessionId,
  token,
  className,
}: VideoRecordingIndicatorProps): JSX.Element | null {
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stopButtonRef = useRef<HTMLButtonElement | null>(null);

  // When the indicator is dismissed externally (isActive flips to
  // false via the Realtime-driven re-render), collapse the tooltip
  // so a stale "confirming" stage doesn't flash after a successful
  // revoke. Also resets any error message.
  useEffect(() => {
    if (!isActive) {
      setStage("idle");
      setErrorMessage(null);
    }
  }, [isActive]);

  // Close the tooltip on Esc from anywhere in the document while it's
  // open. Task-42 acceptance "Interactions — Esc = cancel".
  useEffect(() => {
    if (stage !== "confirming" && stage !== "error") return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setStage("idle");
        setErrorMessage(null);
        // Return focus to the [Stop] button so keyboard users don't
        // lose their place in the tab order.
        stopButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  const canRevoke = viewerRole === "patient" && Boolean(sessionId && token);

  const handleStopTap = useCallback(() => {
    if (!canRevoke) return;
    setStage("confirming");
    setErrorMessage(null);
  }, [canRevoke]);

  const handleCancel = useCallback(() => {
    setStage("idle");
    setErrorMessage(null);
    stopButtonRef.current?.focus();
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!sessionId || !token) return;
    setStage("submitting");
    setErrorMessage(null);
    try {
      await revokeVideoRecording(token, sessionId);
      // Success: collapse the tooltip. The indicator itself will
      // fade out once the parent's `useVideoEscalationState`
      // observes the `video_escalation_audit.revoked_at` UPDATE via
      // Realtime (~500ms typical). We don't self-hide here because
      // the indicator is driven by `isActive`, and hiding it
      // optimistically would cause a flicker if Realtime reported
      // a different terminal state.
      setStage("idle");
    } catch (err) {
      // Task-42 acceptance "On promise reject: show inline error
      // 'Couldn't stop recording. Try again.' + re-enable [Yes, stop].
      // No auto-retry."
      const friendly =
        err instanceof VideoEscalationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't stop recording. Please try again.";
      setErrorMessage(friendly);
      setStage("error");
    }
  }, [sessionId, token]);

  // --- Render ---

  // `isActive` drives both the fade and the presence of the patient
  // CTA surface. When false we still render (empty div) briefly so
  // the fade-out animation plays, but the non-active state is
  // unmounted below the fade to keep the DOM clean.
  if (!isActive && stage === "idle") return null;

  const reduceMotionSafe = "motion-reduce:animate-none";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="video-recording-indicator"
      className={[
        "pointer-events-none flex items-start justify-end",
        className ?? "",
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-auto relative inline-flex items-center gap-2",
          "rounded-full px-3 py-1.5 text-sm font-medium text-white shadow-md",
          "bg-red-600/90 backdrop-blur-sm",
          // Fade transition — 200ms in, 400ms out per task-42.
          "transition-opacity duration-200 ease-out",
          isActive ? "opacity-100" : "opacity-0 duration-[400ms]",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "h-2.5 w-2.5 rounded-full bg-white",
            "animate-pulse",
            reduceMotionSafe,
          ].join(" ")}
        />
        <span className="leading-snug">Recording video</span>

        {viewerRole === "patient" && canRevoke ? (
          <>
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
            <button
              ref={stopButtonRef}
              type="button"
              onClick={handleStopTap}
              aria-label="Stop video recording; audio will continue"
              aria-expanded={stage !== "idle"}
              aria-haspopup="dialog"
              className={[
                "underline underline-offset-2 decoration-white/80",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                "hover:decoration-white",
                "disabled:opacity-70",
              ].join(" ")}
              disabled={stage === "submitting"}
            >
              Stop
            </button>

            {(stage === "confirming" || stage === "submitting" || stage === "error") ? (
              <RevokeConfirmTooltip
                stage={stage}
                errorMessage={errorMessage}
                onCancel={handleCancel}
                onConfirm={handleConfirm}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation tooltip — small popover anchored to the [Stop] link.
// ---------------------------------------------------------------------------
//
// Deliberately inlined in the same file (task-42 acceptance allows
// either inline OR a sibling component). Inline keeps the coordination
// between the outer button's `aria-expanded` and the inner dialog
// simple, and avoids a third top-level component for a 50-line
// popover.
//
// ## Why not a full modal
//
// Task-42 Notes #1 resolution: a modal gates the patient behind
// friction that implies "are you sure you really want to control your
// own privacy?". The tooltip's small-confirm strikes the right balance
// — prevents mis-tap without patronising. Copy explicitly calls out
// that audio continues.

interface RevokeConfirmTooltipProps {
  stage:        Extract<Stage, "confirming" | "submitting" | "error">;
  errorMessage: string | null;
  onCancel:     () => void;
  onConfirm:    () => void | Promise<void>;
}

function RevokeConfirmTooltip({
  stage,
  errorMessage,
  onCancel,
  onConfirm,
}: RevokeConfirmTooltipProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  // Move focus into the tooltip on open so keyboard users can
  // navigate without tabbing through the rest of the page first. We
  // focus the primary action ([Yes, stop]) so Enter confirms.
  useEffect(() => {
    if (stage === "confirming") {
      confirmButtonRef.current?.focus();
    }
  }, [stage]);

  // Tap-outside to cancel. Task-42 acceptance "Tap-outside = cancel".
  // We register on mousedown + touchstart so the cancel fires before
  // the target element's click — avoids a weird "tooltip closed but
  // the outer element's click also ran" race.
  useEffect(() => {
    function onOutside(e: MouseEvent | TouchEvent): void {
      const target = e.target as Node | null;
      if (!containerRef.current || !target) return;
      if (!containerRef.current.contains(target)) {
        // Only cancel when the tooltip is interactively open. A
        // submitting state is mid-network-call; clicking outside
        // during that split-second shouldn't cancel a server-side
        // revoke.
        if (stage === "confirming" || stage === "error") {
          onCancel();
        }
      }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [stage, onCancel]);

  const submitting = stage === "submitting";

  const tooltipId = useMemo(
    () => `video-recording-revoke-tooltip-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${tooltipId}-title`}
      aria-describedby={`${tooltipId}-body`}
      data-testid="video-recording-revoke-tooltip"
      // The tooltip sits below the indicator (auto-flip up is a
      // nice-to-have; v1 assumes the indicator is top-right so down
      // has room). Pointer-events auto so clicks register even when
      // the outer wrapper (indicator) is pointer-events-none.
      className={[
        "absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2",
        "rounded-md border border-slate-200 bg-white p-3 text-left shadow-lg",
        "text-sm text-slate-800",
      ].join(" ")}
    >
      <p id={`${tooltipId}-title`} className="font-medium">
        Stop video recording?
      </p>
      <p id={`${tooltipId}-body`} className="mt-1 text-slate-600">
        Audio will continue.
      </p>
      {errorMessage ? (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-red-50 px-2 py-1 text-xs text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-medium text-slate-700",
            "border border-slate-300 bg-white hover:bg-slate-50",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
            "disabled:opacity-60",
          ].join(" ")}
        >
          Cancel
        </button>
        <button
          ref={confirmButtonRef}
          type="button"
          onClick={() => {
            void onConfirm();
          }}
          disabled={submitting}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-semibold text-white",
            "bg-red-600 hover:bg-red-700",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600",
            "disabled:cursor-wait disabled:opacity-80",
            "inline-flex items-center gap-1.5",
          ].join(" ")}
        >
          {submitting ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
              />
              Stopping…
            </>
          ) : (
            "Yes, stop"
          )}
        </button>
      </div>
    </div>
  );
}
