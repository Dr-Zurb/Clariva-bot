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
    | "waiting"
    | "called"
    | "no_show"
    | "skipped"
    | "cancelled"
    | "grace"
    | "overflow"
  >;
  label: string;
}

const CHIPS: ChipDef[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "running_late", label: "Late" },
  { value: "in_consultation", label: "In consult" },
  { value: "completed", label: "Done" },
  { value: "missed", label: "Missed" },
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

  /** URL may hold slot-only non-chip values (e.g. cancelled) or queue-mode values. */
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
  };

  return (
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
          <button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={isActive}
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
        );
      })}
    </div>
  );
}
