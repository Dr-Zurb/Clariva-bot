/** Shared polling cadences (np-05). */
export const POLL_INTERVAL = {
  COUNTS: 30_000,
  COCKPIT: 60_000,
} as const;

/** Pause polling while the tab is hidden (matches legacy visibility behaviour). */
export function pollingOptions(intervalMs: number) {
  return {
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  } as const;
}
