# Task pf-15: Prefetch next patient's chart

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 3, Lane ζ step 1 — **S, ~3h**

---

## Task overview

When the cockpit transitions to `wrap_up` or `ended`, fire-and-forget prefetches for the next-up patient's chart data — allergies, conditions, vitals, problems — so when the auto-advance (pf-11) or manual nav (pf-08) lands the next cockpit, the chart rail is a cache hit and renders instantly.

This is the difference between "next cockpit shows skeletons for ~1s" and "next cockpit interactive ≤2s" — the success-criteria target in [plan-patient-flow-batch.md](../plan-patient-flow-batch.md).

**Estimated time:** ~3h. Hook authoring + wiring + manual cache-hit verification.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-10](./task-pf-10-next-appointment-route-hook.md) shipped.

**Source:** [plan-patient-seeing-flow.md § P5.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p52--prefetch-next-patients-chart).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A — bounded hook + obvious wiring.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/hooks/useNextAppointmentRoute.ts` (post-pf-10).
- The chart-rail data hooks: `getPatientAllergies`, `getPatientConditions`, `getPatientVitals`, `getPatientProblems` (search `frontend/lib/api/patients` or similar).
- Whichever query layer this codebase uses (React Query / SWR — match neighbours).

**Composer-OK sub-steps:** none.

**Estimated turns:** 2–3 Sonnet turns.

---

## Acceptance criteria

### Hook surface

- [ ] New file `frontend/hooks/useChartPrefetch.ts` exporting:

  ```ts
  export interface UseChartPrefetchOpts {
    patientId: string | null | undefined;
    enabled?: boolean;       // false to skip
  }
  export function useChartPrefetch(opts: UseChartPrefetchOpts): void;
  ```

- [ ] When `enabled !== false` and `patientId` is non-null, fires fire-and-forget calls to:
  - `getPatientAllergies(patientId)`
  - `getPatientConditions(patientId)`
  - `getPatientVitals(patientId)`
  - `getPatientProblems(patientId)`
  - `getPatientChartContext(patientId)` (if it exists post-batch 087 migration)
- [ ] Uses the codebase's query client `prefetchQuery` (or equivalent) — does NOT block render. Cache key: `(patientId, 'today')` or whatever convention the chart rail's actual fetch uses (match exactly so it's a cache hit, not a parallel fetch).
- [ ] Errors are swallowed silently (best-effort prefetch).
- [ ] Triggers ONCE per (patientId, mount) — uses a ref guard.

### Wiring

- [ ] In `ConsultationCockpit`, when `state ∈ {wrap_up, ended}`:
  - Resolve `next.appointmentId` via `useNextAppointmentRoute()`.
  - Resolve the next patient's `patient_id` (one extra appointment fetch may be needed; keep it cheap with a small dedicated read OR pull from the day-pipeline data if `useDoctorDayPipeline` already includes it).
  - Pass to `useChartPrefetch({ patientId, enabled: true })`.
- [ ] Walk-in next patient (`patient_id === null`): hook is no-op (`enabled` is internally `false`).

### Verification

- [ ] Manual smoke documented in PR:
  1. Open React Query devtools.
  2. End consult on patient A → cockpit transitions to ended.
  3. Verify queries for patient B (next) show as `success` (cached) within ~500 ms.
  4. Click next → cockpit re-mounts on B → chart rail renders without skeletons.

### General

- [ ] Type-check + lint clean.
- [ ] No new external dependencies.
- [ ] Verify no extra fetch fires when the same next-patient is already cached (e.g. after a cancel + recompute).

---

## Out of scope

- **Backend prefetch hints** — pure frontend.
- **Prefetching ALL upcoming patients** — just the immediate next one. Caching N patients in advance is not free in memory.
- **Cache eviction** — let React Query / SWR's defaults handle it.

---

## Files expected to touch

**New:**
- `frontend/hooks/useChartPrefetch.ts` (~80 LOC)

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~10 LOC — mount the hook)

**Deleted:** none.
**Backend / migrations:** none.

---

## Notes / open decisions

1. **Cache-key match.** The biggest failure mode is a key mismatch — prefetching `['allergies', patientId]` when the chart rail fetches `['patient', patientId, 'allergies']` doesn't help. Pin the exact key in the chart rail's source and reuse.
2. **When to fire.** `wrap_up` is earlier than `ended` (the doctor is still typing diagnosis / follow-up). Firing at `wrap_up` gives ~5–15 s of network warm-up; very high hit rate.
3. **Walk-in next patient.** Hook is a no-op. The next cockpit will still load reasonably fast — chart rail is hidden anyway when `patient_id === null` (per cockpit-1 helper `shouldShowChartRail`).
4. **Stale data.** Prefetched data may be "today old" by the time the next cockpit mounts. Acceptable — the next cockpit's hook will refetch in the background while showing the cached data immediately.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P5.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p52--prefetch-next-patients-chart)
- **Route hook:** [task-pf-10-next-appointment-route-hook.md](./task-pf-10-next-appointment-route-hook.md)
- **Chart rail data hooks:** `frontend/components/ehr/AppointmentChartRail.tsx` and its imports

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
