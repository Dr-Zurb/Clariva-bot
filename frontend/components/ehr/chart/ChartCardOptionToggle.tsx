"use client";

import { chartCardOptionChipClass } from "@/components/ehr/chart/chart-chip-styles";

export interface ChartCardOption<T extends string> {
  value: T;
  label: string;
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
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={option.label}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            onClick={() => onChange(option.value)}
            className={chartCardOptionChipClass(isSelected, isPastSelected)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
