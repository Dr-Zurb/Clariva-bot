"use client";

/**
 * InteractionChips (EHR Sub-batch C / T4.20 — C.3).
 *
 * Renders 0..N chips above the medicines section, one per unacknowledged
 * drug–drug interaction (DDI) row returned by the backend check endpoint.
 *
 * Chip anatomy:
 *   [⚠️ <severity>] <Drug A> + <Drug B>  ✕
 *
 * Tapping the chip body opens a detail modal with:
 *   - Full interaction description + recommendation
 *   - Source citation
 *   - "Acknowledge" button (removes the chip until the drug is removed
 *     and re-added — per-instance keying via the interaction row id).
 *
 * The ✕ button on the chip directly acknowledges without opening the modal.
 *
 * Decision T4-D1 LOCKED: soft warnings only. Neither this component nor
 * any parent disables the Send button based on chip state.
 *
 * Decision §22 LOCKED: acknowledgements are per-Rx in-memory only.
 * This component consumes `isAcked` / `onAck` from the parent form's
 * `useAcknowledgements()` instance — no state is owned here.
 *
 * Decision §23 LOCKED but DEFERRED to C.4: no telemetry is emitted from
 * this component. The pre-send aggregator (T4.21) emits the outcome event.
 *
 * @see frontend/lib/api/drug-interactions.ts
 * @see frontend/lib/ehr/use-acknowledgements.ts
 * @see frontend/components/consultation/PrescriptionForm.tsx
 */

import { useEffect, useRef, useState } from "react";
import type { InteractionRow, InteractionSeverity } from "@/lib/api/drug-interactions";
import type { DrugMasterRow } from "@/types/drug-master";

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Compute the per-Rx acknowledgement key for a DDI chip.
 * Uses the interaction row's `id` (a stable DB primary key) as the
 * discriminant, wrapped in a namespace prefix to avoid collisions with
 * allergy ack keys (which use `allergy:` prefix).
 *
 * Exported so PrescriptionForm (and eventually the C.4 pre-send aggregator)
 * can reconstruct the key without importing the full component.
 */
export function ackKeyForDdi(interactionId: string): string {
  return `ddi:${interactionId}`;
}

// ---------------------------------------------------------------------------
// Severity display config
// ---------------------------------------------------------------------------

/**
 * Severity rank used for chip ordering. Highest first so the most
 * clinically urgent interaction sits leftmost in the chip strip — same
 * priority axis the pre-send aggregator uses to surface
 * `highestSeverity` (see `pre-send-warnings.ts`). Keeping the two
 * surfaces in lockstep makes the doctor's eye land on the same warning
 * whether they're scanning the live chips or the modal summary.
 */
const SEVERITY_RANK: Record<InteractionSeverity, number> = {
  contraindicated: 4,
  major: 3,
  moderate: 2,
  minor: 1,
};

const SEVERITY_CONFIG: Record<
  InteractionSeverity,
  { label: string; chipCls: string; badgeCls: string; modalBorderCls: string }
> = {
  minor: {
    label: "Minor",
    chipCls:
      "border-yellow-300 bg-yellow-50 text-yellow-900 hover:bg-yellow-100",
    badgeCls: "bg-yellow-100 text-yellow-800",
    modalBorderCls: "border-yellow-300",
  },
  moderate: {
    label: "Moderate",
    chipCls:
      "border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100",
    badgeCls: "bg-orange-100 text-orange-800",
    modalBorderCls: "border-orange-300",
  },
  major: {
    label: "Major",
    chipCls: "border-red-300 bg-red-50 text-red-900 hover:bg-red-100",
    badgeCls: "bg-red-100 text-red-800",
    modalBorderCls: "border-red-300",
  },
  contraindicated: {
    label: "Contraindicated",
    chipCls:
      "border-red-500 bg-red-100 text-red-950 hover:bg-red-200",
    badgeCls: "bg-red-200 text-red-900",
    modalBorderCls: "border-red-500",
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InteractionChipsProps {
  /** Full set of interaction rows returned by the check endpoint. */
  interactions: ReadonlyArray<InteractionRow>;
  /** Map of drug_master_id → DrugMasterRow for currently selected drugs.
   *  Used to render drug names in chips and modals. If a drug_id is not in
   *  the index (shouldn't happen since we only query ids the form knows
   *  about), the id is shown as a fallback. */
  drugMasterIndex: ReadonlyMap<string, DrugMasterRow>;
  /** From `useAcknowledgements()` in the parent form. */
  isAcked: (key: string) => boolean;
  /** Acknowledge a single DDI chip (ack key = `ackKeyForDdi(row.id)`). */
  onAck: (key: string) => void;
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

interface DetailModalProps {
  row: InteractionRow;
  drugA: string;
  drugB: string;
  onAcknowledge: () => void;
  onClose: () => void;
}

function DetailModal({ row, drugA, drugB, onAcknowledge, onClose }: DetailModalProps) {
  const cfg = SEVERITY_CONFIG[row.severity];
  const overlayRef = useRef<HTMLDivElement>(null);

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Trap focus on mount — move focus into the modal container.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ddi-modal-title"
        tabIndex={-1}
        className={`w-full max-w-md rounded-lg border bg-white shadow-xl outline-none ${cfg.modalBorderCls}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 p-4 pb-3">
          <div className="space-y-0.5">
            <p
              id="ddi-modal-title"
              className="text-sm font-semibold text-gray-900"
            >
              {drugA} + {drugB}
            </p>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badgeCls}`}
            >
              {cfg.label} interaction
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mt-0.5 shrink-0 rounded text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 px-4 pb-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Interaction
            </p>
            <p className="mt-0.5 text-sm text-gray-800">{row.description}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Recommendation
            </p>
            <p className="mt-0.5 text-sm text-gray-800">{row.recommendation}</p>
          </div>
          {row.source && (
            <p className="text-xs text-gray-400">
              Source:{" "}
              {row.source_url ? (
                <a
                  href={row.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-gray-600"
                >
                  {row.source}
                </a>
              ) : (
                row.source
              )}
            </p>
          )}
          <p className="text-xs text-gray-500">
            Send is never blocked — review and proceed with clinical judgement.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className="rounded-md border border-gray-400 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InteractionChips({
  interactions,
  drugMasterIndex,
  isAcked,
  onAck,
}: InteractionChipsProps) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Filter to unacknowledged rows, then sort severity-desc so the
  // highest-severity chip is leftmost. Tie-break on `id` for a stable
  // visual order regardless of the underlying API row order.
  const unacked = interactions
    .filter((row) => !isAcked(ackKeyForDdi(row.id)))
    .slice()
    .sort((a, b) => {
      const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (rankDiff !== 0) return rankDiff;
      return a.id.localeCompare(b.id);
    });

  if (unacked.length === 0) return null;

  const openRow = openRowId ? interactions.find((r) => r.id === openRowId) ?? null : null;

  const getDrugName = (id: string): string =>
    drugMasterIndex.get(id)?.generic_name ?? id;

  const handleAck = (row: InteractionRow) => {
    onAck(ackKeyForDdi(row.id));
    // If this was the open modal's row, close the modal.
    if (openRowId === row.id) setOpenRowId(null);
  };

  return (
    <>
      <div
        role="region"
        aria-label="Drug interaction warnings"
        className="flex flex-wrap gap-2"
        data-testid="interaction-chips"
      >
        {unacked.map((row) => {
          const cfg = SEVERITY_CONFIG[row.severity];
          const drugA = getDrugName(row.drug_a_id);
          const drugB = getDrugName(row.drug_b_id);

          return (
            <div
              key={row.id}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${cfg.chipCls}`}
            >
              {/* Chip body — opens detail modal */}
              <button
                type="button"
                onClick={() => setOpenRowId(row.id)}
                aria-label={`${cfg.label} interaction: ${drugA} + ${drugB}. Tap for details.`}
                className="flex items-center gap-1 focus:outline-none"
              >
                <span aria-hidden="true">⚠️</span>
                <span className="font-semibold">{cfg.label}</span>
                <span className="opacity-75">—</span>
                <span>
                  {drugA} + {drugB}
                </span>
              </button>

              {/* ✕ — acknowledge without opening modal */}
              <button
                type="button"
                onClick={() => handleAck(row)}
                aria-label={`Acknowledge ${cfg.label} interaction between ${drugA} and ${drugB}`}
                className="ml-1 rounded-full p-0.5 opacity-60 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-current"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Detail modal — rendered outside the chip list for stacking context */}
      {openRow && (
        <DetailModal
          row={openRow}
          drugA={getDrugName(openRow.drug_a_id)}
          drugB={getDrugName(openRow.drug_b_id)}
          onAcknowledge={() => handleAck(openRow)}
          onClose={() => setOpenRowId(null)}
        />
      )}
    </>
  );
}
