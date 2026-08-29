/**
 * Shared slot-session filtering + flat ordering for desktop/mobile lists and
 * J/K hotkey navigation. Kept in sync with OpdSlotList / OpdSlotMobileList.
 */

import type { SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "../OpdQueueStatusFilter";
import {
  partitionSlotRowsForList,
  sortSlotRowsByScheduledAsc,
} from "../opdSlotSectioning";
import { matchesOpdSearch } from "./opdSearchMatcher";
import { matchesSlotStatusFilter, resolveLifecycle } from "./slotAxes";

export { sortSlotRowsByScheduledAsc };

const QUEUE_ONLY_STATUS = new Set<OpdStatusFilterValue>([
  "waiting",
  "called",
  "no_show",
  "skipped",
]);

function isCancelledRow(r: SlotSessionRow): boolean {
  return (
    resolveLifecycle(r) === "cancelled" || r.slotStatus === "cancelled"
  );
}

export function filterSlotSessionRows(
  entries: SlotSessionRow[],
  statusFilter: OpdStatusFilterValue,
  searchQuery: string
): SlotSessionRow[] {
  let rows = entries;

  if (statusFilter === "cancelled") {
    rows = rows.filter((r) => isCancelledRow(r));
  } else if (statusFilter !== "all") {
    // Single-status chips (except cancelled) hide cancelled rows.
    rows = rows.filter((r) => !isCancelledRow(r));
  }
  // All keeps cancelled so the Cancelled section can render them.

  if (!QUEUE_ONLY_STATUS.has(statusFilter) && statusFilter !== "all") {
    if (statusFilter !== "cancelled") {
      rows = rows.filter((r) => matchesSlotStatusFilter(r, statusFilter));
    }
  }

  const q = searchQuery.trim();
  if (q) {
    rows = rows.filter((r) => matchesOpdSearch(r, q));
  }

  return rows;
}

/** Flat row order matching on-screen J/K traversal (chip section order). */
export function flatSlotRowsForHotkeys(
  filtered: SlotSessionRow[],
  _statusFilter: OpdStatusFilterValue
): SlotSessionRow[] {
  const {
    incomplete,
    late,
    upcoming,
    done,
    missed,
    overflow,
    cancelled,
  } = partitionSlotRowsForList(filtered);
  return [
    ...incomplete,
    ...late,
    ...upcoming,
    ...done,
    ...missed,
    ...overflow,
    ...cancelled,
  ];
}
