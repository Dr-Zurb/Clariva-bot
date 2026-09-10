"use client";

import { useCallback, useId, useState } from "react";

import {
  offerVideoRecording,
  VideoEscalationError,
  type VideoEscalationStateData,
} from "@/lib/api/recording-escalation";

/**
 * rec-25 / REC-D12 — patient offers video without being asked.
 * Self-consenting: no modal. Final wording is rec-26's.
 *
 * Visible on a live video consult when video is not already recording
 * and no doctor request is pending. Stop debounce disables the control;
 * a doctor decline cooldown does not.
 */
export interface PatientVideoOfferButtonProps {
  sessionId: string;
  token: string;
  currentUserRole: "doctor" | "patient";
  state: VideoEscalationStateData;
  cooldownSecondsRemaining?: number | null;
  onRefresh?: () => void;
}

function isStopDebounce(
  state: VideoEscalationStateData,
  cooldownSecondsRemaining: number | null | undefined,
): boolean {
  return (
    state.kind === "cooldown" &&
    state.lastOutcome === "stopped" &&
    (cooldownSecondsRemaining ?? 0) > 0
  );
}

export default function PatientVideoOfferButton({
  sessionId,
  token,
  currentUserRole,
  state,
  cooldownSecondsRemaining = null,
  onRefresh,
}: PatientVideoOfferButtonProps): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helpId = useId();
  const errorId = useId();

  const handleClick = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await offerVideoRecording(token, sessionId);
      onRefresh?.();
    } catch (err) {
      const message =
        err instanceof VideoEscalationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't start video recording. Please try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, onRefresh, sessionId, token]);

  if (currentUserRole !== "patient") return null;
  if (state.kind === "requesting") return null;
  if (
    state.kind === "locked" &&
    state.reason === "already_recording_video"
  ) {
    return null;
  }

  const stopDebouncing = isStopDebounce(state, cooldownSecondsRemaining);
  const disabled = busy || stopDebouncing;

  return (
    <div className="flex max-w-xs flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
        aria-label="Start saving video. Your camera is already on. The doctor can already see you."
        onClick={() => void handleClick()}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? "Starting…"
          : stopDebouncing
            ? `Try again in ${cooldownSecondsRemaining}s`
            : "Start saving video"}
      </button>
      <p id={helpId} className="text-xs text-slate-500">
        Your camera is already on. This only starts saving the video.
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
