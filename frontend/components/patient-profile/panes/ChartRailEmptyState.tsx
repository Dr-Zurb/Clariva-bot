"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChartRailEmptyStateProps {
  icon: LucideIcon;
  headline: string;
  /** Optional secondary CTA. Omit for informational empty-states. */
  cta?: { label: string; onClick: () => void };
  /** Smaller padding when stacked inside a tight pane body. */
  compact?: boolean;
}

/**
 * Shared empty-state visual for chart-rail panes (ccd-01).
 * Used by Allergies / Chronic conditions / Problem list / Snapshot when no
 * data exists. `<UnifiedChartRailEmptyState>` decides between per-pane and
 * unified rendering at the rail level.
 */
export function ChartRailEmptyState({
  icon: Icon,
  headline,
  cta,
  compact = false,
}: ChartRailEmptyStateProps): JSX.Element {
  return (
    <div
      className={
        "flex flex-col items-center justify-center gap-2 text-center " +
        (compact ? "p-3" : "p-6")
      }
    >
      <Icon
        className="h-6 w-6 text-muted-foreground/50"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">{headline}</p>
      {cta ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={cta.onClick}
          className="mt-1"
        >
          {cta.label}
        </Button>
      ) : null}
    </div>
  );
}
