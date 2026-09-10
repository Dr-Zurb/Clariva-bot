/**
 * Lobby presence helpers (consult-room-checkin / crc-02).
 *
 * Fresh heartbeat within LOBBY_FRESH_MS → waiting.
 * Had a lobby heartbeat that went stale → stepped_away.
 * Desk-only arrival (`patient_checked_in_at`, never a lobby ping) → unknown
 * so the doctor board can show Arrived instead of a false Stepped away (RQ6).
 * Never checked in → unknown.
 */

/** Heartbeat freshness window (CRC-D8). */
export const LOBBY_FRESH_MS = 2 * 60 * 1000;

export type LobbyPresence = 'waiting' | 'stepped_away' | 'unknown';

export function resolveLobbyPresence(input: {
  checkedInAt: string | Date | null | undefined;
  lastSeenAt: string | Date | null | undefined;
  nowMs?: number;
}): LobbyPresence {
  const nowMs = input.nowMs ?? Date.now();
  const lastSeenMs = toMs(input.lastSeenAt);
  if (lastSeenMs != null && nowMs - lastSeenMs <= LOBBY_FRESH_MS) {
    return 'waiting';
  }
  if (lastSeenMs != null && toMs(input.checkedInAt) != null) {
    return 'stepped_away';
  }
  return 'unknown';
}

function toMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
