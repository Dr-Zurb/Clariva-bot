"use client";

/**
 * crc-15 — doctor OPD board subscribes to `lobby-presence:{appointmentId}`.
 *
 * Uses the authenticated browser Supabase client (doctors are real auth
 * users). Failure is silent. Does not replace the 30s poll (CRC4-D3).
 */

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  LOBBY_PRESENCE_EVENT,
  isLobbyPresencePayload,
  lobbyPresenceTopic,
} from "@/lib/consultation/lobby-presence";

export function useLobbyPresenceBoard(input: {
  appointmentIds: readonly string[];
  /** Changes when the poll snapshot lands — overlay clears so poll tags win. */
  pollGeneration: string | number | null;
  enabled?: boolean;
}): ReadonlySet<string> {
  const enabled = input.enabled !== false;
  const idsKey = input.appointmentIds.join("\0");
  const [waitingIds, setWaitingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  useEffect(() => {
    setWaitingIds(new Set());
  }, [input.pollGeneration]);

  useEffect(() => {
    if (!enabled || !idsKey) {
      setWaitingIds(new Set());
      return;
    }

    const ids = idsKey.split("\0").filter(Boolean);
    let cancelled = false;
    let client: ReturnType<typeof createClient> | null = null;
    const channels: RealtimeChannel[] = [];

    try {
      client = createClient();
    } catch {
      return;
    }

    const allowed = new Set(ids);
    for (const appointmentId of ids) {
      try {
        const channel = client.channel(lobbyPresenceTopic(appointmentId));
        channel.on(
          "broadcast",
          { event: LOBBY_PRESENCE_EVENT },
          ({ payload }: { payload?: unknown }) => {
            if (cancelled) return;
            if (!isLobbyPresencePayload(payload)) return;
            if (!allowed.has(payload.appointmentId)) return;
            setWaitingIds((prev) => {
              if (prev.has(payload.appointmentId)) return prev;
              const next = new Set(prev);
              next.add(payload.appointmentId);
              return next;
            });
          }
        );
        void channel.subscribe();
        channels.push(channel);
      } catch {
        /* silent — poll remains (CRC4-D3) */
      }
    }

    return () => {
      cancelled = true;
      for (const channel of channels) {
        try {
          if (client) void client.removeChannel(channel);
        } catch {
          /* best-effort */
        }
      }
    };
  }, [enabled, idsKey]);

  return waitingIds;
}
