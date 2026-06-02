"use client";

/**
 * OPD queue status segmented-control filter chips.
 *
 * Renders a horizontal tablist with live counts per status bucket.
 * The active chip is filled (variant="default"); inactive chips are outlined.
 * Zero-count chips stay visible but are visually muted.
 *
 * Keyboard navigation: ← / → move focus; Enter / Space select.
 * Accessibility: role="tablist" / role="tab" / aria-selected.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-07-status-filter.md
 */

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { trackOpdQueueEvent } from "./opdQueueTelemetry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * URL-backed `?status=` union for both queue and slot OPD hubs. Each mode’s
 * chip strip renders only its slice; unknown / other-mode values stay in the
 * URL and fall back visually (see chip components).
 */
export type OpdStatusFilterValue =
  | "all"
  | "waiting" // queue-only; ignored by slot list (sl-04)
  | "called" // queue-only
  | "upcoming" // slot-only (grace rolled into upcoming per DL-4)
  | "grace" // slot-only; URL-only
  | "running_late" // slot-only
  | "in_consultation"
  | "completed"
  | "no_show" // queue-only
  | "missed" // slot-only
  | "skipped" // queue-only; URL-only chip
  | "cancelled" // slot-only; URL-only (no chip)
  | "overflow"; // slot-only; URL-only

/** @deprecated Prefer `OpdStatusFilterValue`; alias retained for lazy migration. */
export type OpdQueueStatusFilterValue = OpdStatusFilterValue;

export interface OpdQueueStatusFilterProps {
  value: OpdQueueStatusFilterValue;
  onChange: (next: OpdQueueStatusFilterValue) => void;
  /** Counts per filter value, computed by the parent (OpdTodayClient). */
  counts: Record<OpdQueueStatusFilterValue, number>;
  className?: string;
}

// ---------------------------------------------------------------------------
// Chip definitions — rendered in this exact order
// ---------------------------------------------------------------------------

interface ChipDef {
  value: OpdQueueStatusFilterValue;
  label: string;
}

const CHIPS: ChipDef[] = [
  { value: "all", label: "All" },
  { value: "waiting", label: "Waiting" },
  { value: "called", label: "Called" },
  { value: "in_consultation", label: "In consult" },
  { value: "completed", label: "Done" },
  { value: "no_show", label: "No-show" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpdQueueStatusFilter({
  value,
  onChange,
  counts,
  className,
}: OpdQueueStatusFilterProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Filter queue by status"
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none sm:flex-wrap",
        className
      )}
    >
      {CHIPS.map((chip, idx) => {
        const isActive = value === chip.value;
        const count = counts[chip.value] ?? 0;
        const isMuted = count === 0 && chip.value !== "all";

        return (
          <button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              trackOpdQueueEvent({
                event: "opd_queue.filter_changed",
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

// ---------------------------------------------------------------------------
// Count computation helper (used by OpdTodayClient)
// ---------------------------------------------------------------------------

import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

/**
 * Derive OpdQueueStatusFilterValue → count map from all queue entries.
 * Called once in OpdTodayClient; passed to <OpdQueueStatusFilter counts={…} />.
 */
export function computeFilterCounts(
  entries: DoctorQueueSessionRow[]
): Record<OpdQueueStatusFilterValue, number> {
  const c: Record<OpdQueueStatusFilterValue, number> = {
    all: entries.length,
    waiting: 0,
    called: 0,
    upcoming: 0,
    grace: 0,
    running_late: 0,
    in_consultation: 0,
    completed: 0,
    no_show: 0,
    missed: 0,
    skipped: 0,
    cancelled: 0,
    overflow: 0,
  };

  for (const e of entries) {
    const s = e.queueStatus;
    if (s === "waiting") c.waiting++;
    else if (s === "called") c.called++;
    else if (s === "in_consultation") c.in_consultation++;
    else if (s === "completed") c.completed++;
    else if (s === "skipped") {
      c.skipped++;
      c.no_show++; // skipped counts inside the no_show bucket
    } else if (s === "missed" || s === "cancelled") {
      c.no_show++;
    }
  }

  return c;
}
