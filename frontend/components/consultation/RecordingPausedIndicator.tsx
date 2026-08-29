"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  pauseRecording as apiPauseRecording,
  resumeRecording as apiResumeRecording,
} from "@/lib/api";
import type { RecordingStateSnapshot } from "@/hooks/useRecordingState";

/**
 * Persistent "Recording paused" banner that both doctor and patient
 * see during a mid-consult pause, plus the patient's live pause
 * control (rec-17). rec-15: copy is resolved from a preset code (or
 * the not-recorded token). Never render a typed note.
 *
 * Accessibility:
 *   - Banner: `role="status"` so screen readers announce pause/resume.
 *   - Patient control: keyboard-reachable trigger, Esc / tap-outside
 *     cancels, focus into the confirm tooltip, errors via `role="alert"`.
 */

export const PAUSE_REASON_CODES = [
  "patient_request",
  "sensitive_disclosure",
  "third_party_present",
  "administrative",
  "technical",
] as const;

export type PauseReasonCode = (typeof PAUSE_REASON_CODES)[number];

export const PAUSE_REASON_NOT_RECORDED = "not_recorded_in_preset_form";

/** Doctor picker labels — what the clinician chooses. */
export const PAUSE_REASON_PICKER_LABELS: Record<PauseReasonCode, string> = {
  patient_request: "Patient asked to pause",
  sensitive_disclosure: "Sensitive disclosure — keep it off the record",
  third_party_present: "Someone else is in the room",
  administrative: "Administrative",
  technical: "Technical issue",
};

/**
 * Banner labels both parties see. `sensitive_disclosure` says a part of
 * the visit was deliberately not recorded and does not hint at what.
 */
export const PAUSE_REASON_BANNER_LABELS: Record<PauseReasonCode, string> = {
  patient_request: "the patient asked to pause",
  sensitive_disclosure: "this part of the visit was deliberately not recorded",
  third_party_present: "someone else entered the room",
  administrative: "an administrative pause",
  technical: "a technical issue",
};

export function remainingMsFromDeadline(autoResumeAt: Date | string | undefined, nowMs: number): number | null {
  if (!autoResumeAt) return null;
  const ms = autoResumeAt instanceof Date ? autoResumeAt.getTime() : Date.parse(autoResumeAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, ms - nowMs);
}

export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.floor(remainingMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function countdownMilestone(remainingMs: number): string | null {
  if (remainingMs === 0) return "Recording will resume when the server is ready.";
  if (remainingMs <= 10_000 && remainingMs > 9_000) return "About ten seconds until recording resumes.";
  if (remainingMs <= 60_000 && remainingMs > 59_000) return "About one minute until recording resumes.";
  return null;
}

export function pauseReasonBannerLabel(code: string | undefined): string {
  if (code && code in PAUSE_REASON_BANNER_LABELS) {
    return PAUSE_REASON_BANNER_LABELS[code as PauseReasonCode];
  }
  return "the reason was not recorded in preset form";
}

function pauseBannerCopy(
  currentUserRole: "doctor" | "patient",
  pausedByRole: "doctor" | "patient" | undefined,
  reasonLabel: string,
): string {
  if (pausedByRole === "patient") {
    return currentUserRole === "doctor"
      ? "The patient paused recording. They can resume it, or it will resume automatically."
      : "You paused recording. Resume when ready.";
  }
  return currentUserRole === "doctor"
    ? `Recording paused — ${reasonLabel}. Resume when ready.`
    : `Recording paused by your doctor — ${reasonLabel}.`;
}

export interface RecordingPausedIndicatorProps {
  /** Snapshot from `useRecordingState`. */
  state: RecordingStateSnapshot;
  /** Viewer role — drives copy. Both roles render when paused. */
  currentUserRole: "doctor" | "patient";
  /** Optional className for the paused banner only. */
  className?: string;
  /** Session + token enable the patient's live pause / own-resume control. */
  sessionId?: string;
  token?: string;
  onRefresh?: () => void;
}

export default function RecordingPausedIndicator({
  state,
  currentUserRole,
  className,
  sessionId,
  token,
  onRefresh,
}: RecordingPausedIndicatorProps): JSX.Element | null {
  const canControl =
    currentUserRole === "patient" && Boolean(sessionId && token);
  const showPatientPause = canControl && !state.paused;
  const showBanner = state.paused;
  const showPatientResume =
    canControl && state.paused && state.pausedByRole === "patient";

  if (!showPatientPause && !showBanner) return null;

  const reasonLabel = pauseReasonBannerLabel(state.pauseReason);
  const copy = pauseBannerCopy(currentUserRole, state.pausedByRole, reasonLabel);

  return (
    <>
      {showPatientPause && sessionId && token ? (
        <PatientRecordingPauseControl
          sessionId={sessionId}
          token={token}
          onSuccess={onRefresh}
        />
      ) : null}
      {showBanner ? (
        <PausedBanner
          copy={copy}
          className={className}
          autoResumeAt={state.autoResumeAt}
          showResume={showPatientResume}
          sessionId={sessionId}
          token={token}
          onRefresh={onRefresh}
        />
      ) : null}
    </>
  );
}

function PausedBanner({
  copy,
  className,
  autoResumeAt,
  showResume,
  sessionId,
  token,
  onRefresh,
}: {
  copy: string;
  className?: string;
  autoResumeAt?: Date;
  showResume: boolean;
  sessionId?: string;
  token?: string;
  onRefresh?: () => void;
}): JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const remainingMs = remainingMsFromDeadline(autoResumeAt, nowMs);
  const milestone = remainingMs == null ? null : countdownMilestone(remainingMs);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoResumeAt) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoResumeAt]);

  const handleResume = useCallback(async (): Promise<void> => {
    if (!sessionId || !token || resumeBusy) return;
    setResumeBusy(true);
    setResumeError(null);
    try {
      await apiResumeRecording(token, sessionId);
      onRefresh?.();
    } catch (err) {
      setResumeError(
        err instanceof Error ? err.message : "Failed to resume recording",
      );
    } finally {
      setResumeBusy(false);
    }
  }, [onRefresh, resumeBusy, sessionId, token]);

  return (
    <div
      data-testid="recording-paused-indicator"
      className={
        className ??
        "flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      }
    >
      <span aria-hidden="true" className="text-red-600">
        ●
      </span>
      <div className="leading-snug">
        <span role="status">{copy}</span>
        {remainingMs != null ? (
          <span className="mt-1 block text-xs text-red-700" data-testid="recording-pause-countdown" aria-hidden="true">
            {remainingMs === 0
              ? "Waiting for recording to resume…"
              : `Resumes in ${formatCountdown(remainingMs)}`}
          </span>
        ) : null}
        {milestone ? (
          <span className="sr-only" aria-live="polite">
            {milestone}
          </span>
        ) : null}
        {showResume ? (
          <div className="mt-2 flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => {
                void handleResume();
              }}
              disabled={resumeBusy}
              data-testid="patient-recording-resume"
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-70"
            >
              {resumeBusy ? "Resuming…" : "Resume recording"}
            </button>
            {resumeError ? (
              <span role="alert" className="text-xs text-red-700">
                {resumeError}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type PauseStage = "idle" | "confirming" | "submitting" | "error";

/**
 * Persistently visible while recording is live. Confirm tooltip, not a
 * modal — same reasoning as VideoRecordingIndicator L247–253: a modal
 * implies the patient needs permission for their own privacy.
 */
function PatientRecordingPauseControl({
  sessionId,
  token,
  onSuccess,
}: {
  sessionId: string;
  token: string;
  onSuccess?: () => void;
}): JSX.Element {
  const [stage, setStage] = useState<PauseStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpen = useCallback((): void => {
    if (stage === "submitting") return;
    setErrorMessage(null);
    setStage("confirming");
  }, [stage]);

  const handleCancel = useCallback((): void => {
    if (stage === "submitting") return;
    setStage("idle");
    setErrorMessage(null);
    triggerRef.current?.focus();
  }, [stage]);

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (stage === "submitting") return;
    setStage("submitting");
    setErrorMessage(null);
    try {
      await apiPauseRecording(token, sessionId);
      setStage("idle");
      onSuccess?.();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to pause recording",
      );
      setStage("error");
    }
  }, [onSuccess, sessionId, stage, token]);

  useEffect(() => {
    if (stage !== "confirming" && stage !== "error") return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleCancel, stage]);

  return (
    <div
      role="status"
      data-testid="patient-recording-pause"
      className="relative mx-3 mt-2 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
    >
      <span>Recording</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-label="Pause recording"
        aria-expanded={stage !== "idle"}
        aria-haspopup="dialog"
        disabled={stage === "submitting"}
        className="underline underline-offset-2 decoration-slate-500 hover:decoration-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:opacity-70"
      >
        Pause
      </button>
      {stage === "confirming" || stage === "submitting" || stage === "error" ? (
        <PauseConfirmTooltip
          stage={stage}
          errorMessage={errorMessage}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      ) : null}
    </div>
  );
}

function PauseConfirmTooltip({
  stage,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  stage: Extract<PauseStage, "confirming" | "submitting" | "error">;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const submitting = stage === "submitting";
  const tooltipId = useMemo(
    () => `patient-recording-pause-tooltip-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

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
  }, [onCancel, stage]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${tooltipId}-title`}
      aria-describedby={`${tooltipId}-body`}
      data-testid="patient-recording-pause-tooltip"
      className="absolute left-0 top-full z-30 mt-2 w-72 rounded-md border border-slate-200 bg-white p-3 text-left text-sm text-slate-800 shadow-lg"
    >
      <p id={`${tooltipId}-title`} className="font-medium">
        Pause recording?
      </p>
      <p id={`${tooltipId}-body`} className="mt-1 text-slate-600">
        Capture stops from this moment. The consult continues, and what
        was already recorded is not erased.
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
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-60"
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
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800 disabled:cursor-wait disabled:opacity-80"
        >
          {submitting ? "Pausing…" : "Yes, pause"}
        </button>
      </div>
    </div>
  );
}
