"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  extendRecordingPause as apiExtendRecordingPause,
  pauseRecording as apiPauseRecording,
  resumeRecording as apiResumeRecording,
} from "@/lib/api";
import type { RecordingStateSnapshot } from "@/hooks/useRecordingState";
import {
  PAUSE_REASON_CODES,
  PAUSE_REASON_PICKER_LABELS,
  type PauseReasonCode,
} from "./RecordingPausedIndicator";

export const OPEN_RECORDING_PAUSE_EVENT = "haloaid-open-recording-pause";

/**
 * Doctor-only pause/resume control for a live consult's recording.
 * rec-15: pause reason is a closed picker of five codes. No textarea.
 *
 * Mutation of the `state` prop is strictly the host's responsibility —
 * this component calls the REST endpoint, waits for 2xx, and then
 * relies on the companion-chat system message to drive the next
 * snapshot via `useRecordingState`. No optimistic local flip.
 */
export interface RecordingControlsProps {
  sessionId: string;
  token: string;
  currentUserRole: "doctor" | "patient";
  state: RecordingStateSnapshot;
  onPauseSuccess?: (reasonCode: PauseReasonCode) => void;
  onResumeSuccess?: () => void;
  /** Rehydrate countdown after an extension (GET /recording/state). */
  onRefresh?: () => void;
  className?: string;
  /** Hide the trigger buttons (cockpit uses More ▾). Modal still works. */
  hideTrigger?: boolean;
}

export default function RecordingControls({
  sessionId,
  token,
  currentUserRole,
  state,
  onPauseSuccess,
  onResumeSuccess,
  onRefresh,
  className,
  hideTrigger = false,
}: RecordingControlsProps): JSX.Element | null {
  const [modalOpen, setModalOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<PauseReasonCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const groupId = useId();
  const errorId = useId();

  const firstRadioRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const reasonValid = reasonCode !== null;

  useEffect(() => {
    const open = (): void => {
      setModalOpen(true);
    };
    window.addEventListener(OPEN_RECORDING_PAUSE_EVENT, open);
    return () => {
      window.removeEventListener(OPEN_RECORDING_PAUSE_EVENT, open);
    };
  }, []);

  useEffect(() => {
    if (modalOpen && firstRadioRef.current) {
      firstRadioRef.current.focus();
    }
  }, [modalOpen]);

  const closeModal = useCallback((): void => {
    setModalOpen(false);
    setReasonCode(null);
    setError(null);
    setBusy(false);
  }, []);

  const onModalKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        closeModal();
      }
    },
    [busy, closeModal],
  );

  const handlePauseSubmit = useCallback(async (): Promise<void> => {
    if (!reasonCode || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPauseRecording(token, sessionId, reasonCode);
      onPauseSuccess?.(reasonCode);
      setModalOpen(false);
      setReasonCode(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to pause recording";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, onPauseSuccess, reasonCode, sessionId, token]);

  const canExtend = state.paused && state.autoResumeExtensionsUsed !== 1;

  const handleExtendClick = useCallback(async (): Promise<void> => {
    if (!canExtend || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiExtendRecordingPause(token, sessionId);
      onRefresh?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to extend pause";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, canExtend, onRefresh, sessionId, token]);

  const handleResumeClick = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiResumeRecording(token, sessionId);
      onResumeSuccess?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resume recording";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, onResumeSuccess, sessionId, token]);

  if (currentUserRole !== "doctor") return null;

  return (
    <div className={className ?? "flex flex-col items-start gap-2"}>
      {!hideTrigger ? (
        !state.paused ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={state.loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="recording-pause-button"
          >
            <span aria-hidden="true">⏸</span>
            Pause recording
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleResumeClick()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="recording-resume-button"
          >
            <span aria-hidden="true">▶</span>
            {busy ? "Resuming…" : "Resume recording"}
          </button>
        )
      ) : null}

      {state.paused && canExtend ? (
        <button
          type="button"
          onClick={() => void handleExtendClick()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="recording-pause-extend-button"
        >
          {busy ? "Extending…" : "Extend pause once"}
        </button>
      ) : null}

      {error && !modalOpen ? (
        <p
          role="alert"
          className="text-xs text-red-700"
          data-testid="recording-controls-error"
        >
          {error}
        </p>
      ) : null}

      {modalOpen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={onModalKeyDown}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="recording-pause-modal"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 id={titleId} className="mb-1 text-base font-semibold text-gray-900">
              Pause recording
            </h2>
            <p className="mb-3 text-sm text-gray-600">
              The patient will see a short notice that recording is paused
              and why, in plain language. They will not see a typed note.
            </p>

            <fieldset className="mb-3">
              <legend id={groupId} className="mb-2 text-sm font-medium text-gray-800">
                Why are you pausing?
              </legend>
              <div
                role="radiogroup"
                aria-labelledby={groupId}
                className="flex flex-col gap-2"
              >
                {PAUSE_REASON_CODES.map((code, index) => (
                  <label
                    key={code}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    <input
                      ref={index === 0 ? firstRadioRef : undefined}
                      type="radio"
                      name="recording-pause-reason"
                      value={code}
                      checked={reasonCode === code}
                      onChange={() => setReasonCode(code)}
                      className="mt-0.5"
                      data-testid={`recording-pause-reason-${code}`}
                    />
                    <span>{PAUSE_REASON_PICKER_LABELS[code]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error ? (
              <p
                id={errorId}
                role="alert"
                className="mb-2 text-xs text-red-700"
              >
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                data-testid="recording-pause-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePauseSubmit()}
                disabled={!reasonValid || busy}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="recording-pause-modal-submit"
              >
                {busy ? "Pausing…" : "Pause recording"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
