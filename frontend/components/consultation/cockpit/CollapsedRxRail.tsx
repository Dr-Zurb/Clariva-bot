"use client";

/**
 * CC-14 / polish-round-3: Custom BODY renderer for the collapsed Rx
 * rail. Renders a "peek text" strip that summarizes the in-flight
 * prescription. Currently surfaces:
 *   - Medicine count (from <RxWorkspace>'s form state via onMedicineCountChange)
 *
 * Future lifts (out of scope for cc-14, but documented here):
 *   - Investigations count — requires <PrescriptionForm> to expose
 *     an `onInvestigationCountChange` prop (mirrors the medicine pattern).
 *   - Diagnosis presence — requires the form to expose
 *     `onDiagnosisChange?: (text: string) => void` so the rail can show
 *     "diagnosis: written" / "diagnosis: pending".
 *
 * After the polish-round-3 refactor the expand chevron is owned by
 * `<RailCollapsedStub>` itself (it lives in the column-header-aligned
 * `h-10 border-b` top band). This renderer focuses only on the body
 * peek content. Clicking anywhere on the peek still expands the rail
 * — the body is wrapped in a `<button>` that calls `onExpand`, so
 * keyboard / AT users get an extra big-button affordance in addition
 * to the top chevron.
 */

import { Pill } from "lucide-react";
import type { RailCollapsedStubRendererProps } from "./RailCollapsedStub";

interface CollapsedRxRailProps extends RailCollapsedStubRendererProps {
  /** Current medicine count from `<RxWorkspace>`'s form state. Default 0. */
  medicineCount?: number;
  /**
   * Optional aria-keyshortcuts forwarded to the big-button. The TOP
   * chevron in `<RailCollapsedStub>` already advertises the same
   * hotkey; this duplication is intentional so screen-readers see the
   * shortcut on whichever expand affordance they land on first.
   */
  ariaKeyShortcuts?: string;
}

export default function CollapsedRxRail({
  label,
  onExpand,
  medicineCount = 0,
  ariaKeyShortcuts,
}: CollapsedRxRailProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${label.toLowerCase()} (${medicineCount} medicine${medicineCount === 1 ? "" : "s"})`}
      aria-keyshortcuts={ariaKeyShortcuts}
      className="flex w-full flex-1 flex-col items-center gap-2 rounded-none p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
    >
      <span className="flex flex-col items-center gap-1">
        <Pill className="h-4 w-4" aria-hidden />
        <span className="text-[11px] font-semibold">
          {medicineCount}
        </span>
        <span className="text-[9px] uppercase tracking-wide [writing-mode:vertical-rl]">
          {medicineCount === 1 ? "medicine" : "medicines"}
        </span>
      </span>
    </button>
  );
}
