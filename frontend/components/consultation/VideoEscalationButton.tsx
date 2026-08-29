"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";
import {
  requestVideoEscalation,
  VideoEscalationError,
  type VideoEscalationPresetReason,
} from "@/lib/api/recording-escalation";
import {
  useVideoEscalationState,
  formatMinuteSecond,
  videoEscalationRequestsLeftCopy,
} from "@/hooks/useVideoEscalationState";

/**
 * Doctor-only video-escalation surface.
 *
 * Plan 08 · Task 40 · Decision 10 LOCKED.
 *
 * Renders a single button in the video room's control bar. Clicking opens
 * a reason-capture modal. Submitting the modal fires a POST to the Task 41
 * endpoint and transitions the modal to a waiting view with a live
 * server-synced countdown. The patient's response (allow / decline /
 * timeout) is surfaced via Supabase Postgres-changes on
 * `video_escalation_audit` (handled inside `useVideoEscalationState`).
 *
 * ## Rendering contract
 *
 *   - `currentUserRole === 'patient'` → component returns `null`.
 *   - No session/token yet        → disabled button with "Loading…" label.
 *   - `idle`                       → primary CTA.
 *   - `requesting`                 → disabled button + waiting modal
 *                                    (countdown driven by `expiresAt`).
 *   - `cooldown`                   → disabled button showing "Try again in
 *                                    M:SS"; auto re-enables when cooldown
 *                                    expires.
 *   - `locked: max_attempts`       → permanently disabled; tooltip pins
 *                                    the policy rationale.
 *   - `locked: already_recording_video` → component returns `null` (the
 *                                         `<VideoRecordingIndicator>`
 *                                         from Task 42 takes the real
 *                                         estate).
 *
 * ## Why the modal has no free-text note
 *
 * rec-15 closed the same hole on pause: a doctor-typed sentence is PHI
 * in a governance table. The patient still sees a reason — the server
 * writes a canonical sentence for the chosen preset (Migration 070's
 * 5..200 CHECK stays satisfied). REC4-D9 deferred *optional* free text
 * because relaxing the column needs a migration; this path never writes
 * client text.
 *
 * ## Why close-the-modal does NOT cancel the pending request
 *
 * See task-40 Note #2 — adding a [Cancel request] CTA creates a race
 * with the patient's simultaneous consent + a confusing UX where the
 * patient's consent modal outlives the doctor's. v1 doctor waits it out.
 *
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-40-doctor-video-escalation-button-and-reason-modal.md
 */

const PRESET_OPTIONS: Array<{ code: VideoEscalationPresetReason; label: string }> = [
  { code: "visible_symptom",    label: "Need to see a visible symptom"    },
  { code: "document_procedure", label: "Need to document a procedure"     },
  { code: "patient_request",    label: "Patient request"                  },
  { code: "other",              label: "Other clinical reason"            },
];

export interface VideoEscalationButtonProps {
  /** `consultation_sessions.id`. */
  sessionId:       string;
  /**
   * Doctor's Supabase dashboard JWT. Signs the POST + the Realtime
   * channel. When null, the button shows as disabled "Loading…" until
   * the parent resolves auth.
   */
  token:           string | null;
  /**
   * Viewer role. Patient-side mounts are supported but return `null` —
   * matches `<RecordingControls>` so host components can mount the button
   * unconditionally and the component filters internally.
   */
  currentUserRole: "doctor" | "patient";
  className?:      string;
}

export default function VideoEscalationButton({
  sessionId,
  token,
  currentUserRole,
  className,
}: VideoEscalationButtonProps): JSX.Element | null {
  // Resolve the doctor's Supabase auth UID lazily. The server cross-checks
  // this against the Bearer JWT (`auth.uid()`), so a bogus client value
  // gets rejected with 403 — the fetch is a convenience for the server's
  // audit write, not a security boundary. Mirrors the `chatAuth` effect
  // elsewhere in the video room.
  const [doctorId, setDoctorId] = useState<string | null>(null);
  useEffect(() => {
    if (currentUserRole !== "doctor") return;
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getSession();
        if (cancelled) return;
        setDoctorId(data.session?.user.id ?? null);
      } catch {
        // Intentionally swallowed — the button simply stays disabled
        // ("Loading…") if we can't resolve Supabase auth on the client.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserRole]);
  const {
    state,
    loading,
    cooldownSecondsRemaining,
    waitingSecondsRemaining,
    markRequesting,
    markLocked,
    refresh,
  } = useVideoEscalationState({
    sessionId,
    token,
    enabled: currentUserRole === "doctor" && Boolean(sessionId),
  });

  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalStage, setModalStage] = useState<
    "idle" | "requesting" | "declined" | "timedout" | "stopped"
  >("idle");
  const [preset,     setPreset]     = useState<VideoEscalationPresetReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const titleId      = useId();
  const waitingLiveId = useId();

  const dialogRef   = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!modalOpen || modalStage !== "idle") return;
    const first = dialogRef.current?.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    first?.focus();
  }, [modalOpen, modalStage]);

  // --- Derived: state → modalStage autoroll when the Realtime event lands ---
  // When the doctor is in the waiting view and the hook transitions out of
  // `requesting` (patient responded or local timeout), we flip the modal
  // stage to the matching banner. If the modal isn't open (e.g. doctor
  // closed it during wait), we just skip — the button picks up the new
  // state from the hook naturally.
  useEffect(() => {
    if (!modalOpen) return;
    if (modalStage !== "requesting") return;
    if (state.kind === "locked" && state.reason === "already_recording_video") {
      // Patient allowed → modal closes, indicator takes over.
      setModalOpen(false);
      return;
    }
    if (state.kind === "cooldown") {
      if (state.lastOutcome === "timeout") {
        setModalStage("timedout");
      } else if (state.lastOutcome === "stopped") {
        setModalStage("stopped");
      } else {
        setModalStage("declined");
      }
    }
  }, [state, modalOpen, modalStage]);

  // -------------------------------------------------------------------------
  // Hidden-render flag — computed here rather than returned early so the
  // rules-of-hooks lint is honoured (all hooks below must run on every
  // render). Actual `return null` happens at the render gate at the bottom.
  // -------------------------------------------------------------------------
  const hidden =
    currentUserRole === "patient" ||
    (state.kind === "locked" && state.reason === "already_recording_video");

  const presetValid = preset !== null;

  // -------------------------------------------------------------------------
  // Button label + disabled state
  // -------------------------------------------------------------------------
  const buttonMeta = useMemoButtonMeta({
    state,
    loading,
    hasAuth: Boolean(token) && Boolean(sessionId) && Boolean(doctorId),
    cooldownSecondsRemaining,
    waitingSecondsRemaining,
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const openModal = useCallback((): void => {
    setPreset(null);
    setSubmitError(null);
    setSubmitting(false);
    setModalStage("idle");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback((): void => {
    // Closing during 'requesting' is fine (task-40 acceptance criterion:
    // [Close] CTA doesn't cancel the server-side timer). The button keeps
    // showing the countdown inline.
    setModalOpen(false);
    setSubmitError(null);
  }, []);

  const onModalKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key !== "Escape") return;
      // Esc closes during idle + terminal stages, NOT during the first
      // submission attempt (submitting) — avoids dropping the in-flight POST.
      if (submitting) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      closeModal();
    },
    [closeModal, submitting],
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!preset || submitting) return;
    if (!token || !doctorId) {
      setSubmitError("Authentication expired. Please refresh the page.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await requestVideoEscalation(token, {
        sessionId,
        doctorId,
        presetReasonCode: preset,
      });
      const fallbackUsed: 1 | 2 =
        state.kind === "idle" && state.attemptsUsed === 1 ? 2 : 1;
      markRequesting({
        requestId:    result.requestId,
        expiresAt:    result.expiresAt,
        attemptsUsed: result.attemptsUsed ?? fallbackUsed,
      });
      setModalStage("requesting");
    } catch (err) {
      if (err instanceof VideoEscalationError) {
        if (err.code === "RATE_LIMITED") {
          // Don't guess `attemptsUsed` — a 30s stop debounce is also a
          // 429, and stamping used=2 would lie (rec-23 §1.6).
          await refresh();
          setModalOpen(false);
          return;
        }
        if (err.code === "SESSION_ENDED") {
          markLocked("max_attempts");
          setModalOpen(false);
          return;
        }
        setSubmitError(err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Couldn't send the request. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    doctorId,
    markLocked,
    markRequesting,
    refresh,
    preset,
    sessionId,
    state,
    submitting,
    token,
  ]); // doctorId participates via the guard above.

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (hidden) return null;

  const baseButtonClass =
    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className={className ?? "flex flex-col items-start gap-2"}>
      <button
        type="button"
        onClick={openModal}
        disabled={buttonMeta.disabled}
        aria-disabled={buttonMeta.disabled}
        aria-label={buttonMeta.ariaLabel}
        title={buttonMeta.tooltip}
        className={`${baseButtonClass} ${buttonMeta.palette}`}
        data-testid="video-escalation-button"
        data-state={state.kind}
      >
        <span aria-hidden="true">{buttonMeta.icon}</span>
        <span>{buttonMeta.label}</span>
      </button>

      {/* Decline/timeout cooldown caption under the button (helper text) */}
      {state.kind === "cooldown" ? (
        <p className="text-xs text-gray-500" aria-live="polite">
          {videoEscalationRequestsLeftCopy(state.attemptsUsed)}
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
          data-testid="video-escalation-modal"
          data-stage={modalStage}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            {modalStage === "idle" ? (
              <>
                <h2 id={titleId} className="mb-1 text-base font-semibold text-gray-900">
                  Start video recording
                </h2>
                <p className="mb-4 text-sm text-gray-600">
                  The patient will be asked to consent before video is
                  recorded. Choose why you need video — they will see
                  this reason.
                </p>

                <fieldset className="mb-4">
                  <legend className="mb-2 block text-sm font-medium text-gray-800">Reason</legend>
                  <div
                    role="radiogroup"
                    aria-label="Reason preset"
                    className="flex flex-col gap-1"
                  >
                    {PRESET_OPTIONS.map((opt) => (
                      <label
                        key={opt.code}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-800 hover:bg-gray-50"
                      >
                        <input
                          type="radio"
                          name="video-escalation-preset"
                          value={opt.code}
                          checked={preset === opt.code}
                          onChange={() => setPreset(opt.code)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {submitError ? (
                  <p role="alert" className="mb-2 text-xs text-red-700">
                    {submitError}
                  </p>
                ) : null}

                <p className="mb-3 text-xs text-gray-500">
                  {remainingAttemptsCopy(state)}
                </p>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    data-testid="video-escalation-modal-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={!presetValid || submitting}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="video-escalation-modal-submit"
                  >
                    {submitting ? "Sending…" : "Send request"}
                  </button>
                </div>
              </>
            ) : modalStage === "requesting" ? (
              <>
                <h2 id={titleId} className="mb-1 text-base font-semibold text-gray-900">
                  Waiting for patient to respond
                </h2>
                <div
                  id={waitingLiveId}
                  aria-live="polite"
                  className="my-4 text-center text-sm text-gray-800"
                >
                  <span aria-hidden="true" className="mr-1">⏳</span>
                  {waitingSecondsRemaining !== null ? (
                    <>
                      <span className="font-semibold">{waitingSecondsRemaining}</span>{" "}
                      {waitingSecondsRemaining === 1 ? "second" : "seconds"} remaining
                    </>
                  ) : (
                    "Waiting…"
                  )}
                </div>
                <p className="mb-3 text-sm text-gray-600">
                  The patient has been asked to consent to video recording.
                  They have 60 seconds to respond. If no response, the
                  request will auto-decline.
                </p>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    data-testid="video-escalation-modal-close-waiting"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : modalStage === "declined" || modalStage === "timedout" || modalStage === "stopped" ? (
              <>
                <h2 id={titleId} className="mb-1 text-base font-semibold text-gray-900">
                  {modalStage === "declined"
                    ? "Patient declined video recording"
                    : modalStage === "timedout"
                      ? "Patient did not respond in time"
                      : "Video recording stopped"}
                </h2>
                {modalStage === "declined" ? (
                  <p className="mb-3 text-sm text-gray-600">
                    No reason given.
                  </p>
                ) : null}
                <p className="mb-2 text-sm text-gray-800">
                  {cooldownSecondsRemaining !== null && cooldownSecondsRemaining > 0
                    ? `You can try again in ${formatMinuteSecond(cooldownSecondsRemaining)}.`
                    : "You can try again now."}
                </p>
                <p className="mb-4 text-xs text-gray-500">
                  {videoEscalationRequestsLeftCopy(
                    state.kind === "cooldown" || state.kind === "idle"
                      ? state.attemptsUsed
                      : 0,
                  )}
                </p>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    data-testid="video-escalation-modal-close-terminal"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ButtonMeta {
  label:     string;
  ariaLabel: string;
  icon:      string;
  disabled:  boolean;
  tooltip:   string;
  palette:   string;
}

function useMemoButtonMeta({
  state,
  loading,
  hasAuth,
  cooldownSecondsRemaining,
  waitingSecondsRemaining,
}: {
  state:                    ReturnType<typeof useVideoEscalationState>["state"];
  loading:                  boolean;
  hasAuth:                  boolean;
  cooldownSecondsRemaining: number | null;
  waitingSecondsRemaining:  number | null;
}): ButtonMeta {
  return useMemo((): ButtonMeta => {
    const idlePalette =
      "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 focus-visible:ring-blue-500";
    const disabledPalette =
      "border-gray-300 bg-white text-gray-500 focus-visible:ring-gray-400";

    if (!hasAuth || loading) {
      return {
        label:     "Start video recording",
        ariaLabel: "Start video recording; loading",
        icon:      "🎥+",
        disabled:  true,
        tooltip:   "Loading…",
        palette:   disabledPalette,
      };
    }

    if (state.kind === "requesting") {
      return {
        label:     waitingSecondsRemaining !== null
          ? `Waiting for patient… ${waitingSecondsRemaining}s`
          : "Waiting for patient…",
        ariaLabel: "Waiting for patient consent",
        icon:      "⏳",
        disabled:  true,
        tooltip:   "Waiting for the patient to respond.",
        palette:   disabledPalette,
      };
    }

    if (state.kind === "cooldown") {
      const remaining = cooldownSecondsRemaining ?? 0;
      if (state.attemptsUsed >= 2) {
        return {
          label:     "Max requests reached",
          ariaLabel: "Max video recording requests reached per consult",
          icon:      "🎥",
          disabled:  true,
          tooltip:   "Max 2 video recording requests per consult reached per safety policy.",
          palette:   disabledPalette,
        };
      }
      return {
        label:     `Try again in ${formatMinuteSecond(remaining)}`,
        ariaLabel: `Video recording available in ${formatMinuteSecond(remaining)}`,
        icon:      "🎥+",
        disabled:  true,
        tooltip:   "Another request can be sent once the cooldown ends.",
        palette:   disabledPalette,
      };
    }

    if (state.kind === "locked") {
      if (state.reason === "max_attempts") {
        return {
          label:     "Max requests reached",
          ariaLabel: "Max video recording requests reached per consult",
          icon:      "🎥",
          disabled:  true,
          tooltip:   "Max 2 video recording requests per consult reached per safety policy.",
          palette:   disabledPalette,
        };
      }
      // already_recording_video — the component short-circuits to `null`
      // before reaching this path. Return a sane default defensively.
      return {
        label:     "Video recording",
        ariaLabel: "Video recording is active",
        icon:      "🎥",
        disabled:  true,
        tooltip:   "Video recording is already active.",
        palette:   disabledPalette,
      };
    }

    // idle
    return {
      label:     "Start video recording",
      ariaLabel: "Start video recording; patient consent required",
      icon:      "🎥+",
      disabled:  false,
      tooltip:   state.attemptsUsed === 1
        ? "1 request left this consult."
        : "Ask the patient for permission to record video.",
      palette:   idlePalette,
    };
  }, [cooldownSecondsRemaining, hasAuth, loading, state, waitingSecondsRemaining]);
}

function remainingAttemptsCopy(
  state: ReturnType<typeof useVideoEscalationState>["state"],
): string {
  if (state.kind === "cooldown" || state.kind === "idle") {
    if (state.attemptsUsed <= 0) return "You have 2 requests per consult.";
    if (state.attemptsUsed === 1) return "You have 1 request left per consult.";
    return "No requests left per consult.";
  }
  return "You have 2 requests per consult.";
}
