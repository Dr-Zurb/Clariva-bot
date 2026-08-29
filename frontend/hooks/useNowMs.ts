"use client";

import { useEffect, useState } from "react";

/**
 * Ticking wall-clock in ms. One timer per consumer, so read it high in the
 * tree and pass the value down rather than calling it per row.
 */
export function useNowMs(intervalMs = 30_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return nowMs;
}
