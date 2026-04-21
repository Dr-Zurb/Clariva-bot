"use client";

/**
 * `<ModalityUpgradeApprovalModal>` — doctor-side response to a patient's
 * mid-consult upgrade request (Plan 09 · Task 51 · Decision 11 LOCKED).
 *
 * Pops via `useDoctorPendingUpgradeApproval` — consumers mount this
 * modal at the doctor-room wrapper level and pass through the hook's
 * `pending` shape. The modal walks the doctor through three CTAs:
 *
 *   · [Accept (charge ₹X)]  — default, highlighted. POST /approve
 *                              with `{ decision: 'paid', amountPaise }`.
 *   · [Accept (free)]       — POST with `{ decision: 'free' }`.
 *   · [Decline]             — opens an inline decline sub-flow
 *                              (reason via <ModalityReasonCapture>)
 *                              → POST with `{ decision: 'decline', declineReason }`.
 *
 * **Dismissal doctrine** (matches Plan 08 Task 41 for high-stakes modals):
 *   · `[Close]` is only offered in `idle` (no CTA clicked yet) — the
 *     doctor can ignore, server 90s timeout fires.
 *   · ESC / tap-outside: disabled once the doctor has clicked a CTA
 *     or entered the decline sub-flow.
 *   · Closes automatically on Realtime `timeout` event.
 *
 * **Default focus:** `[Accept (charge ₹X)]` — Decision 11 LOCKED doctrine
 * nudges toward paid upgrades (doctor's time is billable).
 *
 * @see frontend/hooks/useDoctorPendingUpgradeApproval.ts
 * @see frontend/components/consultation/ModalityReasonCapture.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ModalityReasonCapture, {
  validateModalityReason,
  type ModalityReasonValue,
} from "./ModalityReasonCapture";
import { formatInrPaise } from "@/lib/modality-pricing-display";
import { postModalityChangeApprove } from "@/lib/api/modality-change";

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

export interface ModalityUpgradeApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null | undefined;
  sessionId: string;
  approvalRequestId: string;
  patientName: string;
  requestedModality: "voice" | "video";
  /** Patient's optional context; null when the patient didn't provide one. */
  patientReason?: string | null;
  /** Server-computed upgrade delta in paise — displayed verbatim as ₹X. */
  deltaPaise: number;
  /** ISO-8601 — 90s from request insert. Countdown anchors on this. */
  expiresAt: string;
  onDecision?: (decision: "paid" | "free" | "decline") => void;
}

// ----------------------------------------------------------------------------
// Local phase
// ----------------------------------------------------------------------------

type Phase =
  | { kind: "idle" }
  | { kind: "decline_form" }
  | { kind: "submitting"; decision: "paid" | "free" | "decline" }
  | { kind: "success"; decision: "paid" | "free" | "decline" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export default function ModalityUpgradeApprovalModal(
  props: ModalityUpgradeApprovalModalProps,
): JSX.Element | null {
  const {
    isOpen,
    onClose,
    token,
    sessionId,
    approvalRequestId,
    patientName,
    requestedModality,
    patientReason,
    deltaPaise,
    expiresAt,
    onDecision,
  } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [reason, setReason] = useState<ModalityReasonValue>({ freeText: "" });
  const [now, setNow] = useState<number>(() => Date.now());
  const acceptChargeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Reset local state whenever the approvalRequestId changes (a new
  // request arrived via the hook while the previous one was lingering
  // in success state).
  useEffect(() => {
    setPhase({ kind: "idle" });
    setReason({ freeText: "" });
  }, [approvalRequestId]);

  // 1s tick for countdown.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  // Initial focus on the default CTA.
  useEffect(() => {
    if (!isOpen || phase.kind !== "idle") return;
    const t = window.setTimeout(() => {
      acceptChargeRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, phase.kind]);

  // Auto-close on success after a brief confirmation window.
  useEffect(() => {
    if (phase.kind !== "success") return;
    const t = window.setTimeout(onClose, 1500);
    return () => window.clearTimeout(t);
  }, [phase, onClose]);

  // Local timer safety-net — fire `expired` when `expiresAt` passes.
  const secondsLeft = useMemo(() => {
    const ms = new Date(expiresAt).getTime() - now;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [expiresAt, now]);
  useEffect(() => {
    if (!isOpen) return;
    if (phase.kind !== "idle" && phase.kind !== "decline_form") return;
    if (secondsLeft === 0) {
      setPhase({ kind: "expired" });
    }
  }, [isOpen, phase.kind, secondsLeft]);

  // ---- Submission helpers ----------------------------------------------------
  const submitDecision = useCallback(
    async (decision: "paid" | "free" | "decline", declineReason?: string) => {
      if (!token) {
        setPhase({
          kind: "error",
          message: "Session token unavailable. Please refresh.",
        });
        return;
      }
      setPhase({ kind: "submitting", decision });
      try {
        const result = await postModalityChangeApprove(token, sessionId, {
          approvalRequestId,
          decision,
          ...(decision === "paid" ? { amountPaise: deltaPaise } : {}),
          ...(decision === "decline" && declineReason
            ? { declineReason }
            : {}),
        });
        if (result.kind === "rejected") {
          setPhase({
            kind: "error",
            message: rejectCopy(result.reason),
          });
          return;
        }
        setPhase({ kind: "success", decision });
        onDecision?.(decision);
      } catch (err) {
        setPhase({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't submit your decision. Please retry.",
        });
      }
    },
    [approvalRequestId, deltaPaise, onDecision, sessionId, token],
  );

  const handleDeclineSubmit = useCallback(() => {
    const validation = validateModalityReason("doctor_decline", reason);
    if (!validation.valid) return;
    void submitDecision("decline", reason.freeText.trim());
  }, [reason, submitDecision]);

  // ---- Dismissal guards ------------------------------------------------------
  const isDismissible =
    phase.kind === "idle" ||
    phase.kind === "expired" ||
    phase.kind === "error" ||
    phase.kind === "success";

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && isDismissible) {
        e.stopPropagation();
        onClose();
      }
    },
    [isDismissible, onClose],
  );

  const handleBackdropClick = useCallback(() => {
    if (isDismissible) onClose();
  }, [isDismissible, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={handleBackdropClick}
        className="absolute inset-0 bg-black/80"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modality-approval-title"
        aria-describedby="modality-approval-body"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="modality-approval-title"
          className="text-base font-semibold text-gray-900"
        >
          {phase.kind === "expired"
            ? "Patient request expired"
            : phase.kind === "success"
              ? successTitle(phase.decision, requestedModality)
              : `Patient requests upgrade to ${capitalize(requestedModality)}`}
        </h2>

        <div
          id="modality-approval-body"
          aria-live="polite"
          className="mt-2 text-sm text-gray-700"
        >
          {phase.kind === "idle" && (
            <>
              <p
                className={`text-xs font-medium ${secondsLeft <= 30 ? "text-red-600" : "text-amber-700"}`}
              >
                {secondsLeft} seconds remaining to respond
              </p>
              <p className="mt-3">
                {patientName} wants to upgrade to {requestedModality}.
              </p>
              {patientReason && patientReason.trim().length > 0 && (
                <div className="mt-3 rounded-md bg-gray-50 p-2">
                  <p className="text-xs font-medium text-gray-500">
                    Patient&apos;s reason:
                  </p>
                  <p className="mt-1 italic text-gray-800">
                    &ldquo;{patientReason}&rdquo;
                  </p>
                </div>
              )}
              <p className="mt-3 text-sm">
                Standard difference:{" "}
                <span className="font-semibold">
                  {formatInrPaise(deltaPaise)}
                </span>
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  ref={acceptChargeRef}
                  type="button"
                  onClick={() => void submitDecision("paid")}
                  className="min-h-[48px] rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Accept (charge {formatInrPaise(deltaPaise)})
                </button>
                <button
                  type="button"
                  onClick={() => void submitDecision("free")}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  Accept (free)
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "decline_form" })}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Decline (reason required)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  Close (patient request will expire in {secondsLeft}s)
                </button>
              </div>
            </>
          )}

          {phase.kind === "decline_form" && (
            <>
              <p className="text-xs text-gray-500">
                Why are you declining?
              </p>
              <div className="mt-2">
                <ModalityReasonCapture
                  variant="doctor_decline"
                  value={reason}
                  onChange={setReason}
                />
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReason({ freeText: "" });
                    setPhase({ kind: "idle" });
                  }}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeclineSubmit}
                  disabled={
                    !validateModalityReason("doctor_decline", reason).valid
                  }
                  className="min-h-[48px] rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Submit
                </button>
              </div>
            </>
          )}

          {phase.kind === "submitting" && (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>
                {phase.decision === "decline"
                  ? "Declining…"
                  : phase.decision === "paid"
                    ? "Accepting with charge…"
                    : "Accepting for free…"}
              </span>
            </div>
          )}

          {phase.kind === "success" && (
            <p className="text-green-700">
              {phase.decision === "decline"
                ? "Declined. The patient has been notified."
                : phase.decision === "paid"
                  ? `Charging ${formatInrPaise(deltaPaise)} — switching to ${capitalize(requestedModality)} once paid.`
                  : `Granted for free — switching to ${capitalize(requestedModality)} now.`}
            </p>
          )}

          {phase.kind === "expired" && (
            <>
              <p className="text-amber-800">
                The patient&apos;s 90-second window elapsed.
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

          {phase.kind === "error" && (
            <>
              <p role="alert" className="text-red-600">
                {phase.message}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
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

// ----------------------------------------------------------------------------
// Helpers (local)
// ----------------------------------------------------------------------------

function successTitle(
  decision: "paid" | "free" | "decline",
  modality: "voice" | "video",
): string {
  const m = capitalize(modality);
  switch (decision) {
    case "paid":
      return `Charging for ${m} upgrade`;
    case "free":
      return `Granted free ${m} upgrade`;
    case "decline":
      return "Upgrade declined";
    default:
      return "Decision recorded";
  }
}

function rejectCopy(reason: string): string {
  switch (reason) {
    case "session_not_active":
      return "This consultation is no longer active.";
    case "max_upgrades_reached":
      return "The patient has already been upgraded once in this consult.";
    case "forbidden":
      return "You don't have permission to respond to this request.";
    case "reason_required":
    case "reason_out_of_bounds":
      return "The decline reason is invalid. Please adjust.";
    case "provider_failure":
      return "A technical error prevented the decision. Please retry.";
    default:
      return "Couldn't record your decision. Please retry.";
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
