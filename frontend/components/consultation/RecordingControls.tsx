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
  pauseRecording as apiPauseRecording,
  resumeRecording as apiResumeRecording,
} from "@/lib/api";
import type { RecordingStateSnapshot } from "@/hooks/useRecordingState";

/**
 * Doctor-only pause/resume control for a live consult's recording.
 * Plan 07 · Task 28 · Decision 4 LOCKED.
 *
 * Rendering contract:
 *   - When `currentUserRole === 'patient'`, the component returns
 *     `null`. This keeps the same JSX in place in both rooms and
 *     eliminates the need for a role-check at each mount site.
 *   - When not paused, renders a "Pause recording" button.
 *   - When paused, renders a "Resume recording" button (no modal).
 *   - Pause opens a modal that enforces `reason.trim().length >= 5 && <= 200`.
 *
 * All network errors are surfaced as an inline `role="alert"` message
 * adjacent to the action, matching the "Coming soon" banner pattern
 * shipped in Task 20. 403 / 409 from the route surface with their
 * backend message verbatim because the backend's copy is doctrine-
 * authoritative for status gates.
 *
 * Mutation of the `state` prop is strictly the host's responsibility —
 * this component calls the REST endpoint, waits for 2xx, and then
 * relies on the companion-chat system message (`recording_paused` /
 * `recording_resumed`) to drive the next snapshot via the shared
 * `useRecordingState` hook. No optimistic local flip.
 */
export interface RecordingControlsProps {
  /** Session UUID. */
  sessionId:        string;
  /** Doctor JWT (patient-role renders null so this is unused for them). */
  token:            string;
  /** Viewer role. */
  currentUserRole:  "doctor" | "patient";
  /** Shared snapshot from `useRecordingState`. */
  state:            RecordingStateSnapshot;
  /**
   * Called after a successful pause request. Parent-side telemetry hook;
   * the UI itself relies on the Realtime stream for state flips.
   */
  onPauseSuccess?:  (reason: string) => void;
  onResumeSuccess?: () => void;
  className?:       string;
}

const REASON_MIN = 5;
const REASON_MAX = 200;

export default function RecordingControls({
  sessionId,
  token,
  currentUserRole,
  state,
  onPauseSuccess,
  onResumeSuccess,
  className,
}: RecordingControlsProps): JSX.Element | null {
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonFieldId = useId();
  const reasonCounterId = useId();
  const errorId = useId();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const reasonTrimmed = reason.trim();
  const reasonValid =
    reasonTrimmed.length >= REASON_MIN && reasonTrimmed.length <= REASON_MAX;

  useEffect(() => {
    if (modalOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [modalOpen]);

  const closeModal = useCallback((): void => {
    setModalOpen(false);
    setReason("");
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
    if (!reasonValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPauseRecording(token, sessionId, reasonTrimmed);
      onPauseSuccess?.(reasonTrimmed);
      setModalOpen(false);
      setReason("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to pause recording";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, onPauseSuccess, reasonTrimmed, reasonValid, sessionId, token]);

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
      {!state.paused ? (
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
      )}

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
          aria-labelledby={`${reasonFieldId}-title`}
          onKeyDown={onModalKeyDown}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="recording-pause-modal"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2
              id={`${reasonFieldId}-title`}
              className="mb-1 text-base font-semibold text-gray-900"
            >
              Pause recording
            </h2>
            <p className="mb-3 text-sm text-gray-600">
              Both you and the patient will see a persistent banner with this
              reason while recording is paused.
            </p>

            <label
              htmlFor={reasonFieldId}
              className="mb-1 block text-sm font-medium text-gray-800"
            >
              Reason
            </label>
            <textarea
              id={reasonFieldId}
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX + 50))}
              placeholder="e.g. 'Patient stepped away to fetch medication.'"
              maxLength={REASON_MAX + 50}
              rows={4}
              aria-describedby={`${reasonCounterId} ${error ? errorId : ""}`.trim()}
              className="mb-1 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="recording-pause-reason-textarea"
            />
            <div
              id={reasonCounterId}
              aria-live="polite"
              className={`mb-2 text-right text-xs ${
                reasonTrimmed.length > REASON_MAX
                  ? "text-red-700"
                  : "text-gray-500"
              }`}
            >
              {reasonTrimmed.length} / {REASON_MAX}
              {reasonTrimmed.length < REASON_MIN && reasonTrimmed.length > 0
                ? ` · at least ${REASON_MIN} required`
                : ""}
            </div>

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
