"use client";

import { cn } from "@/lib/utils";

export interface LastVisitVitalGhostProps {
  label: string;
  displayText: string;
  onApply: () => void;
  testId?: string;
  className?: string;
  sourceLabel?: string;
}

/** Clickable previous-visit or desk value — applies ghost when the field is empty. */
export function LastVisitVitalGhost({
  label,
  displayText,
  onApply,
  testId,
  className,
  sourceLabel = "prev",
}: LastVisitVitalGhostProps): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "block text-left text-[10px] text-muted-foreground/70 transition-colors",
        "hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        className,
      )}
      aria-label={`Copy ${sourceLabel} ${label}: ${displayText}`}
      data-testid={testId}
      onClick={onApply}
    >
      {sourceLabel} {displayText}
    </button>
  );
}
