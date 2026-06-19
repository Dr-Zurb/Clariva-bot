import { useCallback, useRef } from "react";

/**
 * Keeps a medication's React `key` stable across the optimistic temp-id → real
 * server-id swap.
 *
 * Adding a med inserts it with a temporary id, then the create/reload reconcile
 * replaces that id with the real DB id. Because cards are keyed by `med.id`,
 * that swap remounts the card and resets its local expand/collapse state — so a
 * freshly opened card snaps shut the moment the server id arrives. Mapping the
 * real id back to the original temp id keeps the key (and the mounted instance)
 * unchanged.
 */
export function useStableMedKey() {
  // realId → stable key (the temp id the card first mounted with).
  const keyByIdRef = useRef<Map<string, string>>(new Map());

  /** Record that `realId` is the same card the user is looking at as `tempId`. */
  const linkRealId = useCallback((tempId: string, realId: string) => {
    if (!tempId || !realId || tempId === realId) return;
    const stable = keyByIdRef.current.get(tempId) ?? tempId;
    keyByIdRef.current.set(realId, stable);
  }, []);

  /** Resolve a medication id to its stable React key. */
  const stableKey = useCallback((id: string) => keyByIdRef.current.get(id) ?? id, []);

  return { stableKey, linkRealId };
}
