"use client";

/**
 * OpdQueueGroupingToggle — a single "Group" pill that appears on the filter
 * strip only when the "All" status filter is active.
 *
 * Pressing it while active (group mode) exits to token-asc (flat list).
 * Pressing it while inactive re-enters group mode.
 *
 * Token ascending / descending is controlled separately by clicking the
 * "#" column header in OpdQueueTable — that keeps sorting concerns close to
 * the column they act on, instead of buried in a separate control.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OpdQueueGrouping } from "@/hooks/useOpdQueueGrouping";

export interface OpdQueueGroupingToggleProps {
  grouping: OpdQueueGrouping;
  onChange: (next: OpdQueueGrouping) => void;
}

export function OpdQueueGroupingToggle({
  grouping,
  onChange,
}: OpdQueueGroupingToggleProps): JSX.Element {
  const isGrouped = grouping === "group";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChange(isGrouped ? "token-asc" : "group")}
            aria-pressed={isGrouped}
            className={cn(
              "h-7 rounded-md border px-3 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isGrouped
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            Group
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {isGrouped
            ? "Grouped by status — click to switch to flat token order"
            : "Flat token order — click to group by status (Active / Done / Missed)"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
