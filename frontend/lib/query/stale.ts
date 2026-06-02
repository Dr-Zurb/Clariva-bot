/**
 * NP-Q4 staleness defaults for TanStack Query (np-04).
 *
 * Per-surface overrides in np-05 should reference these constants so policy
 * stays explicit and reviewable. Global QueryClient default uses LIVE (0).
 */
export const STALE = {
  /** Operationally live reads (OPD queue, live-consult vitals). Never serve stale. */
  LIVE: 0,
  /** Dashboard counts / KPIs — matches the current ~30 s poll cadence. */
  COUNTS: 30_000,
  /** Slow-changing clinical reads (patient chart sections). Pair with invalidate-on-mutation. */
  CLINICAL: 60_000,
  /** Static-ish catalogs (presets, services, practice info). */
  STATIC: 300_000,
} as const;

export type StalePreset = (typeof STALE)[keyof typeof STALE];
