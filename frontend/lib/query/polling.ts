/** Shared polling cadences (np-05). */
export const POLL_INTERVAL = {
  COUNTS: 30_000,
  COCKPIT: 60_000,
  /**
   * Queue while a visit is open. A walk-in added at the desk should
   * land on the next chip before the doctor looks up from the last token.
   */
  COCKPIT_QUEUE: 4_000,
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
