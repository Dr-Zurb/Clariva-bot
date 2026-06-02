/**
 * Slot-mode empty-state derivation (sl-05). Pure helper — Vitest-friendly.
 */

import type { SlotSessionRow, SlotStatus } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";

export type SlotEmptyState =
  | { kind: "no-data" }
  | { kind: "filtered-empty"; filter: SlotStatus | OpdStatusFilterValue | "search" }
  | { kind: "all-completed" }
  | { kind: "none" };

const FILTER_LABELS: Partial<Record<OpdStatusFilterValue | SlotStatus, string>> =
  {
    all: "All",
    upcoming: "Upcoming",
    grace: "Grace",
    running_late: "Late",
    in_consultation: "In consult",
    completed: "Done",
    missed: "Missed",
    cancelled: "Cancelled",
    overflow: "Overflow",
  };

export function slotFilterEmptyLabel(
  filter: SlotStatus | OpdStatusFilterValue | "search"
): string {
  if (filter === "search") return "your search";
  return FILTER_LABELS[filter] ?? String(filter);
}

export function deriveSlotEmptyState(args: {
  entries: SlotSessionRow[];
  filteredCount: number;
  statusFilter: OpdStatusFilterValue;
  searchQuery: string;
}): SlotEmptyState {
  if (args.entries.length === 0) return { kind: "no-data" };
  if (args.entries.every((r) => r.slotStatus === "completed")) {
    return { kind: "all-completed" };
  }
  if (args.filteredCount === 0) {
    if (args.searchQuery.trim()) return { kind: "filtered-empty", filter: "search" };
    return { kind: "filtered-empty", filter: args.statusFilter };
  }
  return { kind: "none" };
}
