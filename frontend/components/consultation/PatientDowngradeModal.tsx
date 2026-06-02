"use client";

/**
 * `<PatientDowngradeModal>` — patient-initiated self-downgrade
 * (Plan 09 · Task 52 · Decision 11 LOCKED).
 *
 * Launched from `<ModalityChangeLauncher>` (Task 54) when the patient
 * wants to drop to a lower-tier modality (video → voice/text, voice → text).
 *
 * Decision 11 LOCKED: patient-downgrade is ALWAYS no-refund — the
 * patient is choosing to use less of what they already paid for. The
 * copy calls this out prominently in the primary info slot (not
 * buried in fine print) so the patient's consent is informed.
 *
 * Differences from the doctor-side `<ModalityDowngradeModal>` (Task 51):
 *   · No preset pills — patient-downgrade uses only optional free-text
 *     via `<ModalityReasonCapture variant="patient_downgrade">`.
 *   · `[Switch]` button is neutral-styled, NOT accent-colored — visual
 *     language shouldn't nudge patients toward losing their already-
 *     paid-for modality.
 *   · "Companion chat stays available" reassurance copy.
 *   · Dismissable normally (ESC / tap-outside / `[Cancel]`).
 *
 * @see frontend/components/consultation/ModalityReasonCapture.tsx
 * @see frontend/components/consultation/ModalityDowngradeModal.tsx
 * @see frontend/lib/api/modality-change.ts
 */

import { useCallback, useEffect, useRef, useState } from "react";

import ModalityReasonCapture, {
  validateModalityReason,
  type ModalityReasonValue,
} from "./ModalityReasonCapture";
import { postModalityChangeRequest } from "@/lib/api/modality-change";
import type { Modality } from "@/types/modality-change";

export interface PatientDowngradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null | undefined;
  sessionId: string;
  currentModality: "voice" | "video";
  targetModality: "text" | "voice";
  onSubmitted?: (payload: { applied: true; toModality: Modality }) => void;
}

type Phase =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "applied"; toModality: Modality }
  | { kind: "error"; message: string };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PatientDowngradeModal(
  props: PatientDowngradeModalProps,
): JSX.Element | null {
  const {
    isOpen,
    onClose,
    token,
    sessionId,
    currentModality,
    targetModality,
    onSubmitted,
  } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [reason, setReason] = useState<ModalityReasonValue>({ freeText: "" });
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const appliedFiredRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setPhase({ kind: "form" });
      setReason({ freeText: "" });
      appliedFiredRef.current = false;
    }
  }, [isOpen]);

  // Focus [Cancel] on open — conservative default per Task 52 spec
  // (consistent with the consent modal's decline-default doctrine).
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => cancelBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (phase.kind !== "applied") return;
    if (!appliedFiredRef.current) {
      appliedFiredRef.current = true;
      try {
        onSubmitted?.({ applied: true, toModality: phase.toModality });
      } catch {
        // ignore.
      }
    }
    const t = window.setTimeout(onClose, 1500);
    return () => window.clearTimeout(t);
  }, [phase, onClose, onSubmitted]);

  // Defence-in-depth: the launcher greys out invalid targets but if
  // someone invokes with target === current, show an inline error.
  const isNoOp = currentModality === (targetModality as string);

  const validation = validateModalityReason("patient_downgrade", reason);

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
      const trimmed = reason.freeText.trim();
      const result = await postModalityChangeRequest(token, sessionId, {
        requestedModality: targetModality,
        initiatedBy: "patient",
        ...(trimmed.length > 0 ? { reason: trimmed } : {}),
      });
      if (result.kind === "applied") {
        setPhase({ kind: "applied", toModality: result.toModality });
        return;
      }
      if (result.kind === "rejected") {
        setPhase({ kind: "error", message: rejectCopy(result.reason) });
        return;
      }
      // Patient-initiated downgrades apply immediately — any
      // `pending_*` discriminant would be a server bug. Handle
      // defensively.
      setPhase({
        kind: "error",
        message: "Unexpected server response. Please try again.",
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't apply the switch. Please retry.",
      });
    }
  }, [reason, sessionId, targetModality, token, validation.valid]);

  const isDismissible =
    phase.kind === "form" ||
    phase.kind === "applied" ||
    phase.kind === "error";

  const handleBackdropClick = useCallback(() => {
    if (isDismissible && phase.kind !== "applied") onClose();
  }, [isDismissible, onClose, phase.kind]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && isDismissible && phase.kind !== "applied") {
        e.stopPropagation();
        onClose();
      }
    },
    [isDismissible, onClose, phase.kind],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={handleBackdropClick}
        className="absolute inset-0 bg-black/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-downgrade-title"
        aria-describedby="patient-downgrade-body"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="patient-downgrade-title"
          className="text-base font-semibold text-gray-900"
        >
          {phase.kind === "applied"
            ? `Switched to ${capitalize(phase.toModality)}`
            : `Switch to ${capitalize(targetModality)} for the rest of the consult?`}
        </h2>

        <div
          id="patient-downgrade-body"
          aria-live="polite"
          className="mt-2 text-sm text-gray-700"
        >
          {isNoOp && phase.kind === "form" && (
            <>
              <p role="alert" className="text-red-600">
                You&apos;re already on {capitalize(currentModality)}.
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

          {!isNoOp && phase.kind === "form" && (
            <>
              <p>
                You&apos;ll lose{" "}
                {currentModality === "video" ? "video and voice" : "voice"} for
                this consult. Companion chat stays available.
              </p>
              <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs font-medium text-amber-900">
                No refund will be issued — you&apos;re choosing to use less of
                what you booked.
              </p>
              <div className="mt-4">
                <ModalityReasonCapture
                  variant="patient_downgrade"
                  value={reason}
                  onChange={setReason}
                />
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  ref={cancelBtnRef}
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
                  className="min-h-[48px] rounded-md border border-gray-400 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Switch
                </button>
              </div>
            </>
          )}

          {phase.kind === "submitting" && (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>Switching…</span>
            </div>
          )}

          {phase.kind === "applied" && (
            <p className="text-green-700">
              Switched to {capitalize(phase.toModality)}. Enjoy the rest of
              your consult.
            </p>
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
    case "max_downgrades_reached":
      return "You've already switched once in this consult.";
    case "pending_request_exists":
      return "Another modality request is already in flight.";
    case "reason_out_of_bounds":
      return "Please shorten the reason and try again.";
    case "forbidden":
      return "You don't have permission to switch modality here.";
    case "provider_failure":
      return "Technical issue applying the switch. Please retry.";
    default:
      return "Couldn't apply the switch. Please retry.";
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
