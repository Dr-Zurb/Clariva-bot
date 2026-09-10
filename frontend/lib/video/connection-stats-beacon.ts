/**
 * Compact connection-stats payload sent over a Twilio DataTrack so
 * each side can show the other's real uplink (RTT, loss, encoder
 * limit) instead of guessing from local receive-side figures.
 */

export const CONNECTION_STATS_TRACK_NAME = "ha-connection-stats";
export const CONNECTION_STATS_STALE_MS = 6_000;

export interface ConnectionStatsBeacon {
  v: 1;
  t: number;
  level: number | null;
  rttMs: number | null;
  jitterMs: number | null;
  lossPct: number | null;
  res: { w: number; h: number } | null;
  fps: number | null;
  kbps: number | null;
  limit: string | null;
}

export function isConnectionStatsBeacon(
  value: unknown,
): value is ConnectionStatsBeacon {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.v === 1 && typeof row.t === "number" && Number.isFinite(row.t);
}

export function parseConnectionStatsBeacon(
  data: string | ArrayBuffer,
): ConnectionStatsBeacon | null {
  const text =
    typeof data === "string"
      ? data
      : new TextDecoder().decode(data);
  if (!text.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isConnectionStatsBeacon(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isConnectionStatsStale(
  beacon: ConnectionStatsBeacon | null,
  nowMs = Date.now(),
): boolean {
  if (!beacon) return true;
  return nowMs - beacon.t > CONNECTION_STATS_STALE_MS;
}
