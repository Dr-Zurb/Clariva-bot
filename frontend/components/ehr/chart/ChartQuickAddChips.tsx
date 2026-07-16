"use client";

import { CHART_QUICK_CHIP_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";

export interface ChartQuickAddItem {
  id: string;
  label: string;
  /** Optional trailing badge (e.g. ICD code) — shown on the chip. */
  badge?: string;
}

export interface ChartQuickAddChipsProps {
  /**
   * Simple string chips (allergies, meds, legacy). Prefer {@link items} when the
   * chip should mirror a coded commit (title + badge).
   */
  labels?: readonly string[];
  items?: readonly ChartQuickAddItem[];
  disabled?: boolean;
  groupLabel: string;
  testId?: string;
  /** Called with the chip label when using {@link labels}. */
  onAdd?: (label: string) => void;
  /** Called with the full item when using {@link items}. */
  onAddItem?: (item: ChartQuickAddItem) => void;
}

export function ChartQuickAddChips({
  labels,
  items,
  disabled,
  groupLabel,
  testId,
  onAdd,
  onAddItem,
}: ChartQuickAddChipsProps) {
  const resolvedItems: ChartQuickAddItem[] = items
    ? [...items]
    : (labels ?? []).map((label) => ({ id: label, label }));

  if (resolvedItems.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-xs font-medium text-foreground/80">{groupLabel}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={groupLabel}>
        {resolvedItems.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (onAddItem) onAddItem(item);
              else onAdd?.(item.label);
            }}
            className={cn(CHART_QUICK_CHIP_CLASS, "inline-flex items-center gap-1.5")}
          >
            <span>+ {item.label}</span>
            {item.badge ? (
              <span className="rounded border border-border/70 bg-muted/50 px-1 py-px font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
