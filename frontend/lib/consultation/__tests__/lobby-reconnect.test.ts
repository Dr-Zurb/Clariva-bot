import { describe, expect, it } from "vitest";
import {
  LOBBY_RECONNECT_BASE_MS,
  LOBBY_RECONNECT_MAX_MS,
  lobbyPresenceChannelEnabled,
  nextLobbyBackoffMs,
} from "@/lib/consultation/lobby-reconnect";

/** Mirror of backend `LOBBY_FRESH_MS` — do not import the backend util here. */
const LOBBY_FRESH_MS = 2 * 60 * 1000;

describe("nextLobbyBackoffMs (crc-17)", () => {
  it("uses the 5s heartbeat cadence when healthy", () => {
    expect(nextLobbyBackoffMs(0)).toBe(LOBBY_RECONNECT_BASE_MS);
    expect(nextLobbyBackoffMs(-1)).toBe(LOBBY_RECONNECT_BASE_MS);
  });

  it("doubles on consecutive failures and caps inside the 2-minute freshness window", () => {
    expect(nextLobbyBackoffMs(1)).toBe(10_000);
    expect(nextLobbyBackoffMs(2)).toBe(20_000);
    expect(nextLobbyBackoffMs(3)).toBe(40_000);
    expect(nextLobbyBackoffMs(4)).toBe(80_000);
    expect(nextLobbyBackoffMs(5)).toBe(LOBBY_RECONNECT_MAX_MS);
    expect(nextLobbyBackoffMs(12)).toBe(LOBBY_RECONNECT_MAX_MS);
    expect(LOBBY_RECONNECT_MAX_MS).toBeLessThan(LOBBY_FRESH_MS);
    for (let n = 0; n < 20; n += 1) {
      expect(nextLobbyBackoffMs(n)).toBeLessThan(LOBBY_FRESH_MS);
      expect(nextLobbyBackoffMs(n)).toBeLessThanOrEqual(LOBBY_RECONNECT_MAX_MS);
    }
  });
});

describe("lobbyPresenceChannelEnabled (crc-17)", () => {
  it("stays subscribed only while in the lobby and online so offline tears the channel down", () => {
    expect(lobbyPresenceChannelEnabled(true, true)).toBe(true);
    expect(lobbyPresenceChannelEnabled(true, false)).toBe(false);
    expect(lobbyPresenceChannelEnabled(false, true)).toBe(false);
  });
});
