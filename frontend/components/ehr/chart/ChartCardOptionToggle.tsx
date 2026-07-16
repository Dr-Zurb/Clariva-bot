"use client";

import { chartCardOptionChipClass } from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";

export interface ChartCardOption<T extends string> {
  value: T;
  label: string;
  /** Per-option disable (e.g. Secondary when it's the only committed Dx). */
  disabled?: boolean;
  /** Native tooltip when the option is unavailable. */
  title?: string;
}

export interface ChartCardOptionToggleProps<T extends string> {
  options: readonly ChartCardOption<T>[];
  value: T | null | undefined;
  disabled?: boolean;
  ariaLabel: string;
  testId?: string;
  /** When selected, uses muted "past" styling (substance Current/Past pattern). */
  pastOptionValue?: T;
  onChange: (value: T) => void;
}

/** Squarish inline chips for toggles inside nested cards (substances, conditions, meds). */
export function ChartCardOptionToggle<T extends string>({
  options,
  value,
  disabled = false,
  ariaLabel,
  testId,
  pastOptionValue,
  onChange,
}: ChartCardOptionToggleProps<T>) {
  return (
    <div
      className="flex shrink-0 gap-0.5"
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((option) => {
        const isSelected = value === option.value;
        const isPastSelected =
          pastOptionValue != null && isSelected && option.value === pastOptionValue;
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
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            onClick={() => {
              if (isUnavailable) return;
              onChange(option.value);
            }}
            className={cn(
              chartCardOptionChipClass(isSelected, isPastSelected),
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
