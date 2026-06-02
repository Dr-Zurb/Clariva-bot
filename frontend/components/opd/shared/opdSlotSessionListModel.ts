/**
 * Shared slot-session filtering + flat ordering for desktop/mobile lists and
 * J/K hotkey navigation (sl-05). Keept in sync with OpdSlotList / OpdSlotMobileList.
 */

import type { SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "../OpdQueueStatusFilter";
import { matchesOpdSearch } from "./opdSearchMatcher";

const ACTIVE_SLOT = new Set([
  "upcoming",
  "grace",
  "running_late",
  "in_consultation",
]);

const QUEUE_ONLY_STATUS = new Set<OpdStatusFilterValue>([
  "waiting",
  "called",
  "no_show",
  "skipped",
]);

export function sortSlotRowsByScheduledAsc(
  a: SlotSessionRow,
  b: SlotSessionRow
): number {
  return (
    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
}

export function filterSlotSessionRows(
  entries: SlotSessionRow[],
  statusFilter: OpdStatusFilterValue,
  searchQuery: string
): SlotSessionRow[] {
  let rows = entries;

  if (statusFilter === "cancelled") {
    rows = rows.filter((r) => r.slotStatus === "cancelled");
  } else {
    rows = rows.filter((r) => r.slotStatus !== "cancelled");
  }

  if (!QUEUE_ONLY_STATUS.has(statusFilter) && statusFilter !== "all") {
    if (statusFilter === "cancelled") {
      // narrowed above
    } else if (statusFilter === "upcoming") {
      rows = rows.filter(
        (r) => r.slotStatus === "upcoming" || r.slotStatus === "grace"
      );
    } else {
      rows = rows.filter((r) => r.slotStatus === statusFilter);
    }
  }

  const q = searchQuery.trim();
  if (q) {
    rows = rows.filter((r) => matchesOpdSearch(r, q));
  }

  return rows;
}

function showActiveSection(statusFilter: OpdStatusFilterValue): boolean {
  return (
    statusFilter === "all" ||
    statusFilter === "upcoming" ||
    statusFilter === "grace" ||
    statusFilter === "running_late" ||
    statusFilter === "in_consultation"
  );
}

/**
 * Flat row order matching on-screen J/K traversal (active → done → missed → overflow;
 * cancelled-only view when that filter is active).
 */
export function flatSlotRowsForHotkeys(
  filtered: SlotSessionRow[],
  statusFilter: OpdStatusFilterValue
): SlotSessionRow[] {
  const cancelledOnlyRows = filtered
    .filter((r) => r.slotStatus === "cancelled")
    .sort(sortSlotRowsByScheduledAsc);
  const nonCancelled = filtered.filter((r) => r.slotStatus !== "cancelled");

  const activeRows = nonCancelled
    .filter((r) => ACTIVE_SLOT.has(r.slotStatus))
    .sort(sortSlotRowsByScheduledAsc);
  const doneRows = nonCancelled
    .filter((r) => r.slotStatus === "completed")
    .sort(sortSlotRowsByScheduledAsc);
  const missedRows = nonCancelled
    .filter((r) => r.slotStatus === "missed")
    .sort(sortSlotRowsByScheduledAsc);
  const overflowRows = nonCancelled
    .filter((r) => r.slotStatus === "overflow")
    .sort(sortSlotRowsByScheduledAsc);

  if (statusFilter === "cancelled") {
    return cancelledOnlyRows;
  }

  const out: SlotSessionRow[] = [];
  if (showActiveSection(statusFilter)) {
    out.push(...activeRows);
  }
  out.push(...doneRows, ...missedRows, ...overflowRows);
  return out;
}
