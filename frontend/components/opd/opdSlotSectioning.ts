/**
 * Pure slot-session sectioning + "now" divider placement (desktop + mobile lists, sl-04).
 * Kept in sync with `shared/opdSlotSessionListModel` ordering for hotkeys.
 */

import type { SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";
import { sortSlotRowsByScheduledAsc } from "./shared/opdSlotSessionListModel";

const ACTIVE_SLOT = new Set([
  "upcoming",
  "grace",
  "running_late",
  "in_consultation",
]);

export interface SlotSectionBuckets {
  active: SlotSessionRow[];
  done: SlotSessionRow[];
  missed: SlotSessionRow[];
  overflow: SlotSessionRow[];
  cancelledOnly: SlotSessionRow[];
}

/**
 * Partition already-filtered rows (see `filterSlotSessionRows`) into UI sections.
 * Cancelled rows are split out; non-cancelled rows go into Active / Done / Missed / Overflow.
 */
export function bucketSlotRowsForSections(
  filtered: SlotSessionRow[]
): SlotSectionBuckets {
  const cancelledOnlyRows = filtered.filter((r) => r.slotStatus === "cancelled");
  const nonCancelled = filtered.filter((r) => r.slotStatus !== "cancelled");

  const active = nonCancelled
    .filter((r) => ACTIVE_SLOT.has(r.slotStatus))
    .sort(sortSlotRowsByScheduledAsc);

  const done = nonCancelled
    .filter((r) => r.slotStatus === "completed")
    .sort(sortSlotRowsByScheduledAsc);

  const missed = nonCancelled
    .filter((r) => r.slotStatus === "missed")
    .sort(sortSlotRowsByScheduledAsc);

  const overflow = nonCancelled
    .filter((r) => r.slotStatus === "overflow")
    .sort(sortSlotRowsByScheduledAsc);

  return {
    active,
    done,
    missed,
    overflow,
    cancelledOnly: cancelledOnlyRows.sort(sortSlotRowsByScheduledAsc),
  };
}

export type NowDividerPlacement =
  | { kind: "all_past" }
  | { kind: "all_future" }
  | { kind: "split"; beforeCount: number };

/**
 * Where to insert the "Now" divider inside **Active** rows (sorted `scheduledAt ASC`).
 * Mirrors previous inline logic in `OpdSlotList` / `OpdSlotMobileList`.
 */
export function computeNowDividerPlacement(
  activeSortedAsc: SlotSessionRow[],
  nowMs: number
): NowDividerPlacement {
  if (activeSortedAsc.length === 0) {
    return { kind: "all_future" };
  }
  const idx = activeSortedAsc.findIndex(
    (r) => new Date(r.scheduledAt).getTime() >= nowMs
  );
  if (idx === -1) return { kind: "all_past" };
  if (idx === 0) return { kind: "all_future" };
  return { kind: "split", beforeCount: idx };
}

export function showActiveSlotSection(statusFilter: OpdStatusFilterValue): boolean {
  return (
    statusFilter === "all" ||
    statusFilter === "upcoming" ||
    statusFilter === "grace" ||
    statusFilter === "running_late" ||
    statusFilter === "in_consultation"
  );
}
