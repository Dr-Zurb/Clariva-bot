/**
 * crc-15 — doctor-board overlay over crc-14's per-appointment topics.
 *
 * Realtime is optimistic. Server-derived tags from the 30s poll win on
 * every refresh (CRC4-D2). Do not expire overlay with a client timer —
 * that would drift from `resolveLobbyPresence` (CRC-D8).
 *
 * crc-14 topics are appointment-scoped (`lobby-presence:{id}`), so a
 * full day cannot share one doctor channel. Cap concurrent subscriptions
 * to the soonest-scheduled rows currently loaded for the viewed date.
 */

import type { SlotTag } from "@/types/opd-doctor";

/** Max simultaneous Realtime channels on the OPD board (crc-15 AC 4). */
export const LOBBY_PRESENCE_BOARD_MAX_CHANNELS = 40;

export function pickLobbyPresenceSubscriptionIds(
  rows: ReadonlyArray<{ appointmentId: string; scheduledAt: string }>,
  cap = LOBBY_PRESENCE_BOARD_MAX_CHANNELS
): string[] {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)
  );
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    const id = row.appointmentId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= cap) break;
  }
  return ids;
}

/**
 * Add `patient_waiting` for overlay ids. Does not invent stepped-away
 * (that stays a server freshness rule). A ping while the poll still
 * says stepped-away is treated as "they're back".
 */
export function applyLobbyPresenceOverlay<
  T extends { appointmentId: string; tags?: SlotTag[] },
>(rows: readonly T[], overlayWaitingIds: ReadonlySet<string>): T[] {
  if (overlayWaitingIds.size === 0) return rows as T[];
  let changed = false;
  const next = rows.map((row) => {
    if (!overlayWaitingIds.has(row.appointmentId)) return row;
    const tags = row.tags ?? [];
    if (tags.includes("patient_waiting")) return row;
    changed = true;
    const withoutAway = tags.filter((t) => t !== "patient_stepped_away");
    return { ...row, tags: [...withoutAway, "patient_waiting"] };
  });
  return changed ? next : (rows as T[]);
}
