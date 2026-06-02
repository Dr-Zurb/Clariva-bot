"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createScopedRealtimeClient } from "@/lib/supabase/scoped-client";
import {
  CONNECTION_QUALITY_LABEL,
  deriveConnectionQualityTier,
  type ConnectionQualityTier,
} from "@/lib/text/chat-quality-utils";

const POLL_INTERVAL_MS = 30_000;
const LOOKBACK_MS = 5 * 60 * 1000;
const SAMPLE_LIMIT = 10;

interface QualityRow {
  roundtrip_p95_ms: number | null;
  realtime_reconnects: number;
  presence_flaps: number;
  sample_at: string;
}

export interface ConnectionQualityBadgeProps {
  sessionId: string;
  accessToken: string;
  currentUserRole: "doctor" | "patient";
  mode?: "live" | "readonly";
}

const TIER_CLASS: Record<ConnectionQualityTier, string> = {
  excellent: "bg-green-100 text-green-800",
  fair: "bg-amber-100 text-amber-800",
  poor: "bg-red-100 text-red-800",
};

const TIER_DOT: Record<ConnectionQualityTier, string> = {
  excellent: "bg-green-500",
  fair: "bg-amber-500",
  poor: "bg-red-500",
};

async function fetchRecentSample(
  client: SupabaseClient,
  sessionId: string,
): Promise<ConnectionQualityTier | null> {
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data, error } = await client
    .from("text_chat_quality")
    .select("roundtrip_p95_ms, realtime_reconnects, presence_flaps, sample_at")
    .eq("session_id", sessionId)
    .gt("sample_at", since)
    .order("sample_at", { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (error || !data?.length) return null;
  const latest = data[0] as QualityRow;
  return deriveConnectionQualityTier(latest);
}

/**
 * Doctor-only live connection quality pill (task-text-D4).
 */
export function ConnectionQualityBadge({
  sessionId,
  accessToken,
  currentUserRole,
  mode = "live",
}: ConnectionQualityBadgeProps) {
  const [tier, setTier] = useState<ConnectionQualityTier | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken.trim()) return;
    const client = createScopedRealtimeClient(accessToken);
    const next = await fetchRecentSample(client, sessionId);
    setTier(next);
  }, [accessToken, sessionId]);

  useEffect(() => {
    if (currentUserRole !== "doctor" || mode === "readonly") return undefined;
    void refresh();

    let channel: RealtimeChannel | null = null;
    const pollTimer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    try {
      const client = createScopedRealtimeClient(accessToken);
      channel = client
        .channel(`text-chat-quality:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "text_chat_quality",
            filter: `session_id=eq.${sessionId}`,
          },
          () => {
            void refresh();
          },
        )
        .subscribe();
    } catch {
      // Realtime optional — 30s poll covers badge updates.
    }

    return () => {
      clearInterval(pollTimer);
      if (channel) {
        try {
          void channel.unsubscribe();
        } catch {
          // best-effort
        }
      }
    };
  }, [accessToken, currentUserRole, mode, refresh, sessionId]);

  if (currentUserRole !== "doctor" || mode === "readonly" || tier == null) {
    return null;
  }

  const label = CONNECTION_QUALITY_LABEL[tier];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TIER_CLASS[tier]}`}
      role="status"
      aria-live="polite"
      data-testid="connection-quality-badge"
      data-tier={tier}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${TIER_DOT[tier]}`} aria-hidden />
      {label}
    </span>
  );
}
