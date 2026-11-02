/** Shared polling cadences (np-05). */
export const POLL_INTERVAL = {
  COUNTS: 30_000,
  COCKPIT: 60_000,
  /**
   * Queue while a visit is open. 15s is enough for a walk-in to show
   * on the next glance, without a 4s database round-trip.
   */
  COCKPIT_QUEUE: 15_000,
  /** Front-desk vitals: saved on the desk's own device mid-visit. */
  DESK_VITALS: 15_000,
} as const;

/** Pause polling while the tab is hidden (matches legacy visibility behaviour). */
export function pollingOptions(intervalMs: number) {
  return {
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  } as const;
}
