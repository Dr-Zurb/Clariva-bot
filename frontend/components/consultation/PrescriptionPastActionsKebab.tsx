"use client";

/**
 * EHR Sub-batch B2 / T3.19 — past-Rx kebab actions.
 *
 * Renders a three-dot menu next to a previously-sent prescription
 * with three idempotent doctor actions:
 *
 *   1. **Resend to patient** — re-fires the existing send pipeline
 *      (`POST /:id/send`). The 5-min PDF cache makes a rapid resend
 *      essentially free; outside that window the PDF is regenerated
 *      transparently. Uses a confirmation modal because resending
 *      produces a new IG-DM + email in the patient's inbox.
 *
 *   2. **Regenerate PDF** — forces a fresh PDF render bypassing the
 *      5-min cache. No patient channels fire. Useful when the
 *      doctor has just edited their letterhead and wants the next
 *      "Copy share link" / "Resend" to surface the new branding.
 *      Confirms before calling because the operation is server-heavy
 *      enough (R3-PDF + storage upload) that an accidental click
 *      shouldn't be silent.
 *
 *   3. **Copy share link** — mints a fresh 24h HMAC token and copies
 *      the patient share URL to the clipboard. No confirmation —
 *      this action is silent (no side effects beyond a token mint
 *      and a `prescription_read` audit row).
 *
 * The menu is only rendered when the prescription has been sent at
 * least once (`sent_to_patient_at != null`). For never-sent Rx, the
 * doctor's primary surface is the in-form "Send to patient" button.
 *
 * Lives next to `<PreviousPrescriptions>` (its primary mount point)
 * and is reusable by any future surface that lists past Rx (patient
 * page, episode timeline, etc.) — keep it dumb (props-driven) and
 * push all action wiring through the props.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreVertical } from "lucide-react";
import {
  createPrescriptionShareLink,
  regeneratePrescriptionPdf,
  sendPrescriptionToPatient,
} from "@/lib/api";

export interface PrescriptionPastActionsKebabProps {
  prescriptionId: string;
  token: string;
  /** Optional callback after a successful Resend (e.g. to refresh
   *  the parent list so `sent_to_patient_at` re-renders). */
  onResendSuccess?: () => void;
}

type ConfirmKind = "resend" | "regenerate" | null;
type ToastKind = "success" | "error" | "info";

export default function PrescriptionPastActionsKebab({
  prescriptionId,
  token,
  onResendSuccess,
}: PrescriptionPastActionsKebabProps) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [busyAction, setBusyAction] = useState<
    "resend" | "regenerate" | "copy" | null
  >(null);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Click-outside + ESC to close the dropdown. The confirmation modal
  // is portal-style centered with its own backdrop so it doesn't
  // share this handler.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Auto-dismiss toast after 4s. Errors stay slightly longer so the
  // doctor has time to read the failure message.
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === "error" ? 6000 : 3500;
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast]);

  const showToast = (kind: ToastKind, message: string) =>
    setToast({ kind, message });

  // ── Action: Copy share link ───────────────────────────────────────
  const handleCopyShareLink = async () => {
    setOpen(false);
    setBusyAction("copy");
    try {
      const res = await createPrescriptionShareLink(token, prescriptionId);
      const url = res.data.url;
      // Modern path: `navigator.clipboard.writeText` (HTTPS only).
      // Falls back to a transient `<textarea>` for ancient browsers
      // and HTTP localhost dev (Chrome blocks the modern API on
      // insecure origins).
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        }
      } catch {
        copied = false;
      }
      if (!copied) {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
          copied = document.execCommand("copy");
        } catch {
          copied = false;
        }
        document.body.removeChild(ta);
      }
      if (copied) {
        showToast("success", "Share link copied to clipboard");
      } else {
        // Surface the URL inline so the doctor can long-press / Cmd-C
        // it manually when both clipboard paths fail.
        showToast("info", `Copy this link: ${url}`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to mint share link";
      showToast("error", message);
    } finally {
      setBusyAction(null);
    }
  };

  // ── Action: Resend to patient (post-confirmation) ────────────────
  const handleResendConfirmed = async () => {
    setConfirm(null);
    setBusyAction("resend");
    try {
      const res = await sendPrescriptionToPatient(token, prescriptionId);
      const channels = res.data.channels ?? {};
      const ig = channels.instagram;
      const email = channels.email;
      if (res.data.sent) {
        // Mirror the in-form "Sent to patient" toast vocabulary so
        // doctors don't have to learn two phrasings for the same
        // outcome.
        const parts: string[] = [];
        if (ig) parts.push("DM");
        if (email) parts.push("email");
        showToast(
          "success",
          parts.length === 2
            ? "Sent to patient (email + DM)"
            : parts.length === 1
              ? `Sent to patient (${parts[0]} only)`
              : "Sent to patient",
        );
        onResendSuccess?.();
      } else {
        const reason = res.data.reason || "send_failed";
        showToast(
          "error",
          reason === "no_patient_link"
            ? "Patient has no linked email or DM channel"
            : "Resend failed — please try again",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resend prescription";
      showToast("error", message);
    } finally {
      setBusyAction(null);
    }
  };

  // ── Action: Regenerate PDF (post-confirmation) ───────────────────
  const handleRegenerateConfirmed = async () => {
    setConfirm(null);
    setBusyAction("regenerate");
    try {
      await regeneratePrescriptionPdf(token, prescriptionId);
      showToast("success", "PDF regenerated with current letterhead");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to regenerate PDF";
      showToast("error", message);
    } finally {
      setBusyAction(null);
    }
  };

  const isBusy = busyAction !== null;

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Prescription actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isBusy}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {isBusy ? (
          <SpinnerIcon />
        ) : (
          <KebabIcon />
        )}
      </button>

      {open && !isBusy && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 origin-top-right rounded-md border border-gray-200 bg-white shadow-lg focus:outline-none"
        >
          <div className="py-1" role="none">
            <MenuItem
              onClick={() => {
                setOpen(false);
                setConfirm("resend");
              }}
              label="Resend to patient"
              hint="Re-fires DM + email"
            />
            <MenuItem
              onClick={() => {
                setOpen(false);
                setConfirm("regenerate");
              }}
              label="Regenerate PDF"
              hint="Use after editing letterhead"
            />
            <MenuItem
              onClick={handleCopyShareLink}
              label="Copy share link"
              hint="Fresh 24h link to clipboard"
            />
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          kind={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={
            confirm === "resend"
              ? handleResendConfirmed
              : handleRegenerateConfirmed
          }
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={
            "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg " +
            (toast.kind === "success"
              ? "bg-green-600 text-white"
              : toast.kind === "error"
                ? "bg-red-600 text-white"
                : "bg-gray-800 text-white")
          }
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
    >
      <span className="block font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
    </button>
  );
}

function ConfirmModal({
  kind,
  onCancel,
  onConfirm,
}: {
  kind: "resend" | "regenerate";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Lock body scroll while modal is mounted; mirrors the pattern in
  // PrescriptionPatientPreview to keep the dialog feeling modal.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC to cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const title =
    kind === "resend" ? "Resend prescription?" : "Regenerate PDF?";
  const body =
    kind === "resend"
      ? "We'll re-send the prescription via DM and email. The patient will receive a new notification."
      : "We'll re-render the PDF using your current letterhead and save it over the existing file. No patient channels will fire.";
  const confirmLabel = kind === "resend" ? "Yes, resend" : "Yes, regenerate";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rx-confirm-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h3
          id="rx-confirm-title"
          className="text-base font-semibold text-gray-900"
        >
          {title}
        </h3>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function KebabIcon() {
  return <MoreVertical size={18} aria-hidden />;
}

function SpinnerIcon() {
  return <Loader2 size={18} className="animate-spin" aria-hidden />;
}
