"use client";

import { ClipboardPlus } from "lucide-react";
import { ChartRailEmptyState } from "./ChartRailEmptyState";

export interface ChartRailEmptySignals {
  allergiesEmpty: boolean;
  chronicEmpty: boolean;
  problemListEmpty: boolean;
  snapshotEmpty: boolean;
  historyEmpty: boolean;
}

export interface UnifiedChartRailEmptyStateProps {
  signals: ChartRailEmptySignals;
  onAddPatientContext?: () => void;
}

/**
 * Decides between unified vs per-pane empty-state rendering (DL-2).
 *
 * When ALL FIVE signals are true, returns a single unified card. When ANY is
 * false (i.e., at least one pane has data), returns null and each pane is
 * expected to render its own per-pane empty-state.
 */
export function UnifiedChartRailEmptyState({
  signals,
  onAddPatientContext,
}: UnifiedChartRailEmptyStateProps): JSX.Element | null {
  const allEmpty =
    signals.allergiesEmpty &&
    signals.chronicEmpty &&
    signals.problemListEmpty &&
    signals.snapshotEmpty &&
    signals.historyEmpty;

  if (!allEmpty) return null;

  return (
    <div className="m-3 rounded-lg border border-dashed border-border bg-card">
      <ChartRailEmptyState
        icon={ClipboardPlus}
        headline="No patient context yet"
        cta={
          onAddPatientContext
            ? { label: "Add patient context", onClick: onAddPatientContext }
            : undefined
        }
      />
    </div>
  );
}
