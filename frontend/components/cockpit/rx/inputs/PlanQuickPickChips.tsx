"use client";

/**
 * Plan-tab quick-pick chip strip (plan-p2).
 * Presentational — parent owns field updates.
 *
 * Selected chips stay clickable (toggle/replace) and keep a reserved "+"
 * slot so selection does not reflow the wrap row.
 */

import { chartQuickChipClass } from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";

export interface PlanQuickPickChipsProps {
  labels: readonly string[];
  disabled?: boolean;
  groupLabel: string;
  testId?: string;
  /** When true for a label, chip renders selected (already applied). */
  isSelected?: (label: string) => boolean;
  onPick: (label: string) => void;
}

export function PlanQuickPickChips({
  labels,
  disabled = false,
  groupLabel,
  testId,
  isSelected,
  onPick,
}: PlanQuickPickChipsProps) {
  if (labels.length === 0) return null;

  return (
    <div className="space-y-1" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{groupLabel}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={groupLabel}>
        {labels.map((label) => {
          const selected = isSelected?.(label) ?? false;
          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={selected ? label : `+ ${label}`}
              onClick={() => onPick(label)}
              className={cn(chartQuickChipClass(selected))}
            >
              <span className="inline-flex items-center gap-0.5">
                <span
                  className={cn(
                    "inline-block w-2.5 shrink-0 text-center",
                    selected && "invisible",
                  )}
                  aria-hidden
                >
                  +
                </span>
                <span>{label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
