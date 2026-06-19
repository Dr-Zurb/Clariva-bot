"use client";

import { CHART_QUICK_CHIP_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";

export interface ChartQuickAddChipsProps {
  labels: readonly string[];
  disabled?: boolean;
  groupLabel: string;
  testId?: string;
  onAdd: (label: string) => void;
}

export function ChartQuickAddChips({
  labels,
  disabled,
  groupLabel,
  testId,
  onAdd,
}: ChartQuickAddChipsProps) {
  if (labels.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-xs font-medium text-foreground/80">{groupLabel}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={groupLabel}>
        {labels.map((label) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => onAdd(label)}
            className={cn(CHART_QUICK_CHIP_CLASS)}
          >
            + {label}
          </button>
        ))}
      </div>
    </div>
  );
}
