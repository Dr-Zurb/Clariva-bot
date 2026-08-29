/**
 * Slot All-view sections — mirrors every status chip (minus All):
 *   Incomplete → Overdue → Upcoming → Done → No show → Overflow → Cancelled
 *
 * In-consult rows live under Incomplete (chip value `in_consultation`).
 */

import type { SlotSessionRow } from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "./OpdQueueStatusFilter";
import { isOverflowRow, resolveLifecycle } from "./shared/slotAxes";

/** Sections that mirror the slot status chips (excluding All). */
export type SlotChipSectionKey =
  | "incomplete"
  | "late"
  | "upcoming"
  | "done"
  | "missed"
  | "overflow"
  | "cancelled";

export const SLOT_CHIP_SECTION_ORDER: SlotChipSectionKey[] = [
  "incomplete",
  "late",
  "upcoming",
  "done",
  "missed",
  "overflow",
  "cancelled",
];

export const SLOT_CHIP_SECTION_LABEL: Record<SlotChipSectionKey, string> = {
  incomplete: "Incomplete",
  late: "Overdue",
  upcoming: "Upcoming",
  done: "Done",
  missed: "No show",
  overflow: "Overflow",
  cancelled: "Cancelled",
};

/** Doctor-facing hints for filter chips + All section headers. */
export const SLOT_CHIP_SECTION_HINT: Record<SlotChipSectionKey, string> = {
  incomplete: "Consult started but not finished",
  late: "Slot time passed; consult not started",
  upcoming: "Slot time not started yet",
  done: "Consult completed",
  missed: "Patient didn’t attend",
  overflow:
    "Extra visit added outside the normal slot grid (e.g. after session end or via Add overflow)",
  cancelled: "Booking cancelled",
};

/** Hint for the All filter chip (not a section). */
export const SLOT_CHIP_ALL_HINT = "Every patient on this day’s board";

export function sortSlotRowsByScheduledAsc(
  a: SlotSessionRow,
  b: SlotSessionRow
): number {
  return (
    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
}

function isLateScheduled(r: SlotSessionRow): boolean {
  if (r.timing?.band === "late") return true;
  if (r.slotStatus === "running_late") return true;
  return false;
}

/**
 * Lower = higher on the board.
 * 0 incomplete(+in consult) · 1 late · 2 upcoming · 3 done · 4 missed · 5 overflow · 6 cancelled
 */
export function slotPriorityRank(r: SlotSessionRow): number {
  if (isOverflowRow(r)) return 5;

  const lifecycle = resolveLifecycle(r);
  if (lifecycle === "in_consult" || lifecycle === "incomplete") return 0;
  if (lifecycle === "completed") return 3;
  if (lifecycle === "no_show") return 4;
  if (lifecycle === "cancelled") return 6;

  if (lifecycle === "scheduled" || lifecycle == null) {
    if (lifecycle == null && r.slotStatus === "in_consultation") return 0;
    if (r.slotStatus === "completed") return 3;
    if (r.slotStatus === "missed") return 4;
    if (r.slotStatus === "cancelled") return 6;
    if (isLateScheduled(r)) return 1;
    return 2;
  }

  return 2;
}

export function sortSlotRowsByPriority(
  a: SlotSessionRow,
  b: SlotSessionRow
): number {
  const rankDelta = slotPriorityRank(a) - slotPriorityRank(b);
  if (rankDelta !== 0) return rankDelta;
  return sortSlotRowsByScheduledAsc(a, b);
}

export function orderSlotRowsFlat(rows: SlotSessionRow[]): SlotSessionRow[] {
  return [...rows].sort(sortSlotRowsByPriority);
}

export interface SlotListPartitions {
  incomplete: SlotSessionRow[];
  late: SlotSessionRow[];
  upcoming: SlotSessionRow[];
  done: SlotSessionRow[];
  missed: SlotSessionRow[];
  overflow: SlotSessionRow[];
  cancelled: SlotSessionRow[];
}

/** Split filtered rows into chip-mirrored section buckets. */
export function partitionSlotRowsForList(
  rows: SlotSessionRow[]
): SlotListPartitions {
  const ordered = orderSlotRowsFlat(rows);
  return {
    incomplete: ordered.filter((r) => slotPriorityRank(r) === 0),
    late: ordered.filter((r) => slotPriorityRank(r) === 1),
    upcoming: ordered.filter((r) => slotPriorityRank(r) === 2),
    done: ordered.filter((r) => slotPriorityRank(r) === 3),
    missed: ordered.filter((r) => slotPriorityRank(r) === 4),
    overflow: ordered.filter((r) => slotPriorityRank(r) === 5),
    cancelled: ordered.filter((r) => slotPriorityRank(r) === 6),
  };
}

export function rowsForChipSection(
  partitions: SlotListPartitions,
  section: SlotChipSectionKey
): SlotSessionRow[] {
  switch (section) {
    case "incomplete":
      return partitions.incomplete;
    case "late":
      return partitions.late;
    case "upcoming":
      return partitions.upcoming;
    case "done":
      return partitions.done;
    case "missed":
      return partitions.missed;
    case "overflow":
      return partitions.overflow;
    case "cancelled":
      return partitions.cancelled;
  }
}

/**
 * Section default-open:
 * - All: Incomplete / Overdue / Upcoming open; rest collapsed
 * - Chip filter: matching section open
 */
export function sectionDefaultOpen(
  statusFilter: OpdStatusFilterValue,
  section: SlotChipSectionKey
): boolean {
  if (statusFilter === "all") {
    return (
      section === "incomplete" ||
      section === "late" ||
      section === "upcoming"
    );
  }

  switch (section) {
    case "incomplete":
      return statusFilter === "in_consultation";
    case "late":
      return statusFilter === "running_late";
    case "upcoming":
      return statusFilter === "upcoming" || statusFilter === "grace";
    case "done":
      return statusFilter === "completed";
    case "missed":
      return statusFilter === "missed";
    case "overflow":
      return statusFilter === "overflow";
    case "cancelled":
      return statusFilter === "cancelled";
    default:
      return false;
  }
}

/**
 * On All: always render every chip section (even count 0) with collapse bars.
 * On a chip filter: only that chip's rows — UI skips the collapse bar
 * (the chip already names the bucket).
 */
export function shouldRenderChipSection(
  statusFilter: OpdStatusFilterValue,
  section: SlotChipSectionKey,
  _count: number
): boolean {
  if (statusFilter === "all") return true;
  return sectionDefaultOpen(statusFilter, section);
}
