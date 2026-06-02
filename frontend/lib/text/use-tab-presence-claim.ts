"use client";

/**
 * text-D2 — patient-only multi-tab kick for text consult.
 *
 * When the same patient opens a consult in two tabs, the tab with the
 * newest `chat-presence-claim` broadcast wins; older tabs flip to
 * `evicted` and show a "Take over" overlay. Doctors are never evicted
 * (multi-monitor setups).
 *
 * Uses the existing `text-presence:{sessionId}` Realtime topic so claims
 * ride alongside typing / online presence without a second channel name.
 *
 * @see task-text-D2-multi-tab-kick.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createScopedRealtimeClient } from "@/lib/supabase/scoped-client";

export interface UseTabPresenceClaimResult {
  evicted: boolean;
  takeOver: () => void;
}

const PRESENCE_CHANNEL_PREFIX = "text-presence";
const CLAIM_EVENT = "chat-presence-claim";
const TAB_ID_KEY_PREFIX = "text-tab-id";

const INERT: UseTabPresenceClaimResult = {
  evicted: false,
  takeOver: () => {},
};

export function tabIdStorageKey(sessionId: string): string {
  return `${TAB_ID_KEY_PREFIX}-${sessionId}`;
}

export interface PresenceClaimPayload {
  tab_id: string;
  claimed_at: number;
}

/** Pure claim comparison — exported for unit tests. */
export function shouldEvictOnClaim(
  selfTabId: string,
  selfClaimedAt: number,
  payload: PresenceClaimPayload,
): boolean {
  if (payload.tab_id === selfTabId) return false;
  return payload.claimed_at > selfClaimedAt;
}

function getOrCreateTabId(sessionId: string): string {
  if (typeof window === "undefined") {
    return "ssr-tab";
  }
  const key = tabIdStorageKey(sessionId);
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

/**
 * Patient-only multi-tab presence guard for text consult.
 *
 * @param sessionId   Live consult session id.
 * @param role        Caller role — only `'patient'` participates.
 * @param accessToken Scoped JWT for Realtime (patient + doctor text paths).
 * @param enabled     Pass `false` for `mode='readonly'` (no subscription).
 */
export function useTabPresenceClaim(
  sessionId: string,
  role: "doctor" | "patient",
  accessToken: string | null | undefined,
  enabled = true,
): UseTabPresenceClaimResult {
  const [evicted, setEvicted] = useState(false);
  const selfTabIdRef = useRef("");
  const selfClaimedAtRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const broadcastClaim = useCallback((claimedAt: number) => {
    const channel = channelRef.current;
    if (!channel || !selfTabIdRef.current) return;

    selfClaimedAtRef.current = claimedAt;
    void channel.send({
      type: "broadcast",
      event: CLAIM_EVENT,
      payload: { tab_id: selfTabIdRef.current, claimed_at: claimedAt },
    });
  }, []);

  const takeOver = useCallback(() => {
    const newest = Math.max(Date.now(), selfClaimedAtRef.current) + 1;
    setEvicted(false);
    broadcastClaim(newest);
  }, [broadcastClaim]);

  useEffect(() => {
    if (!enabled || role !== "patient" || !accessToken || !sessionId) {
      return;
    }

    selfTabIdRef.current = getOrCreateTabId(sessionId);
    let cancelled = false;

    let client;
    try {
      client = createScopedRealtimeClient(accessToken);
    } catch {
      return;
    }

    const topic = `${PRESENCE_CHANNEL_PREFIX}:${sessionId}`;
    const channel = client.channel(topic);
    channelRef.current = channel;

    (channel as RealtimeChannel).on(
      "broadcast" as "system",
      { event: CLAIM_EVENT },
      ({ payload }: { payload?: PresenceClaimPayload }) => {
        if (!payload || typeof payload.tab_id !== "string") return;
        if (typeof payload.claimed_at !== "number") return;
        if (
          !shouldEvictOnClaim(
            selfTabIdRef.current,
            selfClaimedAtRef.current,
            payload,
          )
        ) {
          return;
        }
        setEvicted(true);
      },
    );

    void channel.subscribe((status) => {
      if (cancelled || status !== "SUBSCRIBED") return;
      broadcastClaim(Date.now());
    });

    return () => {
      cancelled = true;
      channelRef.current = null;
      try {
        client.removeChannel(channel);
      } catch {
        // best-effort
      }
    };
  }, [accessToken, broadcastClaim, enabled, role, sessionId]);

  if (!enabled || role !== "patient" || !accessToken || !sessionId) {
    return INERT;
  }

  return { evicted, takeOver };
}
