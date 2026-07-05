"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  lowConfidenceBadgeCopy,
  type LowConfidenceReason,
} from "@/lib/cockpit/vital-confidence";

export interface VitalLowConfidenceBadgeProps {
  reason: LowConfidenceReason;
  testId?: string;
}

export function VitalLowConfidenceBadge({
  reason,
  testId = "vital-low-confidence-badge",
}: VitalLowConfidenceBadgeProps): JSX.Element {
  const copy = lowConfidenceBadgeCopy(reason);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 items-center rounded-full border border-amber-300/80 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800"
          data-testid={testId}
          aria-label={copy.tooltip}
        >
          {copy.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{copy.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
