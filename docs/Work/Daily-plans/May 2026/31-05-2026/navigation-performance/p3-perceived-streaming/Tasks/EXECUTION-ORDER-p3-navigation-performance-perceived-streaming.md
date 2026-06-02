# Navigation performance — Phase 3 (perceived speed + streaming) — execution order

> Sibling document of [`plan-p3-navigation-performance-perceived-streaming-batch.md`](../plan-p3-navigation-performance-perceived-streaming-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (2 waves)

```
Wave 1 (Instant nav acknowledgement — ~1d, single lane):
  Lane α  ──── np-07 (M, Sonnet 4.6)   loading.tsx skeletons, all dashboard segments
        ⇣ (route-level fallbacks exist; inner Suspense pairs with them)
Wave 2 (Server-streamed first paint — ~3–5d, single lane):
  Lane α  ──── np-08 (L, Sonnet 4.6)   server prefetch + dehydrate/HydrationBoundary + Suspense on heavy pages
                                       (patient detail establishes the pattern → cockpit home reuses it)
```

**Total wall-clock:** ~4–6d.
**Total agent-time (sequential equivalent):** ~4–6d.

---

## Why this shape (§5 lane gate)

- **Sequential, not parallel.** np-07 (one `loading.tsx` per segment) and np-08 (server streaming on heavy `page.tsx`) touch *different files* but the **same route segments**, and Suspense streaming uses the route-level `loading.tsx` as its outer fallback — a real design coupling, not phantom. Per the guide's bias-to-sequential, np-07 ships first (broad, shallow, high ROI) and gives np-08 its fallbacks. The §5 lane gate's "independent lanes" test fails on the shared-segment coupling, so we stay single-lane.
- **np-08 is internally ordered:** patient detail first (it establishes the server-prefetch + `HydrationBoundary` + key-matching pattern), then cockpit home reuses it. **If np-08 runs long, split into np-08 (patient detail) + np-09 (cockpit home)** — same pattern, second surface.
- **Dependencies:** np-08 needs the Phase-2 cache + shared query keys (np-04/05, **shipped**), the server auth util `lib/auth/server-user.ts` (np-06, **shipped**), and np-07's route fallbacks.

---

## Lane-by-lane details

### Wave 1 — Instant nav acknowledgement (single lane)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | np-07 | M | Sonnet 4.6 | `frontend/app/dashboard/**/page.tsx` (segment inventory), `frontend/app/dashboard/appointments/[id]/loading.tsx` (the one existing example), any existing skeleton/Skeleton components | ✅ One `loading.tsx` per segment, **mirroring the final layout** (NP-R7). Daily drivers first; deep `settings/practice-setup/*` may share a section-level skeleton. No data fetching in `loading.tsx`. |

### Wave 2 — Server-streamed first paint (single lane)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | np-08 | L | Sonnet 4.6 | `frontend/components/providers/QueryProvider.tsx`, `frontend/lib/query/*` (keys + `stale`), `frontend/hooks/queries/*` (the keys to match), `frontend/lib/auth/server-user.ts`, `frontend/app/dashboard/patients-v2/[id]/page.tsx`, cockpit home page + cards | ✅ Server `prefetchQuery` (same keys) → `dehydrate` → `<HydrationBoundary>`; inner `<Suspense>` streams sections. **No double-fetch** (keys must match client hooks). Patient detail → cockpit. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| np-07 | M | Sonnet 4.6 | Broad-but-shallow UI scaffolding (skeletons). No data/security logic; the only craft is layout-fidelity (NP-R7). |
| np-08 | L | Sonnet 4.6 | Non-trivial SSR-hydration wiring, but uses existing endpoints + existing query keys + the shipped server-user util. No new auth/PHI logic — the care is *matching keys* and *scoping dehydration* (spec'd in the task). |

**Caps respected:** 0 Opus tasks this phase; ≤ 1 Opus/wave, ≤ 2/batch.

---

## Acceptance gates per wave

### Wave 1 gate
- [x] Every targeted dashboard segment has a `loading.tsx`; in a prod build the skeleton paints **< 100 ms** after click; skeletons match final layout (no CLS); `npx tsc --noEmit` clean.

### Wave 2 gate
- [x] Patient detail + cockpit home stream first paint in one pass (no per-card spinner cascade) on a cold visit; client hydrates **without** an immediate refetch (keys match); clinical-live reads still revalidate; repeat-nav unchanged; `tsc` clean.
- [x] **Phase gate (batch plan):** all boxes in the batch-plan acceptance gate ticked, including the `p3-measurement-results.md` that also records the deferred Phase-2 repeat-nav numbers.

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 — skeletons | np-07 | 1 | 0 | ~1d |
| 2 — streaming | np-08 (may split np-08/np-09) | 1–2 | 0 | ~3–5d |

---

## References

- Plan: [`plan-p3-navigation-performance-perceived-streaming-batch.md`](../plan-p3-navigation-performance-perceived-streaming-batch.md)
- Product plan: [`../../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../../Product%20plans/plan-navigation-performance.md)
- Model strategy: [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- Prior phase: [`../../p2-cache-dedupe/`](../../p2-cache-dedupe/) · baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md)
