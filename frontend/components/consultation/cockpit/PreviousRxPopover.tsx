"use client";

/**
 * PreviousRxPopover — Lane β / cockpit-5.
 *
 * Chip that shows the count of prior prescriptions for this patient and
 * opens a lightweight dropdown listing the last 3, each with:
 *   - Date + status pill (draft / sent)
 *   - Medicines summary (first 2, "+N more")
 *   - "Copy medicines" button — V1: TODO (PrescriptionForm has no
 *     `fromPrescriptionId` hydration yet; show the list only).
 *
 * No Popover primitive available in components/ui — vanilla React
 * dropdown with click-outside dismiss, same pattern as <TemplatePicker>.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardCopy } from "lucide-react";
import { listPrescriptionsByPatient } from "@/lib/api";
import { formatDate as formatDatePinned } from "@/lib/format-date";
import type { PrescriptionMedicine, PrescriptionWithRelations } from "@/types/prescription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Medicine shape passed to onCopyMedicines. Alias of the DB row. */
export type ParsedMedicine = PrescriptionMedicine;

export interface PreviousRxPopoverProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  /**
   * Fired when the doctor clicks "Copy medicines" on a previous Rx row.
   * V1 TODO: PrescriptionForm has no `fromPrescriptionId` hydration yet.
   * The prop is wired through so cockpit-3 can add the handler once the
   * form supports it; for now the button is rendered as a TODO no-op.
   */
  onCopyMedicines?: (medicines: ParsedMedicine[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return formatDatePinned(iso);
}

function medicinesSummary(
  medicines: PrescriptionMedicine[] | undefined,
): string {
  if (!medicines || medicines.length === 0) return "No medicines listed";
  const first2 = medicines
    .slice(0, 2)
    .map((m) => m.medicine_name)
    .join(", ");
  const extra = medicines.length - 2;
  return extra > 0 ? `${first2} +${extra} more` : first2;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PreviousRxPopover({
  patientId,
  token,
  onCopyMedicines,
}: PreviousRxPopoverProps) {
  const [prescriptions, setPrescriptions] = useState<
    PrescriptionWithRelations[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const res = await listPrescriptionsByPatient(token, patientId);
      const list = res.data.prescriptions ?? [];
      // Keep last 3 for the popover (most recent first — API returns
      // newest-first; take the head).
      setPrescriptions(list.slice(0, 3));
    } catch {
      setPrescriptions([]);
    } finally {
      setLoading(false);
    }
  }, [patientId, token]);

  useEffect(() => {
    if (patientId) void load();
  }, [patientId, load]);

  // ------------------------------------------------------------------
  // Click-outside dismiss
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // ------------------------------------------------------------------
  // Walk-in / no-patient guard
  // ------------------------------------------------------------------

  if (!patientId) return null;

  const count = prescriptions.length;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Chip trigger */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {loading ? (
          "Previous…"
        ) : (
          <>
            Previous ({count})
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Previous prescriptions"
          className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Previous prescriptions
            </p>
          </div>

          {count === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-gray-400">
              No previous prescriptions for this patient.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {prescriptions.map((rx) => {
                const medicines = rx.prescription_medicines;
                const isSent = Boolean(rx.sent_to_patient_at);

                return (
                  <li key={rx.id} className="px-3 py-2.5 space-y-1">
                    {/* Row header: date + status pill */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-700">
                        {formatDate(rx.created_at)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isSent
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isSent ? "Sent" : "Draft"}
                      </span>
                    </div>

                    {/* Medicines summary */}
                    <p className="text-xs text-gray-500 leading-snug">
                      {medicinesSummary(medicines)}
                    </p>

                    {/* Copy medicines — V1: TODO (PrescriptionForm has no
                        fromPrescriptionId hydration; button shown as
                        disabled placeholder until cockpit-3 wires it). */}
                    {onCopyMedicines && medicines && medicines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onCopyMedicines(medicines);
                          setOpen(false);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline focus:outline-none focus:underline"
                        aria-label={`Copy medicines from ${formatDate(rx.created_at)}`}
                      >
                        <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
                        Copy medicines
                      </button>
                    )}
                    {/* TODO: when onCopyMedicines is absent (V1), show a
                        placeholder until PrescriptionForm exposes an
                        imperative hydrate handle or a URL-param approach. */}
                    {!onCopyMedicines && medicines && medicines.length > 0 && (
                      <span
                        title="Copy medicines wiring coming in a follow-up task"
                        className="inline-flex items-center gap-1 text-[11px] text-gray-400 cursor-not-allowed select-none"
                        aria-disabled="true"
                      >
                        <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
                        Copy medicines
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
