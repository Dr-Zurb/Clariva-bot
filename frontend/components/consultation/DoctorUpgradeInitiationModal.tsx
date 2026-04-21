"use client";

/**
 * `<DoctorUpgradeInitiationModal>` — doctor-initiated upgrade request
 * (Plan 09 · Task 51 · Decision 11 LOCKED).
 *
 * Launched from `<ModalityChangeLauncher>` (Task 54). Two phases:
 *
 *   1. **Form** — preset + required free-text via
 *      `<ModalityReasonCapture variant="doctor_upgrade">`. On
 *      submit → POST `/modality-change/request` with
 *      `{ initiatedBy: 'doctor', requestedModality: targetModality, reason, presetReasonCode }`.
 *      Server responds with `{ kind: 'pending_patient_consent', consentRequestId, consentExpiresAt }`.
 *
 *   2. **Waiting-for-consent** — 60s countdown driven by server
 *      `consentExpiresAt`. Realtime UPDATE events on the pending
 *      row drive the close:
 *        · `response = 'allowed'`            → "Patient agreed" toast; modal closes.
 *        · `response = 'declined'`           → "Patient declined" banner; modal closes.
 *        · `response = 'timeout'`            → "Patient didn't respond" banner; modal closes.
 *        · `response = 'provider_failure'`   → generic error.
 *      `[Close]` closes the modal but does NOT cancel the request
 *      (matches Plan 08 Task 40 Note #2 doctrine).
 *
 * Doctor-initiated upgrades are ALWAYS free — no Razorpay checkout;
 * the state machine applies the transition as soon as the patient
 * consents.
 *
 * @see frontend/components/consultation/ModalityReasonCapture.tsx
 * @see frontend/lib/api/modality-change.ts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ModalityReasonCapture, {
  validateModalityReason,
  type ModalityReasonValue,
} from "./ModalityReasonCapture";
import { postModalityChangeRequest } from "@/lib/api/modality-change";
import { createClient } from "@/lib/supabase/client";
import type {
  Modality,
  ModalityPendingResponse,
  ModalityPresetReasonCode,
  PendingRequestRow,
} from "@/types/modality-change";

export interface DoctorUpgradeInitiationModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null | undefined;
  sessionId: string;
  currentModality: "text" | "voice";
  targetModality: "voice" | "video";
  /**
   * Fired after the patient consents + the state machine commits.
   * Launcher uses this signal to remount the destination room.
   */
  onApplied?: (payload: { toModality: Modality }) => void;
  /** Fired when the patient declines or the 60s window elapses. */
  onDeclinedOrTimedOut?: (outcome: "declined" | "timeout") => void;
}

type Phase =
  | { kind: "form" }
  | { kind: "submitting" }
  | {
      kind: "awaiting_consent";
      consentRequestId: string;
      consentExpiresAt: string;
    }
  | { kind: "applied"; toModality: Modality }
  | { kind: "declined"; reason: string | null }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function DoctorUpgradeInitiationModal(
  props: DoctorUpgradeInitiationModalProps,
): JSX.Element | null {
  const {
    isOpen,
    onClose,
    token,
    sessionId,
    currentModality,
    targetModality,
    onApplied,
    onDeclinedOrTimedOut,
  } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [reason, setReason] = useState<ModalityReasonValue>({ freeText: "" });
  const [now, setNow] = useState<number>(() => Date.now());
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);

  // Reset on open.
  useEffect(() => {
    if (isOpen) {
      setPhase({ kind: "form" });
      setReason({ freeText: "" });
    }
  }, [isOpen]);

  // Tick.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  // Focus on open.
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => firstFocusableRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Realtime: watch the pending-request row for the terminal UPDATE.
  useEffect(() => {
    if (!isOpen) return;
    if (phase.kind !== "awaiting_consent") return;
    const client = createClient();
    const channel = client
      .channel(`doctor-upgrade-initiation:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "modality_change_pending_requests",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as PendingRequestRow | undefined;
          if (!row) return;
          if (row.id !== phase.consentRequestId) return;
          const response = row.response as ModalityPendingResponse | null;
          if (!response) return;
          if (response === "allowed") {
            setPhase({ kind: "applied", toModality: targetModality });
          } else if (response === "declined") {
            setPhase({ kind: "declined", reason: row.reason });
            onDeclinedOrTimedOut?.("declined");
          } else if (response === "timeout") {
            setPhase({ kind: "timeout" });
            onDeclinedOrTimedOut?.("timeout");
          } else if (response === "provider_failure") {
            setPhase({
              kind: "error",
              message:
                "Technical issue applying the upgrade. Please retry in a moment.",
            });
          }
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [isOpen, phase, sessionId, targetModality, onDeclinedOrTimedOut]);

  // Fire onApplied exactly once.
  const appliedFiredRef = useRef(false);
  useEffect(() => {
    if (phase.kind === "applied" && !appliedFiredRef.current) {
      appliedFiredRef.current = true;
      try {
        onApplied?.({ toModality: phase.toModality });
      } catch {
        // never let a consumer's handler crash the modal.
      }
    }
    if (phase.kind === "form") {
      appliedFiredRef.current = false;
    }
  }, [phase, onApplied]);

  // Auto-close success / terminal states.
  useEffect(() => {
    if (
      phase.kind === "applied" ||
      phase.kind === "declined" ||
      phase.kind === "timeout"
    ) {
      const t = window.setTimeout(onClose, 2000);
      return () => window.clearTimeout(t);
    }
  }, [phase, onClose]);

  // ---- Countdown -------------------------------------------------------------
  const secondsLeft = useMemo(() => {
    if (phase.kind !== "awaiting_consent") return 0;
    const ms = new Date(phase.consentExpiresAt).getTime() - now;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [phase, now]);

  // ---- Submit ----------------------------------------------------------------
  const validation = validateModalityReason("doctor_upgrade", reason);

  const handleSubmit = useCallback(async () => {
    if (!validation.valid) return;
    if (!token) {
      setPhase({
        kind: "error",
        message: "Session token unavailable. Please refresh.",
      });
      return;
    }
    setPhase({ kind: "submitting" });
    try {
      const result = await postModalityChangeRequest(token, sessionId, {
        requestedModality: targetModality,
        initiatedBy: "doctor",
        reason: reason.freeText.trim(),
        ...(reason.presetCode
          ? { presetReasonCode: reason.presetCode as ModalityPresetReasonCode }
          : {}),
      });
      if (result.kind === "pending_patient_consent") {
        setPhase({
          kind: "awaiting_consent",
          consentRequestId: result.consentRequestId,
          consentExpiresAt: result.consentExpiresAt,
        });
        return;
      }
      if (result.kind === "applied") {
        // Rare (doctor-initiated downgrade path re-directed here); applied
        // terminal. Treat same as the Realtime-driven applied.
        setPhase({ kind: "applied", toModality: result.toModality });
        return;
      }
      if (result.kind === "rejected") {
        setPhase({ kind: "error", message: rejectCopy(result.reason) });
        return;
      }
      setPhase({
        kind: "error",
        message: "Unexpected response. Please retry.",
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't send the upgrade request. Please retry.",
      });
    }
  }, [reason, sessionId, targetModality, token, validation.valid]);

  // ---- Dismissal -------------------------------------------------------------
  const isDismissible =
    phase.kind === "form" ||
    phase.kind === "awaiting_consent" ||
    phase.kind === "applied" ||
    phase.kind === "declined" ||
    phase.kind === "timeout" ||
    phase.kind === "error";

  const handleBackdropClick = useCallback(() => {
    if (isDismissible) onClose();
  }, [isDismissible, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && isDismissible) {
        e.stopPropagation();
        onClose();
      }
    },
    [isDismissible, onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={handleBackdropClick}
        className="absolute inset-0 bg-black/80"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-upgrade-init-title"
        aria-describedby="doctor-upgrade-init-body"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="doctor-upgrade-init-title"
          className="text-base font-semibold text-gray-900"
        >
          {phase.kind === "awaiting_consent"
            ? "Waiting for patient to consent"
            : phase.kind === "applied"
              ? `Switched to ${capitalize(phase.toModality)}`
              : phase.kind === "declined"
                ? "Patient declined"
                : phase.kind === "timeout"
                  ? "Patient didn't respond"
                  : `Upgrade to ${capitalize(targetModality)} at no extra cost?`}
        </h2>

        <div
          id="doctor-upgrade-init-body"
          aria-live="polite"
          className="mt-2 text-sm text-gray-700"
        >
          {phase.kind === "form" && (
            <>
              <p>
                The patient will be asked to consent. This will be at no extra
                cost to them.
              </p>
              <div className="mt-3">
                <ModalityReasonCapture
                  variant="doctor_upgrade"
                  value={reason}
                  onChange={setReason}
                  currentModality={currentModality}
                />
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  ref={firstFocusableRef}
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!validation.valid}
                  className="min-h-[48px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Request
                </button>
              </div>
            </>
          )}

          {phase.kind === "submitting" && (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>Asking the patient to consent…</span>
            </div>
          )}

          {phase.kind === "awaiting_consent" && (
            <>
              <p
                className={`flex items-center gap-2 text-base font-medium ${secondsLeft <= 20 ? "text-red-600" : "text-amber-700"}`}
              >
                <span aria-hidden>⏳</span>
                <span>{secondsLeft} seconds remaining</span>
              </p>
              <p className="mt-3">
                The patient has been asked to consent to the{" "}
                {targetModality} upgrade. They have 60 seconds to respond.
              </p>
              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </>
          )}

          {phase.kind === "applied" && (
            <p className="text-green-700">
              Switching you to {capitalize(phase.toModality)} now.
            </p>
          )}

          {phase.kind === "declined" && (
            <>
              <p>The patient declined the upgrade.</p>
              {phase.reason && phase.reason.trim().length > 0 && (
                <p className="mt-2 italic text-gray-600">
                  &ldquo;{phase.reason}&rdquo;
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                You can try again in 5 minutes.
              </p>
            </>
          )}

          {phase.kind === "timeout" && (
            <>
              <p>The patient didn&apos;t respond in time.</p>
              <p className="mt-2 text-xs text-gray-500">
                You can try again in 5 minutes.
              </p>
            </>
          )}

          {phase.kind === "error" && (
            <>
              <p role="alert" className="text-red-600">
                {phase.message}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "form" })}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function rejectCopy(reason: string): string {
  switch (reason) {
    case "session_not_active":
      return "This consultation is no longer active.";
    case "no_op_transition":
      return "You're already on that modality.";
    case "max_upgrades_reached":
      return "The patient has already been upgraded once in this consult.";
    case "pending_request_exists":
      return "Another upgrade request is already in flight.";
    case "reason_required":
    case "reason_out_of_bounds":
      return "Please adjust the reason and try again.";
    case "forbidden":
      return "You don't have permission to initiate this upgrade.";
    case "provider_failure":
      return "Technical issue contacting the patient. Please retry.";
    default:
      return "Couldn't send the upgrade request. Please retry.";
  }
}

function Spinner(): JSX.Element {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
    />
  );
}
