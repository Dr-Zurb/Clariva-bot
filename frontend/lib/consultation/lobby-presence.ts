/**
 * crc-14 — lobby Realtime presence contract.
 *
 * crc-15 imports this. Doctor board subscribes with the authenticated
 * browser Supabase client; patients publish via `useLobbyPresenceChannel`.
 *
 * Broadcast only. Not postgres_changes. Not `appointments` on
 * `supabase_realtime`.
 */

export const LOBBY_PRESENCE_CHANNEL_PREFIX = "lobby-presence";
export const LOBBY_PRESENCE_EVENT = "lobby-presence";
/** Same cadence as the HMAC heartbeat — additive ping, not a replacement. */
export const LOBBY_PRESENCE_PING_MS = 5_000;

export interface LobbyPresencePayload {
  appointmentId: string;
  ts: number;
}

export function lobbyPresenceTopic(appointmentId: string): string {
  return `${LOBBY_PRESENCE_CHANNEL_PREFIX}:${appointmentId.trim()}`;
}

const PHI_KEYS = [
  "name",
  "fullName",
  "patientName",
  "phone",
  "phoneNumber",
  "dob",
  "dateOfBirth",
  "email",
  "token",
  "complaint",
  "notes",
] as const;

/**
 * Keep appointment id + timestamp only. Extra keys (including PHI / HMAC)
 * are dropped so a sloppy caller cannot put them on the wire (CRC4-D7).
 */
export function buildLobbyPresencePayload(input: {
  appointmentId: string;
  ts: number;
}): LobbyPresencePayload {
  return {
    appointmentId: input.appointmentId,
    ts: input.ts,
  };
}

export function isLobbyPresencePayload(
  value: unknown
): value is LobbyPresencePayload {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.appointmentId !== "string" || !rec.appointmentId.trim()) {
    return false;
  }
  if (typeof rec.ts !== "number" || !Number.isFinite(rec.ts)) return false;
  for (const key of PHI_KEYS) {
    if (key in rec) return false;
  }
  const keys = Object.keys(rec);
  return (
    keys.length === 2 && keys.includes("appointmentId") && keys.includes("ts")
  );
}
