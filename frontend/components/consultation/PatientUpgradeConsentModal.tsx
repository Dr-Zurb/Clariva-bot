"use client";

/**
 * `<PatientUpgradeConsentModal>` — patient-side consent to a doctor-
 * initiated mid-consult upgrade (Plan 09 · Task 52 · Decision 11 LOCKED).
 *
 * Mounted at the patient's root room wrapper (text / voice / video)
 * and driven by `usePatientPendingUpgradeConsent`. Pops automatically
 * when the doctor submits via Task 51's `<DoctorUpgradeInitiationModal>`.
 *
 * **High-stakes modal doctrine** (matches Plan 08 Task 41 for patient
 * video-escalation consent):
 *   · `role="alertdialog"` — WAI-ARIA strong-priority surface.
 *   · CANNOT be dismissed implicitly. No ESC, no tap-outside, no close
 *     button. Only `[Decline]`, `[Allow]`, or server-side timeout (60s).
 *   · `[Decline]` is the focus-default — if the patient reflexively
 *     taps Enter, the safe action is decline (preserves current state).
 *   · 64×64 minimum touch targets (bigger than normal due to consent's
 *     importance); neutral `[Decline]` / positive `[Allow]` styling.
 *   · `aria-live="assertive"` on the countdown.
 *   · `prefers-reduced-motion` suppresses countdown pulse.
 *
 * **HTTP + Realtime wiring:**
 *   · `[Decline]` → `POST /modality-change/patient-consent` with
 *     `{ consentRequestId, decision: 'decline' }` → modal closes.
 *   · `[Allow]`   → POST with `{ decision: 'allow' }` → the state
 *     machine applies the transition synchronously and returns
 *     `{ kind: 'applied', toModality }`. Modal transitions to a brief
 *     `applying` spinner ("Switching to video…") then fires
 *     `onAccepted` so the parent launcher can remount the destination
 *     room. Task 50's doctrine is repeated here — the parent is
 *     responsible for minting the fresh access token (Task 48's
 *     commit-side rebroadcast of `newAccessToken` is an inbox
 *     follow-up).
 *
 * @see frontend/hooks/usePatientPendingUpgradeConsent.ts
 * @see frontend/lib/api/modality-change.ts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { postModalityChangePatientConsent } from "@/lib/api/modality-change";
import type { Modality } from "@/types/modality-change";

export interface PatientUpgradeConsentModalProps {
  isOpen: boolean;
  token: string | null | undefined;
  sessionId: string;
  consentRequestId: string;
  doctorDisplayName: string;
  currentModality: "text" | "voice";
  targetModality: "voice" | "video";
  /** Doctor's mandated reason (Task 51 enforces 5..200 chars). */
  doctorReason: string;
  /** ISO-8601 — 60s from request. Countdown anchors on this. */
  expiresAt: string;
  /**
   * Fired after the patient accepts AND the state machine commits.
   * Parent is expected to remount the destination room.
   */
  onAccepted?: (payload: { toModality: Modality }) => void;
  /** Fired when the patient explicitly declines. */
  onDeclined?: () => void;
  /** Fired when the 60s server-side window elapses. */
  onTimeout?: () => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "submitting_decline" }
  | { kind: "submitting_allow" }
  | { kind: "applying"; toModality: Modality }
  | { kind: "expired" }
  | { kind: "error"; message: string; retryFrom: "decline" | "allow" };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function PatientUpgradeConsentModal(
  props: PatientUpgradeConsentModalProps,
): JSX.Element | null {
  const {
    isOpen,
    token,
    sessionId,
    consentRequestId,
    doctorDisplayName,
    targetModality,
    doctorReason,
    expiresAt,
    onAccepted,
    onDeclined,
    onTimeout,
  } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [now, setNow] = useState<number>(() => Date.now());
  const declineBtnRef = useRef<HTMLButtonElement | null>(null);
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const appliedFiredRef = useRef(false);
  const timeoutFiredRef = useRef(false);

  // Reset local state when a new request arrives while the previous
  // was lingering (rare — launcher typically dismisses first).
  useEffect(() => {
    setPhase({ kind: "idle" });
    appliedFiredRef.current = false;
    timeoutFiredRef.current = false;
  }, [consentRequestId]);

  // 1Hz countdown tick.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  // Focus [Decline] on open — conservative default.
  useEffect(() => {
    if (!isOpen || phase.kind !== "idle") return;
    const t = window.setTimeout(() => declineBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen, phase.kind]);

  // Countdown (server-anchored).
  const secondsLeft = useMemo(() => {
    const ms = new Date(expiresAt).getTime() - now;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [expiresAt, now]);

  // Local safety-net: if the server timeout event hasn't fired but the
  // countdown reached 0, surface the expired state (and fire
  // `onTimeout` exactly once).
  useEffect(() => {
    if (!isOpen) return;
    if (phase.kind !== "idle") return;
    if (secondsLeft > 0) return;
    setPhase({ kind: "expired" });
  }, [isOpen, phase.kind, secondsLeft]);

  useEffect(() => {
    if (phase.kind === "expired" && !timeoutFiredRef.current) {
      timeoutFiredRef.current = true;
      try {
        onTimeout?.();
      } catch {
        // never let consumer-handler errors crash the modal.
      }
    }
  }, [phase, onTimeout]);

  // Auto-fire onAccepted once we enter `applying`.
  useEffect(() => {
    if (phase.kind !== "applying") return;
    if (appliedFiredRef.current) return;
    appliedFiredRef.current = true;
    try {
      onAccepted?.({ toModality: phase.toModality });
    } catch {
      // ignore.
    }
  }, [phase, onAccepted]);

  // ---- Submission helpers ----------------------------------------------------
  const submitDecision = useCallback(
    async (decision: "allow" | "decline") => {
      if (!token) {
        setPhase({
          kind: "error",
          message: "Session token unavailable. Please refresh.",
          retryFrom: decision,
        });
        return;
      }
      setPhase({
        kind: decision === "allow" ? "submitting_allow" : "submitting_decline",
      });
      try {
        const result = await postModalityChangePatientConsent(
          token,
          sessionId,
          { consentRequestId, decision },
        );
        if (result.kind === "rejected") {
          setPhase({
            kind: "error",
            message: rejectCopy(result.reason),
            retryFrom: decision,
          });
          return;
        }
        if (decision === "decline") {
          try {
            onDeclined?.();
          } catch {
            // ignore.
          }
          return;
        }
        // decision === 'allow' — Task 47's state machine returns
        // `applied` synchronously.
        if (result.kind === "applied") {
          setPhase({ kind: "applying", toModality: result.toModality });
          return;
        }
        // Unexpected pending_* discriminant — shouldn't happen for
        // patient-consent but handle defensively.
        setPhase({ kind: "applying", toModality: targetModality });
      } catch (err) {
        setPhase({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't submit your decision. Please retry.",
          retryFrom: decision,
        });
      }
    },
    [
      consentRequestId,
      onDeclined,
      sessionId,
      targetModality,
      token,
    ],
  );

  // ---- Dismissal guards ------------------------------------------------------
  // Consent modal CANNOT be dismissed implicitly. Block ESC + backdrop click.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    [],
  );

  if (!isOpen) return null;

  const noCharge = targetModality === "voice" || targetModality === "video";
  // Always true for v1 — doctor-initiated upgrades are always free per
  // Decision 11 LOCKED. Kept as a constant for clarity when reading.

  const countdownTone =
    secondsLeft <= 10
      ? "text-red-400"
      : secondsLeft <= 30
        ? "text-amber-300"
        : "text-white";

  const countdownPulse =
    !reducedMotion && secondsLeft <= 10 ? "animate-pulse" : "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Full-screen backdrop. Click-through intentionally disabled. */}
      <div aria-hidden className="absolute inset-0 bg-black/90" />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="patient-consent-title"
        aria-describedby="patient-consent-body"
        className="relative flex h-full w-full max-w-lg flex-col items-center justify-between bg-gradient-to-b from-gray-900 to-black px-6 py-10 text-center text-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl"
      >
        <div className="flex w-full flex-col items-center">
          <p
            id="patient-consent-title"
            className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300"
          >
            Consent needed
          </p>

          <h2 className="mt-4 text-lg font-medium text-gray-100">
            {doctorDisplayName || "Your doctor"} wants to upgrade to
          </h2>
          <p className="mt-1 text-3xl font-semibold tracking-wide text-white">
            {capitalize(targetModality)}
          </p>

          {noCharge && (
            <p className="mt-2 rounded-full bg-green-900/40 px-3 py-1 text-xs font-medium text-green-300">
              No extra charge
            </p>
          )}

          {doctorReason && doctorReason.trim().length > 0 ? (
            <div
              id="patient-consent-body"
              className="mt-6 w-full rounded-lg bg-white/5 p-4 text-left text-sm text-gray-200"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Reason
              </p>
              <p className="mt-1 italic">&ldquo;{doctorReason.trim()}&rdquo;</p>
            </div>
          ) : (
            <p
              id="patient-consent-body"
              className="mt-6 text-sm italic text-gray-400"
            >
              Your doctor didn&apos;t share a specific reason.
            </p>
          )}
        </div>

        <div className="my-6 flex w-full flex-col items-center">
          <p
            aria-live="assertive"
            className={`flex items-center gap-2 text-2xl font-semibold ${countdownTone} ${countdownPulse}`}
          >
            <span aria-hidden>⏳</span>
            <span>
              {secondsLeft} second{secondsLeft === 1 ? "" : "s"}
            </span>
          </p>

          {phase.kind === "idle" && (
            <div className="mt-8 flex w-full items-center justify-center gap-4">
              <button
                ref={declineBtnRef}
                type="button"
                onClick={() => void submitDecision("decline")}
                className="min-h-[64px] min-w-[140px] rounded-xl border border-white/40 bg-transparent px-6 py-3 text-base font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => void submitDecision("allow")}
                className="min-h-[64px] min-w-[140px] rounded-xl bg-green-500 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-300"
              >
                Allow
              </button>
            </div>
          )}

          {(phase.kind === "submitting_decline" ||
            phase.kind === "submitting_allow") && (
            <p className="mt-8 flex items-center gap-2 text-sm text-gray-200">
              <Spinner />
              {phase.kind === "submitting_decline"
                ? "Declining…"
                : "Accepting…"}
            </p>
          )}

          {phase.kind === "applying" && (
            <p className="mt-8 flex items-center gap-2 text-sm text-green-300">
              <Spinner />
              Switching to {capitalize(phase.toModality)}…
            </p>
          )}

          {phase.kind === "expired" && (
            <p className="mt-8 text-sm text-amber-300">Request expired.</p>
          )}

          {phase.kind === "error" && (
            <div className="mt-8 w-full rounded-lg bg-red-950/60 p-3 text-sm text-red-200">
              <p role="alert">{phase.message}</p>
              <div className="mt-3 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void submitDecision(phase.retryFrom)}
                  className="min-h-[44px] rounded-md bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                  className="min-h-[44px] rounded-md border border-white/30 px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>

        {phase.kind === "idle" && (
          <p className="text-xs text-gray-400">
            If you do nothing, this will auto-decline after 60 seconds.
          </p>
        )}
      </div>
    </div>
  );
}

function rejectCopy(reason: string): string {
  switch (reason) {
    case "session_not_active":
      return "This consultation is no longer active.";
    case "forbidden":
      return "You don't have permission to respond to this request.";
    case "provider_failure":
      return "A technical error prevented the switch. Please retry.";
    default:
      return "Couldn't record your decision. Please retry.";
  }
}

function Spinner(): JSX.Element {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
    />
  );
}
