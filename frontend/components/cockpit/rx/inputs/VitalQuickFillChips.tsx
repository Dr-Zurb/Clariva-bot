"use client";

import { Button } from "@/components/ui/button";

export interface VitalQuickFillChipOption {
  label: string;
  /** Stable id for tests — defaults to label with `/` replaced. */
  id?: string;
}

export interface VitalQuickFillChipsProps {
  options: readonly VitalQuickFillChipOption[];
  onSelect: (index: number) => void;
  testIdPrefix: string;
  ariaGroupLabel: string;
}

/** Inline ghost chips for one-click common vital values. */
export function VitalQuickFillChips({
  options,
  onSelect,
  testIdPrefix,
  ariaGroupLabel,
}: VitalQuickFillChipsProps): JSX.Element | null {
  if (options.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={ariaGroupLabel}
      className="flex flex-wrap items-center gap-1"
      data-testid={`${testIdPrefix}-quick-fill`}
    >
      {options.map((option, index) => {
        const chipId = option.id ?? option.label.replace(/\//g, "-");
        return (
          <Button
            key={chipId}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 rounded-full border-border/80 bg-muted/40 px-2.5 text-xs font-medium text-foreground hover:bg-muted"
            data-testid={`${testIdPrefix}-quick-fill-${chipId}`}
            aria-label={`Fill ${option.label}`}
            onClick={() => onSelect(index)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
