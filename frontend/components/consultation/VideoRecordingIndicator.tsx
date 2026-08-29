"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  pauseVideoRecording,
  resumeVideoRecording,
  revokeVideoRecording,
  VideoEscalationError,
} from "@/lib/api/recording-escalation";
import { markGrantHaltConfirm } from "@/lib/rec24-halt-marks";

/**
 * Plan 08 · Task 42 + rec-24.
 *
 * Overlay pill both parties see during a mid-consult video grant.
 * Patient gets persistently visible Pause (single tap) and Stop
 * (confirm tooltip). Halt of local video is a callback from VideoRoom
 * — this component stays side-effect-light (JSDoc of the original
 * task-42 file: do not reach into the room).
 */

export interface VideoRecordingIndicatorProps {
  isActive:          boolean;
  viewerRole:        "doctor" | "patient";
  sessionId?:        string | null;
  token?:            string | null;
  className?:        string;
  grantSecondsRemaining?: number | null;
  grantIsSettling?: boolean;
  /** rec-26. Parent surface owns the status words; this is controls only. */
  hideStatusText?: boolean;
  /** rec-24. Grant is paused; still active. */
  videoPaused?: boolean;
  /**
   * rec-24 / REC4-D7. Parent-owned camera gate after halt.
   * `"stopping"` / `"confirming"` — never "stopped" until the server
   * confirms audio-only.
   */
  cameraGate?: "stopping" | "confirming" | null;
  /** Called synchronously before the pause/stop network call. */
  onHaltLocalVideo?: (intent: "pause" | "stop") => void;
  /** Called only after resume 200. */
  onRestoreLocalVideo?: () => void;
  onCameraGateChange?: (gate: "stopping" | "confirming" | null) => void;
}

type Stage =
  | "idle"
  | "confirming"
  | "submitting_stop"
  | "submitting_pause"
  | "submitting_resume"
  | "error";

export default function VideoRecordingIndicator({
  isActive,
  viewerRole,
  sessionId,
  token,
  className,
  grantSecondsRemaining = null,
  grantIsSettling = false,
  hideStatusText = false,
  videoPaused = false,
  cameraGate = null,
  onHaltLocalVideo,
  onRestoreLocalVideo,
  onCameraGateChange,
}: VideoRecordingIndicatorProps): JSX.Element | null {
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stopButtonRef = useRef<HTMLButtonElement | null>(null);
  const pauseButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isActive) {
      setStage("idle");
      setErrorMessage(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (stage !== "confirming" && stage !== "error") return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setStage("idle");
        setErrorMessage(null);
        stopButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  const canControl = viewerRole === "patient" && Boolean(sessionId && token);
  const busy =
    stage === "submitting_stop" ||
    stage === "submitting_pause" ||
    stage === "submitting_resume";

  const handleStopTap = useCallback(() => {
    if (!canControl || busy) return;
    setStage("confirming");
    setErrorMessage(null);
  }, [busy, canControl]);

  const handleCancel = useCallback(() => {
    setStage("idle");
    setErrorMessage(null);
    stopButtonRef.current?.focus();
  }, []);

  const handleConfirmStop = useCallback(async () => {
    if (!sessionId || !token) return;
    markGrantHaltConfirm("stop");
    onHaltLocalVideo?.("stop");
    onCameraGateChange?.("stopping");
    setStage("submitting_stop");
    setErrorMessage(null);
    try {
      await revokeVideoRecording(token, sessionId);
      setStage("idle");
    } catch (err) {
      const friendly =
        err instanceof VideoEscalationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't stop recording. Please try again.";
      setErrorMessage(friendly);
      onCameraGateChange?.("confirming");
      setStage("error");
    }
  }, [onCameraGateChange, onHaltLocalVideo, sessionId, token]);

  const handlePause = useCallback(async () => {
    if (!sessionId || !token || busy) return;
    markGrantHaltConfirm("pause");
    onHaltLocalVideo?.("pause");
    onCameraGateChange?.("confirming");
    setStage("submitting_pause");
    setErrorMessage(null);
    try {
      await pauseVideoRecording(token, sessionId);
      onCameraGateChange?.(null);
      setStage("idle");
    } catch (err) {
      const friendly =
        err instanceof VideoEscalationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't pause video recording. Please try again.";
      setErrorMessage(friendly);
      setStage("idle");
    }
  }, [busy, onCameraGateChange, onHaltLocalVideo, sessionId, token]);

  const handleResume = useCallback(async () => {
    if (!sessionId || !token || busy) return;
    setStage("submitting_resume");
    setErrorMessage(null);
    try {
      await resumeVideoRecording(token, sessionId);
      onRestoreLocalVideo?.();
      onCameraGateChange?.(null);
      setStage("idle");
    } catch (err) {
      const friendly =
        err instanceof VideoEscalationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't resume video recording. Please try again.";
      setErrorMessage(friendly);
      setStage("idle");
    }
  }, [busy, onCameraGateChange, onRestoreLocalVideo, sessionId, token]);

  if (!isActive && stage === "idle") return null;

  const reduceMotionSafe = "motion-reduce:animate-none";

  const statusLabel = (() => {
    if (cameraGate === "stopping" || grantIsSettling) {
      return "Stopping video…";
    }
    if (cameraGate === "confirming") {
      return "Confirming…";
    }
    if (videoPaused) {
      return "Video paused — you can resume";
    }
    if (grantSecondsRemaining !== null) {
      return `Saving video · ${Math.max(0, grantSecondsRemaining)}s`;
    }
    return "Saving video";
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="video-recording-indicator"
      className={[
        "pointer-events-none flex flex-col items-end",
        className ?? "",
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-auto relative inline-flex items-center gap-2",
          hideStatusText
            ? "text-sm font-medium text-slate-800"
            : [
                "rounded-full px-3 py-1.5 text-sm font-medium text-white shadow-md",
                videoPaused
                  ? "bg-amber-600/90 backdrop-blur-sm"
                  : "bg-red-600/90 backdrop-blur-sm",
              ].join(" "),
          "transition-opacity duration-200 ease-out",
          isActive ? "opacity-100" : "opacity-0 duration-[400ms]",
        ].join(" ")}
      >
        {hideStatusText ? null : (
          <>
            <span
              aria-hidden="true"
              className={[
                "h-2.5 w-2.5 rounded-full bg-white",
                videoPaused ? "" : "animate-pulse",
                reduceMotionSafe,
              ].join(" ")}
            />
            <span className="leading-snug">{statusLabel}</span>
          </>
        )}

        {viewerRole === "patient" && canControl ? (
          <>
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
            {videoPaused ? (
              <button
                type="button"
                onClick={() => void handleResume()}
                disabled={busy}
                aria-label="Resume video saving; audio will continue"
                className={[
                  "underline underline-offset-2 disabled:opacity-70",
                  hideStatusText
                    ? "decoration-slate-500 hover:decoration-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                    : "decoration-white/80 hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                ].join(" ")}
              >
                {stage === "submitting_resume" ? "Resuming…" : "Resume"}
              </button>
            ) : (
              <button
                ref={pauseButtonRef}
                type="button"
                onClick={() => void handlePause()}
                disabled={busy}
                aria-label="Pause video saving; you can resume without being asked again. Audio will continue."
                className={[
                  "underline underline-offset-2 disabled:opacity-70",
                  hideStatusText
                    ? "decoration-slate-500 hover:decoration-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                    : "decoration-white/80 hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                ].join(" ")}
              >
                {stage === "submitting_pause" ? "Pausing…" : "Pause — you can resume"}
              </button>
            )}
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
            <button
              ref={stopButtonRef}
              type="button"
              onClick={handleStopTap}
              aria-label="Stop video recording; audio will continue"
              aria-expanded={stage === "confirming" || stage === "error" || stage === "submitting_stop"}
              aria-haspopup="dialog"
              className={[
                "underline underline-offset-2 disabled:opacity-70",
                hideStatusText
                  ? "decoration-slate-500 hover:decoration-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                  : "decoration-white/80 hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              ].join(" ")}
              disabled={busy}
            >
              Stop
            </button>

            {(stage === "confirming" || stage === "submitting_stop" || stage === "error") ? (
              <RevokeConfirmTooltip
                stage={stage}
                errorMessage={errorMessage}
                onCancel={handleCancel}
                onConfirm={handleConfirmStop}
              />
            ) : null}
          </>
        ) : null}
      </div>
      {errorMessage && stage === "idle" ? (
        <p
          role="alert"
          className="pointer-events-auto mt-1 max-w-xs text-right text-xs text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

interface RevokeConfirmTooltipProps {
  stage:        "confirming" | "submitting_stop" | "error";
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

  useEffect(() => {
    if (stage === "confirming") {
      confirmButtonRef.current?.focus();
    }
  }, [stage]);

  useEffect(() => {
    function onOutside(e: MouseEvent | TouchEvent): void {
      const target = e.target as Node | null;
      if (!containerRef.current || !target) return;
      if (!containerRef.current.contains(target)) {
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

  const submitting = stage === "submitting_stop";

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
        Audio will continue. Your camera will turn off until you turn
        it back on.
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
