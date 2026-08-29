/**
 * OPD slot three-axis helpers (osm-03).
 * Prefer lifecycle / timing / tags; fall back to deprecated slotStatus.
 */

import type {
  SlotSessionRow,
  SlotTag,
  VisitLifecycle,
} from "@/types/opd-doctor";
import type { OpdStatusFilterValue } from "../OpdQueueStatusFilter";

export function resolveLifecycle(entry: SlotSessionRow): VisitLifecycle | null {
  if (entry.lifecycle) return entry.lifecycle;
  switch (entry.slotStatus) {
    case "cancelled":
      return "cancelled";
    case "completed":
      return "completed";
    case "missed":
      return "no_show";
    case "in_consultation":
      return "in_consult";
    case "upcoming":
    case "grace":
    case "running_late":
    case "overflow":
      return "scheduled";
    default:
      return null;
  }
}

export function hasSlotTag(entry: SlotSessionRow, tag: SlotTag): boolean {
  if (entry.tags?.includes(tag)) return true;
  if (tag === "overflow" && entry.slotStatus === "overflow") return true;
  if (
    tag === "early_invited" &&
    entry.earlyInviteExpiresAt != null &&
    entry.earlyInviteResponse !== "declined"
  ) {
    return true;
  }
  if (tag === "delayed" && entry.delayMinutes != null && entry.delayMinutes > 0) {
    return true;
  }
  if (
    tag === "return_visit" &&
    entry.opdEventType === "return_after_completed"
  ) {
    return true;
  }
  return false;
}

export function isOverflowRow(entry: SlotSessionRow): boolean {
  return hasSlotTag(entry, "overflow");
}

/** Primary badge label from lifecycle (not timing, not overflow). */
export function lifecycleBadgeLabel(lifecycle: VisitLifecycle): string {
  switch (lifecycle) {
    case "scheduled":
      return "Scheduled";
    case "in_consult":
      return "In consult";
    case "incomplete":
      return "Incomplete";
    case "completed":
      return "Done";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No show";
    default:
      return lifecycle;
  }
}

export function lifecycleTone(lifecycle: VisitLifecycle): {
  dotClass: string;
  pillClass: string;
  rowClass: string;
} {
  switch (lifecycle) {
    case "in_consult":
      return {
        dotClass: "bg-primary",
        pillClass: "bg-primary/15 text-primary",
        rowClass:
          "border-l-4 border-l-primary bg-primary/5 ring-1 ring-inset ring-primary/20",
      };
    case "incomplete":
      return {
        dotClass: "bg-amber-500",
        pillClass:
          "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
        rowClass:
          "border-l-4 border-l-amber-500 bg-amber-50/70 ring-1 ring-inset ring-amber-500/25 dark:bg-amber-950/20",
      };
    case "completed":
      return {
        dotClass: "bg-green-600",
        pillClass:
          "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
        rowClass:
          "border-l-4 border-l-green-600/70 bg-green-50/40 dark:bg-green-950/20",
      };
    case "no_show":
      return {
        dotClass: "bg-destructive",
        pillClass: "bg-destructive/15 text-destructive",
        rowClass: "border-l-4 border-l-destructive",
      };
    case "cancelled":
      return {
        dotClass: "bg-muted-foreground/40",
        pillClass: "bg-muted text-muted-foreground",
        rowClass: "border-l-4 border-l-muted-foreground/40 opacity-70",
      };
    case "scheduled":
    default:
      return {
        dotClass: "bg-muted-foreground/50",
        pillClass: "bg-muted text-muted-foreground",
        rowClass: "border-l-4 border-l-transparent",
      };
  }
}

/**
 * Filter match using axes when present; falls back to slotStatus.
 * Old URL values (`grace`, `in_consultation`, `overflow`) keep working (OSM-D7).
 */
export function matchesSlotStatusFilter(
  entry: SlotSessionRow,
  statusFilter: OpdStatusFilterValue
): boolean {
  if (statusFilter === "all") return true;

  const lifecycle = resolveLifecycle(entry);

  if (statusFilter === "grace" || statusFilter === "upcoming") {
    if (lifecycle === "scheduled") {
      const band = entry.timing?.band;
      if (band == null) {
        return (
          entry.slotStatus === "upcoming" || entry.slotStatus === "grace"
        );
      }
      return band === "early" || band === "due";
    }
    return entry.slotStatus === "upcoming" || entry.slotStatus === "grace";
  }

  if (statusFilter === "running_late") {
    // Overdue chip = scheduled + late only. Incomplete/in-consult can also be
    // timing-late; those belong under Incomplete, not Overdue.
    if (isOverflowRow(entry)) return false;
    if (
      lifecycle === "incomplete" ||
      lifecycle === "in_consult" ||
      lifecycle === "completed" ||
      lifecycle === "no_show" ||
      lifecycle === "cancelled"
    ) {
      return false;
    }
    if (lifecycle == null && entry.slotStatus === "in_consultation") {
      return false;
    }
    if (lifecycle === "scheduled" || lifecycle == null) {
      if (entry.timing?.band === "late") return true;
      return entry.slotStatus === "running_late";
    }
    return false;
  }

  if (statusFilter === "in_consultation") {
    return (
      lifecycle === "in_consult" ||
      lifecycle === "incomplete" ||
      entry.slotStatus === "in_consultation"
    );
  }

  if (statusFilter === "completed") {
    return lifecycle === "completed" || entry.slotStatus === "completed";
  }

  if (statusFilter === "missed") {
    return lifecycle === "no_show" || entry.slotStatus === "missed";
  }

  if (statusFilter === "cancelled") {
    return lifecycle === "cancelled" || entry.slotStatus === "cancelled";
  }

  if (statusFilter === "overflow") {
    return isOverflowRow(entry);
  }

  // Queue-only filter values are ignored by the slot list.
  return false;
}
