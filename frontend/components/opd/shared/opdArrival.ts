/**
 * Desk / doctor arrival (receptionist-portal RQ6).
 * Same `patient_checked_in_at` stamp the desk writes.
 *
 * Board rule: one flow word in Status. Arrival is never a second pill.
 * Slot folds it into the badge when still upcoming; otherwise a green dot.
 * Queue keeps Waiting / Called and uses the same green dot.
 */

import type { SlotSessionRow, VisitLifecycle } from "@/types/opd-doctor";
import { lifecycleBadgeLabel } from "./slotAxes";

export function hasArrivedStamp(entry: {
  patientCheckedInAt?: string | null;
}): boolean {
  return Boolean(entry.patientCheckedInAt);
}

export function canMarkArrived(entry: {
  patientCheckedInAt?: string | null;
  appointmentStatus: string;
}): boolean {
  if (hasArrivedStamp(entry)) return false;
  return (
    entry.appointmentStatus === "pending" ||
    entry.appointmentStatus === "confirmed"
  );
}

export function slotIsLate(entry: {
  timing?: { band?: string } | null;
  slotStatus?: string;
}): boolean {
  return entry.timing?.band === "late" || entry.slotStatus === "running_late";
}

export type SlotBoardStatusKind = "upcoming" | "arrived" | "overdue" | "other";

export interface SlotBoardStatus {
  label: string;
  kind: SlotBoardStatusKind;
  /** Stamped but Overdue won the word — show presence as a green dot. */
  arrivedDot: boolean;
}

/** Slot Status column: Upcoming / Arrived / Overdue, or the lifecycle word. */
export function resolveSlotBoardStatus(
  entry: Pick<
    SlotSessionRow,
    "patientCheckedInAt" | "timing" | "slotStatus"
  >,
  lifecycle: VisitLifecycle
): SlotBoardStatus {
  if (lifecycle !== "scheduled") {
    return {
      label: lifecycleBadgeLabel(lifecycle),
      kind: "other",
      arrivedDot: false,
    };
  }
  const arrived = hasArrivedStamp(entry);
  if (slotIsLate(entry)) {
    return { label: "Overdue", kind: "overdue", arrivedDot: arrived };
  }
  if (arrived) {
    return { label: "Arrived", kind: "arrived", arrivedDot: false };
  }
  return { label: "Upcoming", kind: "upcoming", arrivedDot: false };
}

/** Queue Waiting / Called + desk stamp → green dot, not an Arrived pill. */
export function showQueueArrivedDot(entry: {
  patientCheckedInAt?: string | null;
  queueStatus: string;
}): boolean {
  if (!hasArrivedStamp(entry)) return false;
  return entry.queueStatus === "waiting" || entry.queueStatus === "called";
}

export type LobbyPresence = "in_lobby" | "stepped_away";

export function lobbyPresence(tags?: ReadonlyArray<string>): LobbyPresence | null {
  const list = tags ?? [];
  if (list.includes("patient_waiting")) return "in_lobby";
  if (list.includes("patient_stepped_away")) return "stepped_away";
  return null;
}

/** Hide In lobby next to Arrived / Overdue — presence is already the badge or dot. */
export function showSlotLobbyPresence(
  kind: SlotBoardStatusKind,
  tags?: ReadonlyArray<string>
): LobbyPresence | null {
  const presence = lobbyPresence(tags);
  if (presence === "in_lobby" && (kind === "arrived" || kind === "overdue")) {
    return null;
  }
  return presence;
}

/** Hide In lobby next to queue Waiting — same word, different meaning. */
export function showQueueLobbyPresence(
  queueStatus: string,
  tags?: ReadonlyArray<string>
): LobbyPresence | null {
  const presence = lobbyPresence(tags);
  if (presence === "in_lobby" && queueStatus === "waiting") return null;
  return presence;
}
