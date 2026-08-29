/**
 * crc-17 — lobby reconnect backoff.
 *
 * Healthy cadence matches the 5s heartbeat. Failures double, but the
 * cap stays inside the 2-minute freshness window so a present patient
 * is not marked stepped-away by the retry schedule itself (CRC-D8).
 */

/** Same as the HMAC heartbeat while the tab is visible and healthy. */
export const LOBBY_RECONNECT_BASE_MS = 5_000;

/**
 * Max delay between visible-tab retries. Must stay < 120_000
 * (`LOBBY_FRESH_MS` in backend lobby-presence). 90s leaves margin for
 * the request itself.
 */
export const LOBBY_RECONNECT_MAX_MS = 90_000;

export function nextLobbyBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return LOBBY_RECONNECT_BASE_MS;
  const exp = Math.min(consecutiveFailures, 5);
  return Math.min(LOBBY_RECONNECT_BASE_MS * 2 ** exp, LOBBY_RECONNECT_MAX_MS);
}

/** Tear down the presence channel while offline so coming back remounts it. */
export function lobbyPresenceChannelEnabled(
  inLobby: boolean,
  isOnline: boolean
): boolean {
  return inLobby && isOnline;
}
