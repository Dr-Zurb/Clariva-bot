"use client";

/**
 * OPD slot-mode status filter chips (URL-backed via useOpdQueueFilters).
 *
 * Mirrors OpdQueueStatusFilter: tablist semantics, ←/→ navigation, count badges.
 *
 * @see docs/Work/Daily-plans/May 2026/15-05-2026/opd-slot-hub/Tasks/task-sl-03-slot-status-filter-and-search.md
 */

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { SlotSessionCounts } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";
import { trackOpdSlotEvent } from "./opdQueueTelemetry";
import {
  SLOT_CHIP_ALL_HINT,
  SLOT_CHIP_SECTION_HINT,
} from "./opdSlotSectioning";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpdSlotStatusFilterProps {
  value: OpdStatusFilterValue;
  onChange: (next: OpdStatusFilterValue) => void;
  counts: SlotSessionCounts;
  className?: string;
}

interface ChipDef {
  value: Exclude<
    OpdStatusFilterValue,
    "waiting" | "called" | "no_show" | "skipped" | "grace"
  >;
  label: string;
  hint: string;
}

const CHIPS: ChipDef[] = [
  { value: "all", label: "All", hint: SLOT_CHIP_ALL_HINT },
  {
    value: "upcoming",
    label: "Upcoming",
    hint: SLOT_CHIP_SECTION_HINT.upcoming,
  },
  {
    value: "running_late",
    label: "Overdue",
    hint: SLOT_CHIP_SECTION_HINT.late,
  },
  {
    value: "in_consultation",
    label: "Incomplete",
    hint: SLOT_CHIP_SECTION_HINT.incomplete,
  },
  {
    value: "completed",
    label: "Done",
    hint: SLOT_CHIP_SECTION_HINT.done,
  },
  {
    value: "missed",
    label: "No show",
    hint: SLOT_CHIP_SECTION_HINT.missed,
  },
  {
    value: "overflow",
    label: "Overflow",
    hint: SLOT_CHIP_SECTION_HINT.overflow,
  },
  {
    value: "cancelled",
    label: "Cancelled",
    hint: SLOT_CHIP_SECTION_HINT.cancelled,
  },
];

const CHIP_VALUE_SET = new Set<string>(CHIPS.map((c) => c.value));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpdSlotStatusFilter({
  value,
  onChange,
  counts,
  className,
}: OpdSlotStatusFilterProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);

  /** URL may hold queue-mode values; fall back to All. */
  const resolvedValue: ChipDef["value"] = CHIP_VALUE_SET.has(value)
    ? (value as ChipDef["value"])
    : "all";

  const handleKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) => {
    if (!listRef.current) return;
    const buttons = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
    );
    if (e.key === "ArrowRight") {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    }
  };

  const chipCounts: Record<ChipDef["value"], number> = {
    all: counts.all,
    upcoming: counts.upcoming,
    running_late: counts.running_late,
    in_consultation: counts.in_consultation,
    completed: counts.completed,
    missed: counts.missed,
    overflow: counts.overflow,
    cancelled: counts.cancelled,
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Filter slots by status"
        className={cn(
          "flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none sm:flex-wrap",
          className
        )}
      >
        {CHIPS.map((chip, idx) => {
          const isActive = resolvedValue === chip.value;
          const count = chipCounts[chip.value] ?? 0;
          const isMuted = count === 0 && chip.value !== "all";

          return (
            <Tooltip key={chip.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-description={chip.hint}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => {
                    trackOpdSlotEvent({
                      event: "opd_slot.filter_changed",
                      kind: "status",
                      statusValue: chip.value,
                      queryLength: null,
                    });
                    onChange(chip.value);
                  }}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  className={cn(
                    "inline-flex shrink-0 cursor-pointer select-none items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isActive
                      ? "bg-primary text-primary-foreground shadow"
                      : isMuted
                        ? "border border-input bg-background text-muted-foreground/50 hover:bg-accent hover:text-accent-foreground"
                        : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span>{chip.label}</span>
                  <span className="tabular-nums opacity-80">{count}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-left">
                {chip.hint}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
