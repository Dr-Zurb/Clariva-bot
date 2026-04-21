"use client";

/**
 * Patient-side full-screen consent modal for Plan 08 · Task 41 video
 * escalation.
 *
 * ## What this component is responsible for
 *
 *   1. **Rendering.** When a pending request exists for the current
 *      session, renders a full-screen overlay that takes over the
 *      patient's video room. The overlay displays:
 *        - the doctor's reason (verbatim, in quotes)
 *        - the preset pill (e.g. "Visible symptom")
 *        - a live 60-second countdown anchored to `expiresAt`
 *        - two CTAs: `[Decline]` (secondary) / `[Allow]` (primary)
 *
 *   2. **Submitting the decision.** On CTA click, POSTs to
 *      `/video-escalation-requests/:requestId/respond`. Both CTAs
 *      disable while the request is in flight. After a successful
 *      200 with `accepted: true`, the modal transitions through a
 *      brief acknowledgement frame (`"Recording…"` for allow, silent
 *      close for decline) before unmounting. Network/HTTP errors
 *      surface inline error copy and re-enable the CTAs for retry.
 *
 *   3. **Race-safe close.** If the server-side 60s timeout fires
 *      while the modal is open (Realtime UPDATE → `patient_response:
 *      'timeout'`), the `onResolved('timeout')` callback from the
 *      parent hook replaces the CTAs with a "Request timed out"
 *      terminal frame for 2s before unmounting. The Allow/Decline
 *      CTAs disable immediately so the patient can't submit a decision
 *      the server will reject anyway.
 *
 * ## What this component does NOT own
 *
 *   - **Deciding when to mount.** The parent hook
 *     (`usePatientVideoConsentRequest`) watches Realtime + initial
 *     state and exposes `pending: PendingConsentRequest | null`.
 *     When non-null, the parent mounts this component.
 *
 *   - **Starting/stopping the recording.** The server flips the Twilio
 *     rule on `allow` — the patient's local video tile already tracks
 *     the recording indicator via `<RecordingPausedIndicator>` /
 *     `<VideoRecordingIndicator>` (Task 42).
 *
 *   - **Offering the patient a "Mute video" workaround.** Decision 10
 *     LOCKED; Plan 08 v1 keeps the call running audio-only if the
 *     patient declines, without surfacing a toggle.
 *
 * ## Accessibility
 *
 *   - `role="dialog"` + `aria-modal="true"` + `aria-labelledby`.
 *   - Focus trap: the modal focuses its first primary CTA on mount and
 *     keeps keyboard focus inside via `inert` on the background.
 *   - `aria-live="polite"` on the countdown so screen readers
 *     announce the seconds without barraging the patient.
 *   - Escape key is intentionally disabled (see Notes #3 in task-41) —
 *     pressing Escape on a critical consent prompt should NOT be
 *     interpreted as either allow or decline. The patient must pick.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-41-patient-video-consent-modal-and-escalation-service.md
 * @see frontend/lib/realtime-video-escalation.ts
 * @see frontend/components/consultation/VideoEscalationButton.tsx (doctor-side counterpart)
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  respondToVideoEscalation,
  VideoEscalationError,
  type VideoEscalationDecision,
  type VideoEscalationPresetReason,
} from "@/lib/api/recording-escalation";
import {
  usePatientVideoConsentRequest,
  type PatientEscalationOutcome,
  type PendingConsentRequest,
} from "@/lib/realtime-video-escalation";

export interface VideoConsentModalProps {
  /** `consultation_sessions.id`. When null, the modal never renders. */
  sessionId: string | null | undefined;
  /**
   * Patient's Supabase-session JWT. Used for the initial GET probe,
   * for the POST `/respond`, and implicitly by the Supabase client for
   * the Realtime channel.
   */
  token: string | null | undefined;
  /** Flip to `false` when the call ends so the hook stops watching. */
  enabled?: boolean;
}

/**
 * Stages of the modal's lifecycle. Distinct from the hook's pending
 * state because the modal also has two short "terminal" frames the
 * hook doesn't care about:
 *   - `acknowledged` — patient hit Allow; server accepted; we show
 *     "Recording…" for 1.2s so the transition is legible.
 *   - `timed-out`     — Realtime UPDATE arrived with `timeout`; show
 *     "Request timed out" for 2s before closing.
 */
type ModalStage =
  | { kind: "prompt" }
  | { kind: "submitting"; decision: VideoEscalationDecision }
  | { kind: "acknowledged"; decision: VideoEscalationDecision }
  | { kind: "timed-out" };

const PRESET_LABELS: Record<VideoEscalationPresetReason, string> = {
  visible_symptom:    "Visible symptom",
  document_procedure: "Documenting a procedure",
  patient_request:    "Patient request",
  other:              "Other",
};

const ACK_DISMISS_MS = 1200;
const TIMEOUT_DISMISS_MS = 2000;

/**
 * Orchestrator — decides whether to render anything, and proxies
 * `pending` down into the actual dialog. Having a thin wrapper keeps
 * the dialog component pure (takes a `PendingConsentRequest` directly)
 * which makes it trivially testable.
 */
export default function VideoConsentModal(props: VideoConsentModalProps): JSX.Element | null {
  const { sessionId, token, enabled = true } = props;
  const [terminalStage, setTerminalStage] = useState<
    | { kind: "acknowledged"; decision: VideoEscalationDecision }
    | { kind: "timed-out" }
    | null
  >(null);
  // Snapshot of the request the terminal stage belongs to. Lets us
  // keep rendering the dialog-shell for the ACK/timeout flash after
  // the hook has already nulled `pending`.
  const [terminalRequest, setTerminalRequest] = useState<PendingConsentRequest | null>(null);

  const handleResolved = useCallback(
    (outcome: PatientEscalationOutcome) => {
      if (outcome === "timeout") {
        setTerminalStage((prev) => prev ?? { kind: "timed-out" });
        return;
      }
      // `allow` | `decline` resolving via Realtime while we're open is
      // the server acknowledging our own POST — nothing to flash for
      // decline; for allow the acknowledged frame is set in
      // `handleSubmit` the moment the POST returns 200. The Realtime
      // event closes the modal by flipping `pending` to null.
    },
    [],
  );

  const { pending, loading } = usePatientVideoConsentRequest({
    sessionId,
    token,
    enabled,
    onResolved: handleResolved,
  });

  // Capture the most recent pending request so the timed-out overlay
  // can keep showing the reason while the main `pending` state is null.
  useEffect(() => {
    if (pending) setTerminalRequest(pending);
  }, [pending]);

  // Auto-dismiss the timed-out overlay after 2s.
  useEffect(() => {
    if (terminalStage?.kind !== "timed-out") return;
    const t = window.setTimeout(() => setTerminalStage(null), TIMEOUT_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [terminalStage]);

  if (!enabled) return null;
  if (loading && !pending && !terminalStage) return null;

  if (pending) {
    return (
      <ConsentDialog
        pending={pending}
        token={token ?? null}
        onAcknowledged={(decision) => setTerminalStage({ kind: "acknowledged", decision })}
        externalTerminalStage={terminalStage}
        onTerminalDismiss={() => setTerminalStage(null)}
      />
    );
  }

  // Pending is null but a terminal stage still holds — render the
  // fading shell so the patient sees the outcome copy before the
  // overlay disappears. Use the last-seen request for reason text.
  if (terminalStage && terminalRequest) {
    return (
      <ConsentDialog
        pending={terminalRequest}
        token={token ?? null}
        onAcknowledged={() => { /* already acknowledged */ }}
        externalTerminalStage={terminalStage}
        onTerminalDismiss={() => setTerminalStage(null)}
      />
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Inner dialog — receives a non-null request and owns the stage machine.
// ---------------------------------------------------------------------------

interface ConsentDialogProps {
  pending: PendingConsentRequest;
  token:   string | null;
  onAcknowledged: (decision: VideoEscalationDecision) => void;
  externalTerminalStage:
    | { kind: "acknowledged"; decision: VideoEscalationDecision }
    | { kind: "timed-out" }
    | null;
  onTerminalDismiss: () => void;
}

function ConsentDialog({
  pending,
  token,
  onAcknowledged,
  externalTerminalStage,
  onTerminalDismiss,
}: ConsentDialogProps): JSX.Element {
  const [stage, setStage] = useState<ModalStage>({ kind: "prompt" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const allowBtnRef = useRef<HTMLButtonElement | null>(null);

  const titleId = useId();
  const bodyId  = useId();
  const countdownId = useId();

  // --- Countdown (1Hz, wall-clock anchored to `expiresAt`) ---
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const secondsRemaining = useMemo((): number => {
    const expiresAtMs = Date.parse(pending.expiresAt);
    if (!Number.isFinite(expiresAtMs)) return 0;
    return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  }, [pending.expiresAt, nowMs]);

  // --- Focus primary CTA on mount (accessibility) ---
  useEffect(() => {
    if (stage.kind !== "prompt") return;
    const t = window.setTimeout(() => {
      allowBtnRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [stage.kind]);

  // --- If the parent passed a terminal stage (Realtime timeout), promote ---
  useEffect(() => {
    if (!externalTerminalStage) return;
    if (externalTerminalStage.kind === "timed-out") {
      setStage({ kind: "timed-out" });
    } else if (externalTerminalStage.kind === "acknowledged") {
      setStage(externalTerminalStage);
    }
  }, [externalTerminalStage]);

  const handleSubmit = useCallback(async (decision: VideoEscalationDecision): Promise<void> => {
    if (!token) {
      setSubmitError("You've been signed out. Please refresh the page.");
      return;
    }
    setSubmitError(null);
    setStage({ kind: "submitting", decision });
    try {
      const result = await respondToVideoEscalation(token, {
        requestId: pending.requestId,
        decision,
      });
      if (result.accepted) {
        setStage({ kind: "acknowledged", decision });
        onAcknowledged(decision);
        // For `decline` there's nothing to celebrate — close immediately;
        // for `allow` hold the "Recording…" frame briefly so the
        // transition to the video tile is legible.
        const dismissMs = decision === "allow" ? ACK_DISMISS_MS : 400;
        window.setTimeout(onTerminalDismiss, dismissMs);
      } else {
        // `accepted:false` means the server already resolved the request
        // (race with timeout / duplicate click). Show the reason copy
        // and close shortly.
        const copy = RESPOND_NEGATIVE_COPY[result.reason] ?? "This request is no longer active.";
        setSubmitError(copy);
        setStage({ kind: "prompt" });
        // Keep the modal up briefly so the patient reads the note; the
        // Realtime UPDATE will drop `pending` to null on its own.
      }
    } catch (err) {
      if (err instanceof VideoEscalationError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
      setStage({ kind: "prompt" });
    }
  }, [token, pending.requestId, onAcknowledged, onTerminalDismiss]);

  const presetLabel = pending.presetReasonCode
    ? PRESET_LABELS[pending.presetReasonCode]
    : null;

  const ctaDisabled =
    stage.kind === "submitting" ||
    stage.kind === "acknowledged" ||
    stage.kind === "timed-out";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      data-testid="video-consent-modal"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        {/* --- Header --- */}
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-xl"
          >
            🎥
          </span>
          <h2
            id={titleId}
            className="text-lg font-semibold text-gray-900"
          >
            Your doctor would like to record video
          </h2>
        </div>

        {/* --- Body --- */}
        <div id={bodyId} className="mb-4 space-y-3 text-sm text-gray-700">
          {presetLabel ? (
            <p>
              <span className="mr-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {presetLabel}
              </span>
            </p>
          ) : null}
          <p>
            <span className="block text-xs uppercase tracking-wide text-gray-500">
              Reason
            </span>
            <span className="block rounded-md border border-gray-200 bg-gray-50 px-3 py-2 italic text-gray-900">
              &ldquo;{pending.reason}&rdquo;
            </span>
          </p>
          <p className="text-xs text-gray-500">
            Recording starts immediately if you allow. You can stop it at
            any time from the recording controls.
          </p>
        </div>

        {/* --- Stage-specific frames --- */}
        {stage.kind === "timed-out" ? (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
            This request timed out. Your doctor may send another.
          </div>
        ) : stage.kind === "acknowledged" ? (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            {stage.decision === "allow"
              ? "Thanks — video recording has started."
              : "Thanks — your doctor has been notified."}
          </div>
        ) : (
          <>
            {/* Countdown */}
            <div
              id={countdownId}
              aria-live="polite"
              className="mb-4 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
            >
              <span>Respond within</span>
              <span className="font-semibold tabular-nums">
                {secondsRemaining} {secondsRemaining === 1 ? "second" : "seconds"}
              </span>
            </div>

            {/* Error */}
            {submitError ? (
              <p role="alert" className="mb-3 text-xs text-red-700">
                {submitError}
              </p>
            ) : null}

            {/* CTAs */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => void handleSubmit("decline")}
                disabled={ctaDisabled}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="video-consent-modal-decline"
              >
                {stage.kind === "submitting" && stage.decision === "decline"
                  ? "Sending…"
                  : "Decline"}
              </button>
              <button
                ref={allowBtnRef}
                type="button"
                onClick={() => void handleSubmit("allow")}
                disabled={ctaDisabled}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="video-consent-modal-allow"
                aria-describedby={countdownId}
              >
                {stage.kind === "submitting" && stage.decision === "allow"
                  ? "Starting…"
                  : "Allow"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy for the server's `accepted: false` reasons.
// ---------------------------------------------------------------------------

type RespondNegativeReason =
  | "already_responded"
  | "already_timed_out"
  | "not_a_participant";

const RESPOND_NEGATIVE_COPY: Record<RespondNegativeReason, string> = {
  already_responded:  "This request was already answered.",
  already_timed_out:  "This request timed out before your response reached us.",
  not_a_participant:  "You're not a participant in this session.",
};
