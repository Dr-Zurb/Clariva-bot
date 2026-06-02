"use client";

/**
 * PrescriptionPatientPreview (EHR Sub-batch B2 / T3.18).
 *
 * Doctor-side modal that wraps <PatientRxView> in a centered overlay
 * so the doctor can see exactly what the patient will see on the
 * share page BEFORE pressing "Send to patient".
 *
 * Props:
 *   - `open` / `onClose` — modal visibility
 *   - `viewModel`        — pre-shaped <PatientRxView> data (the form
 *                          owns the conversion, see
 *                          `formStateToPatientRxViewModel` below).
 *
 * Conventions:
 *   - PDF download button is disabled in preview (no PDF exists yet).
 *     Tooltip explains why; we don't fake a sample PDF — keeps the
 *     preview truthful.
 *   - Backdrop click + ESC close the modal. Body scroll is locked
 *     while open so the patient view scrolls inside.
 *   - Mounts inline (no portal). The form is already at page-level;
 *     a fixed-overlay div suffices for v1.
 */

import * as React from "react";
import PatientRxView, {
  type PatientRxViewModel,
} from "@/components/ehr/PatientRxView";

interface PrescriptionPatientPreviewProps {
  open: boolean;
  onClose: () => void;
  viewModel: PatientRxViewModel | null;
}

const PrescriptionPatientPreview: React.FC<PrescriptionPatientPreviewProps> = ({
  open,
  onClose,
  viewModel,
}) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !viewModel) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Patient preview"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between text-white">
          <span className="text-xs uppercase tracking-wide opacity-80">
            Patient preview
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Close
          </button>
        </div>
        <PatientRxView viewModel={viewModel} signedPdfUrl={null} />
      </div>
    </div>
  );
};

export default PrescriptionPatientPreview;
