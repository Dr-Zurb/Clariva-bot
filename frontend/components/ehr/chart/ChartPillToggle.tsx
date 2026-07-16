"use client";

import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";

export interface ChartPillOption<T extends string> {
  value: T;
  label: string;
  /** Per-option disable (e.g. Secondary when it's the only committed Dx). */
  disabled?: boolean;
  /** Native tooltip when the option is unavailable. */
  title?: string;
}

export interface ChartPillToggleProps<T extends string> {
  options: readonly ChartPillOption<T>[];
  value: T | null | undefined;
  disabled?: boolean;
  ariaLabel: string;
  testId?: string;
  onChange: (value: T) => void;
}

export function ChartPillToggle<T extends string>({
  options,
  value,
  disabled = false,
  ariaLabel,
  testId,
  onChange,
}: ChartPillToggleProps<T>) {
  return (
    <div
      className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "min-w-0 max-w-full")}
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((option) => {
        const isSelected = value === option.value;
        const groupDisabled = disabled;
        const optionOnlyDisabled = Boolean(option.disabled) && !groupDisabled;
        const isUnavailable = groupDisabled || optionOnlyDisabled;
        return (
          <button
            key={option.value}
            type="button"
            disabled={groupDisabled}
            aria-disabled={isUnavailable || undefined}
            aria-pressed={isSelected}
            aria-label={option.label}
            title={optionOnlyDisabled ? option.title : undefined}
            onClick={() => {
              if (isUnavailable) return;
              onChange(option.value);
            }}
            className={cn(
              chartSelectChipClass(isSelected),
              // Never let a long chip label blow past a narrow pane.
              "max-w-full",
              optionOnlyDisabled &&
                "cursor-not-allowed line-through opacity-45 hover:border-border hover:text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function formatActivePastSummary(
  activeCount: number,
  pastCount: number,
  activeLabel: string,
  pastLabel: string,
  emptyLabel: string,
): string {
  if (activeCount === 0 && pastCount === 0) return emptyLabel;
  const parts: string[] = [];
  if (activeCount > 0) parts.push(`${activeCount} ${activeLabel}`);
  if (pastCount > 0) parts.push(`${pastCount} ${pastLabel}`);
  return parts.join(" · ");
}

export function sortActiveFirst<T extends { status: "active" | "past" | "resolved" }>(
  rows: T[],
): T[] {
  const rank = (status: T["status"]) => (status === "active" ? 0 : 1);
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status));
}

export function countActivePast<T extends { status: "active" | "past" | "resolved" }>(
  rows: T[],
): { active: number; past: number } {
  let active = 0;
  let past = 0;
  for (const row of rows) {
    if (row.status === "active") active += 1;
    else past += 1;
  }
  return { active, past };
}
