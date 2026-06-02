"use client";

import { useEffect, type ReactNode } from "react";
import { useChartRailEmptySignals } from "@/hooks/use-chart-rail-empty-signals";
import { trackCockpitPolishChartDensityLanded } from "@/lib/patient-profile/telemetry";
import type { ChartRailEmptySignals } from "./UnifiedChartRailEmptyState";
import { UnifiedChartRailEmptyState } from "./UnifiedChartRailEmptyState";

export interface ChartRailWithEmptyStateProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  onAddPatientContext?: () => void;
  children: ReactNode;
}

function countEmptyPanes(signals: ChartRailEmptySignals): number {
  return [
    signals.allergiesEmpty,
    signals.chronicEmpty,
    signals.problemListEmpty,
    signals.snapshotEmpty,
    signals.historyEmpty,
  ].filter(Boolean).length;
}

function isUnifiedEmptyState(signals: ChartRailEmptySignals): boolean {
  return countEmptyPanes(signals) === 5;
}

/**
 * Left-column group wrapper (ccd-01): shows the unified empty card when all
 * chart-rail signals are empty; otherwise renders children only.
 */
export function ChartRailWithEmptyState({
  appointmentId,
  patientId,
  token,
  onAddPatientContext,
  children,
}: ChartRailWithEmptyStateProps): JSX.Element {
  const { signals, isLoading } = useChartRailEmptySignals(patientId, token);

  useEffect(() => {
    if (isLoading) return;
    trackCockpitPolishChartDensityLanded({
      appointmentId,
      emptyPaneCount: countEmptyPanes(signals),
      unifiedEmptyState: isUnifiedEmptyState(signals),
    });
  }, [appointmentId, isLoading, signals]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!isLoading ? (
        <UnifiedChartRailEmptyState
          signals={signals}
          onAddPatientContext={onAddPatientContext}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
