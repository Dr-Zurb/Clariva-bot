"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * text-D5 — per-second countdown hook for the local mirror of the
 * server-side chat-insert rate limit.
 *
 * Backend contract (migration 110 + `public.check_chat_insert_rate`):
 *   - HARD CAP per (session_id, sender_id):
 *       * 30 messages / minute (soft).
 *       * 200 messages / hour (hard).
 *
 * The Supabase client cannot distinguish "RLS rejected because
 * rate-limited" from "RLS rejected because session ended" — both arrive
 * as `error.code === '42501'`. The frontend mirrors the per-minute
 * count locally, treats rejects-while-at-cap as rate-limit, and shows
 * the dedicated UX (`'rate-limited'` send-state + countdown + toast).
 *
 * The local mirror is a UX hint, NOT a security boundary; the RLS gate
 * is the authoritative enforcer. We deliberately under-count vs the DB
 * (we only see our OWN tab's sends) so the local hint never blocks the
 * user when the server-side check would have allowed the INSERT.
 *
 * Window semantics:
 *   - `recordOwnSend(at = now)` pushes a timestamp.
 *   - On every read (and once per second via tick) we purge entries
 *     older than 60s.
 *   - `isRateLimited` is true iff the in-window count >= cap (default 30).
 *   - `cooldownSecondsRemaining` is the ceiling seconds until the
 *     OLDEST in-window timestamp falls out, i.e. when the cap can drop
 *     by one. Zero when not rate-limited.
 */
export const RATE_LIMIT_PER_MINUTE_CAP = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitCooldown {
  /** True when local in-window count has hit the cap. */
  isRateLimited: boolean;
  /** Seconds (ceiling) until the oldest in-window send expires. 0 when idle. */
  cooldownSecondsRemaining: number;
  /** Push a successful own-INSERT into the window. */
  recordOwnSend: (at?: number) => void;
  /** Push a failed INSERT into the window (mirrors what the DB would have counted). */
  recordAttempt: (at?: number) => void;
  /** Drop all entries (e.g. on session change or unmount-then-mount). */
  reset: () => void;
}

/**
 * @param cap Optional override (defaults to 30 to match the server function).
 * @param now Optional clock injection for tests.
 */
export function useRateLimitCooldown(
  cap: number = RATE_LIMIT_PER_MINUTE_CAP,
  now: () => number = Date.now,
): RateLimitCooldown {
  const timestampsRef = useRef<number[]>([]);
  const [tick, setTick] = useState(0);

  const purgeExpired = useCallback(
    (atMs: number): void => {
      const cutoff = atMs - RATE_LIMIT_WINDOW_MS;
      timestampsRef.current = timestampsRef.current.filter((t) => t > cutoff);
    },
    [],
  );

  const recordOwnSend = useCallback(
    (at?: number): void => {
      const atMs = at ?? now();
      purgeExpired(atMs);
      timestampsRef.current.push(atMs);
      setTick((n) => n + 1);
    },
    [now, purgeExpired],
  );

  // Distinct from recordOwnSend semantically: an attempt that the
  // server rejected still occupied a "slot" in the user's mental
  // model. The DB rate-check does NOT count rejected inserts (RLS
  // gates BEFORE the row is committed), so we don't push here in the
  // production wiring — kept on the API for the few call-sites that
  // want explicit local tracking of failed sends (e.g. test fixtures).
  const recordAttempt = useCallback(
    (at?: number): void => {
      const atMs = at ?? now();
      purgeExpired(atMs);
      timestampsRef.current.push(atMs);
      setTick((n) => n + 1);
    },
    [now, purgeExpired],
  );

  const reset = useCallback((): void => {
    timestampsRef.current = [];
    setTick((n) => n + 1);
  }, []);

  // Per-second tick — drives the countdown display and lets the
  // `isRateLimited` flag flip back to false as the oldest entries
  // age out. We stop ticking when the window is empty to avoid a
  // 1Hz re-render storm on idle composers.
  useEffect(() => {
    if (timestampsRef.current.length === 0) return;
    const handle = setInterval(() => {
      const atMs = now();
      const beforeLen = timestampsRef.current.length;
      purgeExpired(atMs);
      if (timestampsRef.current.length !== beforeLen) {
        setTick((n) => n + 1);
      } else {
        // Force a re-render once per second while we still have
        // entries so cooldownSecondsRemaining ticks down even when
        // no entry has actually expired this tick.
        setTick((n) => n + 1);
      }
    }, 1_000);
    return () => clearInterval(handle);
  }, [now, purgeExpired, tick]);

  const atMs = now();
  purgeExpired(atMs);
  const count = timestampsRef.current.length;
  const isRateLimited = count >= cap;
  let cooldownSecondsRemaining = 0;
  if (isRateLimited) {
    const oldest = timestampsRef.current[0];
    const msUntilFreed = RATE_LIMIT_WINDOW_MS - (atMs - oldest);
    cooldownSecondsRemaining = Math.max(1, Math.ceil(msUntilFreed / 1_000));
  }

  return {
    isRateLimited,
    cooldownSecondsRemaining,
    recordOwnSend,
    recordAttempt,
    reset,
  };
}
