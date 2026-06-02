"use client";

/**
 * PrescriptionPreSendCheck (EHR Sub-batch C / T4.21 — C.4).
 *
 * Soft-warning aggregator modal that runs when the doctor presses
 * "Send to patient". Aggregates ALL warning kinds the form already
 * surfaces inline (allergy clashes, DDI warnings, missing diagnosis,
 * empty Rx) and lets the doctor pick one of three outcomes:
 *
 *   - Cancel       → close modal, no send. Form state unchanged.
 *   - Edit Rx      → close modal, scroll to the first warning's
 *                    relevant section (`#medicines-section` or
 *                    `#diagnosis`) and focus the appropriate input.
 *   - Send anyway  → fire the existing send pipeline.
 *
 * Decision T4-D1 LOCKED 2026-05-03: the "Send anyway" button is
 * ALWAYS enabled regardless of warning count. The only state in
 * which it disables is the in-flight `sending` window — and that's
 * to debounce double-clicks, not to block on warning content.
 *
 * Decision §23 LOCKED: the parent emits the outcome telemetry event
 * (`{ rxId, appointmentId, warningKinds, warningCounts, outcome,
 * occurredAt, highestDdiSeverity? }`) via the supplied callbacks.
 * The modal does not directly import the telemetry helper so that
 * tests can swap callbacks without intercepting console output.
 *
 * Modal conventions (mirrors `<PrescriptionPatientPreview>`):
 *   - Click backdrop → equivalent to Cancel.
 *   - ESC           → equivalent to Cancel.
 *   - Body scroll locked while open.
 *   - Mounts inline (no portal) — page-level fixed overlay suffices.
 *
 * @see frontend/lib/ehr/pre-send-warnings.ts
 * @see frontend/lib/ehr/telemetry.ts
 * @see frontend/components/consultation/PrescriptionForm.tsx
 */

import * as React from "react";
import type {
  PreSendWarning,
  PreSendWarningKind,
} from "@/lib/ehr/pre-send-warnings";
import type { InteractionSeverity } from "@/lib/api/drug-interactions";

// ---------------------------------------------------------------------------
// Per-kind display config
// ---------------------------------------------------------------------------

interface KindConfig {
  /** Heading icon — kept as plain unicode to avoid a per-icon import. */
  icon: string;
  /** Short title for the warning row. */
  title: string;
  /** Tailwind classes for the row container border. */
  rowCls: string;
  /** Tailwind classes for the title text. */
  titleCls: string;
}

const KIND_CONFIG: Record<PreSendWarningKind, KindConfig> = {
  "unacked-allergy": {
    icon: "⚠️",
    title: "Allergy clash",
    rowCls: "border-red-300 bg-red-50",
    titleCls: "text-red-900",
  },
  "unacked-ddi": {
    icon: "⚠",
    title: "Drug interaction",
    rowCls: "border-orange-300 bg-orange-50",
    titleCls: "text-orange-900",
  },
  "no-diagnosis": {
    icon: "ℹ",
    title: "Missing information",
    rowCls: "border-blue-300 bg-blue-50",
    titleCls: "text-blue-900",
  },
  "empty-rx": {
    icon: "ℹ",
    title: "Empty prescription",
    rowCls: "border-gray-300 bg-gray-50",
    titleCls: "text-gray-900",
  },
};

const DDI_SEVERITY_LABEL: Record<InteractionSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
  contraindicated: "Contraindicated",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PrescriptionPreSendCheckProps {
  open: boolean;
  /** Aggregated warnings — empty list means the parent should NOT
   *  open this modal in the first place; the component still renders
   *  defensively but the doctor sees an empty list. */
  warnings: ReadonlyArray<PreSendWarning>;
  /** True while the actual send pipeline is in flight (set by the
   *  parent right before calling `sendPrescriptionToPatient`). The
   *  modal disables Cancel / Edit / Send buttons while true to
   *  avoid double-trigger. NEVER set this from warning content. */
  sending?: boolean;
  /** Cancel — close modal without sending. */
  onCancel: () => void;
  /** Edit Rx — close modal AND ask the parent to scroll to / focus
   *  the relevant input. The modal computes the target via
   *  `warnings[0].targetId`; the parent does the actual DOM work. */
  onEdit: () => void;
  /** Send anyway — fire the send pipeline. Resolution / errors are
   *  handled by the parent (the form already owns the send state
   *  machine + success / error toasts). */
  onSendAnyway: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrescriptionPreSendCheck({
  open,
  warnings,
  sending,
  onCancel,
  onEdit,
  onSendAnyway,
}: PrescriptionPreSendCheckProps) {
  // ESC + body-scroll lock. Mirrors the pattern in
  // `<PrescriptionPatientPreview>`.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel, sending]);

  // Move keyboard focus into the dialog on open so screen readers
  // and keyboard users land somewhere useful. The "Edit Rx" button
  // is the most ergonomic default — Cancel via ESC is always one key
  // away, and Send anyway is the destructive option that should
  // require an explicit reach.
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const editButtonRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!open) return;
    // Defer to the next tick so the modal mount completes first.
    const t = setTimeout(() => {
      editButtonRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pre-send-check-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={() => {
        if (!sending) onCancel();
      }}
      data-testid="pre-send-check-modal"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-lg bg-white shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-gray-200 p-4">
          <div>
            <p
              id="pre-send-check-title"
              className="text-sm font-semibold text-gray-900"
            >
              Before sending — please review
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {warnings.length === 0
                ? "No warnings detected."
                : warnings.length === 1
                  ? "1 item to review"
                  : `${warnings.length} items to review`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            aria-label="Close"
            className="mt-0.5 shrink-0 rounded text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Warnings list */}
        <ul
          className="space-y-2 p-4"
          aria-label="Prescription warnings"
        >
          {warnings.map((warning, idx) => {
            const cfg = KIND_CONFIG[warning.kind];
            return (
              <li
                key={`${warning.kind}-${idx}`}
                className={`rounded-md border p-3 ${cfg.rowCls}`}
                data-testid={`pre-send-warning-${warning.kind}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 text-base leading-none"
                    aria-hidden="true"
                  >
                    {cfg.icon}
                  </span>
                  <div className="flex-1 space-y-1">
                    <p className={`text-sm font-medium ${cfg.titleCls}`}>
                      {cfg.title}
                      {warning.kind === "unacked-ddi" && (
                        <span className="ml-2 text-xs font-normal opacity-80">
                          (highest:{" "}
                          {DDI_SEVERITY_LABEL[warning.highestSeverity]})
                        </span>
                      )}
                    </p>
                    <p className={`text-xs ${cfg.titleCls} opacity-90`}>
                      {warning.summary}
                    </p>

                    {/* Per-kind detail — kept terse. The doctor saw
                        the full details in the live banner / chips
                        already; this is a "pre-flight checklist", not
                        a re-display of every match. */}
                    {warning.kind === "unacked-allergy" &&
                      warning.matches.length > 0 && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-red-800">
                          {warning.matches.slice(0, 3).map((m) => (
                            <li
                              key={`${m.medicineIndex}:${m.allergyId}`}
                              className="leading-snug"
                            >
                              <span className="font-medium">
                                {m.allergenMatched}
                              </span>
                              {m.medicineName ? (
                                <>
                                  {" × "}
                                  {m.medicineName}
                                </>
                              ) : null}
                            </li>
                          ))}
                          {warning.matches.length > 3 && (
                            <li className="leading-snug opacity-80">
                              +{warning.matches.length - 3} more
                            </li>
                          )}
                        </ul>
                      )}
                    {warning.kind === "unacked-ddi" &&
                      warning.rows.length > 0 && (
                        <p className="mt-1 text-xs text-orange-800">
                          {warning.count}{" "}
                          {warning.count === 1
                            ? "interaction"
                            : "interactions"}{" "}
                          flagged. See the chips above the medicines for
                          details.
                        </p>
                      )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer disclaimer (per source plan §T4 risk note) */}
        <p className="px-4 pb-2 text-xs text-gray-500">
          Clariva checks for ~200 known interactions and documented
          allergies. This is not a substitute for your clinical
          judgment.
        </p>

        {/* Action row */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
          <button
            ref={editButtonRef}
            type="button"
            onClick={onEdit}
            disabled={sending}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Edit Rx
          </button>
          <button
            type="button"
            onClick={onSendAnyway}
            disabled={sending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            data-testid="pre-send-send-anyway"
          >
            {sending ? "Sending…" : "Send anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
