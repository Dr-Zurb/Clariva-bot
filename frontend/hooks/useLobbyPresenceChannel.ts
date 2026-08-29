"use client";

/**
 * crc-14 — patient lobby joins `lobby-presence:{appointmentId}` and
 * broadcasts `{ appointmentId, ts }`. Failure is silent. Does not
 * replace or throttle the HMAC heartbeat (CRC4-D2).
 */

import { useEffect } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { requestLobbyPresenceToken } from "@/lib/api";
import { createScopedRealtimeClient } from "@/lib/supabase/scoped-client";
import {
  LOBBY_PRESENCE_EVENT,
  LOBBY_PRESENCE_PING_MS,
  buildLobbyPresencePayload,
  lobbyPresenceTopic,
} from "@/lib/consultation/lobby-presence";

export function useLobbyPresenceChannel(input: {
  consultationToken: string | null | undefined;
  enabled: boolean;
}): void {
  const token = input.consultationToken?.trim() ?? "";
  const enabled = input.enabled && token.length > 0;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let client: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    let pingId: number | null = null;

    void (async () => {
      try {
        const res = await requestLobbyPresenceToken(token);
        if (cancelled) return;
        const appointmentId = res.data.appointmentId;
        client = createScopedRealtimeClient(res.data.token);
        channel = client.channel(lobbyPresenceTopic(appointmentId));
        const ping = () => {
          void channel?.send({
            type: "broadcast",
            event: LOBBY_PRESENCE_EVENT,
            payload: buildLobbyPresencePayload({
              appointmentId,
              ts: Date.now(),
            }),
          });
        };
        void channel.subscribe((status) => {
          if (cancelled || status !== "SUBSCRIBED") return;
          ping();
          pingId = window.setInterval(ping, LOBBY_PRESENCE_PING_MS);
        });
      } catch {
        /* silent — heartbeat continues (CRC4-D3) */
      }
    })();

    return () => {
      cancelled = true;
      if (pingId != null) window.clearInterval(pingId);
      if (client && channel) {
        try {
          client.removeChannel(channel);
        } catch {
          /* best-effort */
        }
      }
    };
  }, [enabled, token]);
}
