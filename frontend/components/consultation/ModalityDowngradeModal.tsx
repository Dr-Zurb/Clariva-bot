"use client";

/**
 * `<ModalityDowngradeModal>` — doctor-initiated mid-consult downgrade
 * (Plan 09 · Task 51 · Decision 11 LOCKED).
 *
 * Launched from `<ModalityChangeLauncher>` (Task 54). Flow:
 *
 *   1. **Form** — preset + required free-text via
 *      `<ModalityReasonCapture variant="doctor_downgrade">`.
 *   2. **Submit** — POST `/modality-change/request` with
 *      `{ initiatedBy: 'doctor', requestedModality: targetModality, reason, presetReasonCode }`.
 *      Decision 11 LOCKED: doctor-downgrade applies IMMEDIATELY —
 *      the state machine returns `{ kind: 'applied', ... }` on 200.
 *      No patient consent required. Auto-refund is kicked off
 *      asynchronously by the billing service (Task 49).
 *   3. **Success** — "Downgrade applied. Refund of ₹X is processing."
 *      Auto-close after 2s → `onSubmitted({ applied: true, toModality })`.
 *
 * **Refund-pending copy.** If the backend surfaces `refundInitiated = false`
 * or a future "pending retry" affordance, the success copy adapts:
 *   "Refund is pending — we'll notify the patient once it completes."
 * v1 backend always returns `applied` unconditionally and the refund
 * retry loop is server-side — so the modal shows "processing" and
 * trusts the retry loop.
 *
 * @see frontend/components/consultation/ModalityReasonCapture.tsx
 * @see frontend/lib/api/modality-change.ts
 */

import { useCallback, useEffect, useRef, useState } from "react";

import ModalityReasonCapture, {
  validateModalityReason,
  type ModalityReasonValue,
} from "./ModalityReasonCapture";
import { formatInrPaise } from "@/lib/modality-pricing-display";
import { postModalityChangeRequest } from "@/lib/api/modality-change";
import type { Modality, ModalityPresetReasonCode } from "@/types/modality-change";

export interface ModalityDowngradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null | undefined;
  sessionId: string;
  currentModality: "voice" | "video";
  targetModality: "text" | "voice";
  /** Server-computed refund delta. Displayed as "Patient will be refunded ₹X". */
  refundAmountPaise: number;
  onSubmitted?: (payload: { applied: true; toModality: Modality }) => void;
}

type Phase =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "applied"; toModality: Modality; refundPending: boolean }
  | { kind: "error"; message: string };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ModalityDowngradeModal(
  props: ModalityDowngradeModalProps,
): JSX.Element | null {
  const {
    isOpen,
    onClose,
    token,
    sessionId,
    targetModality,
    refundAmountPaise,
    onSubmitted,
  } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [reason, setReason] = useState<ModalityReasonValue>({ freeText: "" });
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);
  const appliedFiredRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setPhase({ kind: "form" });
      setReason({ freeText: "" });
      appliedFiredRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => firstFocusableRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Auto-close on applied after success dwell.
  useEffect(() => {
    if (phase.kind !== "applied") return;
    if (!appliedFiredRef.current) {
      appliedFiredRef.current = true;
      try {
        onSubmitted?.({ applied: true, toModality: phase.toModality });
      } catch {
        // never crash the modal on consumer handler errors.
      }
    }
    const t = window.setTimeout(onClose, 2000);
    return () => window.clearTimeout(t);
  }, [phase, onClose, onSubmitted]);

  const validation = validateModalityReason("doctor_downgrade", reason);

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
      if (result.kind === "applied") {
        setPhase({
          kind: "applied",
          toModality: result.toModality,
          // `refundInitiated` isn't surfaced as a boolean on success
          // yet — the modal assumes the server-side retry loop
          // catches any transient Razorpay failure. Follow-up task
          // 51-refund-status-surface will tighten this copy once the
          // backend exposes a `refundStatus` flag.
          refundPending: false,
        });
        return;
      }
      if (result.kind === "rejected") {
        setPhase({ kind: "error", message: rejectCopy(result.reason) });
        return;
      }
      // pending_doctor_approval / pending_patient_consent shouldn't
      // happen for doctor-initiated downgrades — the state machine
      // applies them immediately.
      setPhase({
        kind: "error",
        message: "Unexpected server response. Please retry.",
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't apply the downgrade. Please retry.",
      });
    }
  }, [reason, sessionId, targetModality, token, validation.valid]);

  const isDismissible =
    phase.kind === "form" || phase.kind === "applied" || phase.kind === "error";

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
        aria-labelledby="modality-downgrade-title"
        aria-describedby="modality-downgrade-body"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="modality-downgrade-title"
          className="text-base font-semibold text-gray-900"
        >
          {phase.kind === "applied"
            ? `Downgraded to ${capitalize(phase.toModality)}`
            : `Downgrade to ${capitalize(targetModality)}?`}
        </h2>

        <div
          id="modality-downgrade-body"
          aria-live="polite"
          className="mt-2 text-sm text-gray-700"
        >
          {phase.kind === "form" && (
            <>
              <p>
                Patient will be refunded{" "}
                <span className="font-semibold">
                  {formatInrPaise(refundAmountPaise)}
                </span>{" "}
                (difference) automatically.
              </p>
              <div className="mt-3">
                <ModalityReasonCapture
                  variant="doctor_downgrade"
                  value={reason}
                  onChange={setReason}
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
                  className="min-h-[48px] rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Downgrade
                </button>
              </div>
            </>
          )}

          {phase.kind === "submitting" && (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>Applying downgrade…</span>
            </div>
          )}

          {phase.kind === "applied" && (
            <>
              <p className="text-green-700">
                Downgrade applied. Refund of{" "}
                <span className="font-semibold">
                  {formatInrPaise(refundAmountPaise)}
                </span>{" "}
                is processing.
              </p>
              {phase.refundPending && (
                <p className="mt-2 text-xs text-amber-700">
                  Refund is pending — we&apos;ll notify the patient once it
                  completes.
                </p>
              )}
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
      return "The session is already at that modality.";
    case "max_downgrades_reached":
      return "You've already downgraded once in this consult.";
    case "pending_request_exists":
      return "Another modality request is already in flight.";
    case "reason_required":
    case "reason_out_of_bounds":
      return "Please adjust the reason and try again.";
    case "forbidden":
      return "You don't have permission to downgrade this session.";
    case "provider_failure":
      return "Technical issue applying the downgrade. Please retry.";
    default:
      return "Couldn't apply the downgrade. Please retry.";
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
