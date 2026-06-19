"use client";

import { chartOptionChipClass } from "@/components/ehr/chart/chart-chip-styles";
import { ChartMedMoreCombobox } from "@/components/ehr/chart/ChartMedMoreCombobox";

export interface ChartMedChipOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export interface ChartMedChipSelectProps<T extends string> {
  primaryValues: readonly T[];
  allOptions: readonly ChartMedChipOption<T>[];
  value: T | null;
  disabled?: boolean;
  ariaLabel: string;
  morePlaceholder?: string;
  /** Text shown in the More combobox (secondary enum label or custom). */
  moreText?: string | null;
  onSelect: (value: T | null) => void;
  /** Called when More input commits to a non-primary value (enum or custom). */
  onMoreCommit: (raw: string) => void;
  onMoreClear?: () => void;
  /** Put the typable More combobox on its own row (long labels like stop reasons). */
  moreOnNextRow?: boolean;
}

export function ChartMedChipSelect<T extends string>({
  primaryValues,
  allOptions,
  value,
  disabled = false,
  ariaLabel,
  morePlaceholder = "More…",
  moreText = null,
  onSelect,
  onMoreCommit,
  onMoreClear,
  moreOnNextRow = false,
}: ChartMedChipSelectProps<T>) {
  const primarySet = new Set(primaryValues as readonly string[]);
  const secondaryOptions = allOptions.filter((opt) => !primarySet.has(opt.value));

  const moreDisplayValue = (): string => {
    if (moreText?.trim()) return moreText.trim();
    if (value && !primarySet.has(value)) {
      return allOptions.find((o) => o.value === value)?.label ?? value;
    }
    return "";
  };

  const suggestions = secondaryOptions.map((opt) => ({
    value: opt.value,
    label: opt.label,
    hint: opt.title,
  }));

  const primaryChips = allOptions
    .filter((opt) => primarySet.has(opt.value))
    .map((opt) => (
      <button
        key={opt.value}
        type="button"
        disabled={disabled}
        aria-pressed={value === opt.value && !moreText?.trim()}
        title={opt.title}
        className={chartOptionChipClass(value === opt.value && !moreText?.trim())}
        onClick={() => onSelect(value === opt.value ? null : opt.value)}
      >
        {opt.label}
      </button>
    ));

  const moreCombobox =
    secondaryOptions.length > 0 || onMoreCommit ? (
      <ChartMedMoreCombobox
        placeholder={morePlaceholder}
        disabled={disabled}
        value={moreDisplayValue()}
        suggestions={suggestions}
        className={
          moreOnNextRow
            ? "w-full min-w-0 [&_input]:w-full [&_input]:min-w-0 [&_ul]:min-w-full"
            : undefined
        }
        resolveMatch={(query) => {
          const lower = query.trim().toLowerCase();
          const hit = allOptions.find(
            (o) =>
              o.value.toLowerCase() === lower ||
              o.label.toLowerCase() === lower,
          );
          return hit?.value;
        }}
        onCommit={onMoreCommit}
        onClear={onMoreClear}
      />
    ) : null;

  if (moreOnNextRow) {
    return (
      <div role="group" aria-label={ariaLabel} className="flex w-full min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1">{primaryChips}</div>
        {moreCombobox}
      </div>
    );
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1">
      {primaryChips}
      {moreCombobox}
    </div>
  );
}
