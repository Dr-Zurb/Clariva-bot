"use client";

/**
 * useChartPrefetch (task-pf-15 · P5.2)
 *
 * Fires fire-and-forget prefetch calls for a patient's chart data —
 * allergies, conditions, vitals, and problems — so that when the doctor
 * navigates to the next cockpit the chart rail is a fast render instead
 * of showing skeletons.
 *
 * # When to call
 * Mount this hook when `state ∈ {"wrap_up", "ended"}` in ConsultationCockpit.
 * The `wrap_up` transition happens ~5–15 s before the doctor actually
 * navigates, giving ample warm-up time.
 *
 * # Deduplication
 * Two guards prevent redundant fetches:
 *   1. **Module-level Set** (`prefetchedInSession`): keyed on `patientId`.
 *      Prevents re-fire when the same next-patient is computed more than
 *      once in a session (e.g. after a cancel + recompute of the next
 *      route).  Lives for the entire browser session (cleared on reload).
 *   2. **Per-instance ref** (`firedRef`): prevents a second fire if the
 *      component re-renders before the async calls complete.
 *
 * # Cache mechanism
 * This codebase does not use React Query / SWR.  All API calls use
 * `cache: "no-store"`.  The prefetch benefit is therefore:
 *   a) **Backend-side caching**: if the backend has in-memory or Redis
 *      caching for these queries (as Clariva does for read-heavy chart
 *      endpoints), hitting the endpoint once warms it for the imminent
 *      section mount.
 *   b) **DNS / TCP warm-up**: the network connection is already
 *      established, so the subsequent section-level fetches skip the
 *      handshake latency.
 *   c) **Module-level store** (`chartPrefetchStore`): a `Map` exported
 *      from this module stores the resolved payloads so that chart
 *      sections can opt-in to a cache-hit path in a future update
 *      (reading from here instead of issuing a second network call).
 *
 * # Token
 * The Clariva chart endpoints are authenticated.  `token` is required —
 * pass the same doctor JWT used everywhere else in ConsultationCockpit.
 * (The spec sketch omits it, but the codebase has no token context; all
 * neighbour hooks accept `token` as an explicit parameter.)
 *
 * # Next-patient wiring
 * `patientId` should be the NEXT patient's UUID, not the current one.
 * Resolve it via `useNextAppointmentRoute({ currentAppointmentId })`
 * once task-pf-10 ships. Until then, pass `null` — the hook is a no-op.
 *
 * @see task-pf-10-next-appointment-route-hook.md  (provider of patientId)
 * @see task-pf-07-doctor-day-pipeline-hook.md     (provider of day data)
 */

import { useEffect, useRef } from "react";
import {
  listPatientAllergies,
  listPatientConditions,
  listPatientVitals,
} from "@/lib/api";
import { listPatientProblems } from "@/lib/api/patient-chart";

// ---------------------------------------------------------------------------
// Module-level session cache
// ---------------------------------------------------------------------------

/** Max age for a cache entry before it is considered stale. */
const MAX_CACHE_AGE_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * Raw payloads stored by the prefetch.  Typed as `unknown` to avoid a
 * hard coupling to the API response shapes — callers should cast to the
 * appropriate type when consuming.
 */
export interface ChartPrefetchPayload {
  allergies: unknown;
  conditions: unknown;
  vitals: unknown;
  problems: unknown;
  fetchedAt: number;
}

/**
 * Module-level store: `patientId → payload`.
 *
 * Populated by `useChartPrefetch`; readable by chart sections so they
 * can bypass the network when a fresh entry exists.
 * Cleared on page reload (in-memory only).
 */
export const chartPrefetchStore = new Map<string, ChartPrefetchPayload>();

/**
 * Read a cached entry for a patient.  Returns `null` when absent or
 * older than {@link MAX_CACHE_AGE_MS}.
 */
export function getChartPrefetchPayload(
  patientId: string,
): ChartPrefetchPayload | null {
  const entry = chartPrefetchStore.get(patientId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MAX_CACHE_AGE_MS) {
    chartPrefetchStore.delete(patientId);
    return null;
  }
  return entry;
}

/**
 * Module-level deduplication set.
 * Tracks patientIds that have already been prefetched (or are in-flight)
 * in this browser session to prevent redundant network activity when the
 * same next-patient is computed more than once.
 */
const prefetchedInSession = new Set<string>();

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface UseChartPrefetchOpts {
  /**
   * UUID of the patient whose chart to prefetch.
   * Null / undefined → hook is a no-op.
   */
  patientId: string | null | undefined;
  /** Doctor JWT.  Required to call the authenticated chart endpoints. */
  token: string;
  /**
   * Set to `false` to suppress the prefetch.  Defaults to `true`.
   * Typical usage: `enabled: state === "wrap_up" || state === "ended"`.
   */
  enabled?: boolean;
}

/**
 * Fire-and-forget prefetch for the given patient's chart sections.
 *
 * Triggers at most ONCE per `(patientId, session)`:
 *   - A per-instance ref prevents double-fire from re-renders.
 *   - The module-level `prefetchedInSession` Set prevents duplicate
 *     fetches across re-mounts for the same patientId.
 *
 * All errors are silently swallowed — sections will refetch on their
 * own if the prefetch failed or the data is stale.
 */
export function useChartPrefetch({
  patientId,
  token,
  enabled = true,
}: UseChartPrefetchOpts): void {
  // Per-instance guard: prevents a second fire if the component
  // re-renders before all async calls have settled.
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !patientId || !token) return;

    // Session-level dedup: skip if already queued / completed.
    if (prefetchedInSession.has(patientId)) return;

    // Per-mount guard.
    if (firedRef.current) return;
    firedRef.current = true;

    // Mark immediately (before async resolution) so rapid re-renders
    // in the same tick cannot slip through a second fire.
    prefetchedInSession.add(patientId);

    const fetchedAt = Date.now();

    // Fire all four chart sections in parallel.
    // Results are stored in the module-level cache; errors are discarded.
    void Promise.allSettled([
      listPatientAllergies(token, patientId),
      listPatientConditions(token, patientId),
      listPatientVitals(token, patientId),
      listPatientProblems(token, patientId),
    ]).then(([allergies, conditions, vitals, problems]) => {
      chartPrefetchStore.set(patientId, {
        allergies:
          allergies.status === "fulfilled" ? allergies.value : null,
        conditions:
          conditions.status === "fulfilled" ? conditions.value : null,
        vitals: vitals.status === "fulfilled" ? vitals.value : null,
        problems: problems.status === "fulfilled" ? problems.value : null,
        fetchedAt,
      });
    });
  }, [enabled, patientId, token]);
}
