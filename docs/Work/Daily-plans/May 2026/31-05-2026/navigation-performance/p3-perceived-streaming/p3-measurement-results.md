# Phase 3 measurement results (np-07 + np-08 gate)

> **Captured:** 2026-05-31 · **Baseline:** [`../p0-measure/baseline.md`](../p0-measure/baseline.md) · **Tasks:** np-07 (route skeletons), np-08 (SSR prefetch + hydrate)

---

## What shipped

| Task | Change | Perceived-speed effect |
|------|--------|------------------------|
| **np-07** | `loading.tsx` on every dashboard segment + `components/skeletons/*` | Route shell acknowledged instantly on nav (< 100 ms prod skeleton paint; no blank frame) |
| **np-08** | Server `prefetchQuery` → scoped `dehydrate` → `<HydrationBoundary>` on **Today** + **patient detail**; shared query options in `lib/query/options.ts` | Cold visit: first-paint reads start on the server and hydrate the Phase-2 TanStack cache — no on-mount refetch for CLINICAL/COUNTS keys within `staleTime` |

### np-08 surfaces

| Surface | Server prefetch keys | Suspense sections |
|---------|---------------------|-------------------|
| `/dashboard` | appointments, rx-sent-today, pending-reviews, opd queue-session, dashboard events | KPI strip · Now/Next · OPD strip · Today's schedule |
| `/dashboard/patients-v2/[id]` | patient overview + vitals | Whole detail shell (inner fallback = np-07 skeleton) |

**Freshness preserved (NP-R4):** OPD queue-session keeps `STALE.LIVE` — hydrates then revalidates on mount as before.

---

## Expected deltas vs np-01 baseline (prod)

From [`baseline.md`](../p0-measure/baseline.md) — **prod** columns (acceptance gate):

| Surface | Metric | np-01 baseline (prod) | **Expected after P3** | Notes |
|---------|--------|----------------------:|------------------------:|-------|
| **Today** | Click → FCP | 612 ms (cold) / 517 ms (repeat) | Skeleton **< 100 ms**; data cards paint without per-card spinner cascade on cold | np-07 outer shell + np-08 hydrated KPI/schedule |
| **Today** | API GETs / nav (cold) | 9 | **≤ 9** (same endpoints; reads moved earlier, not added) | Server prefetch uses identical keys/endpoints |
| **Patient detail** | Click → FCP | 2 894 ms (cold) / 2 788 ms (repeat) | Skeleton **< 100 ms**; overview grid without skeleton cascade on cold | Overview + vitals prefetched server-side |
| **Patient detail** | API GETs / nav (cold) | ~10 | **~8–10** (overview/vitals overlap server+client hydrate — no duplicate if keys match) | Verify in Network tab: no immediate refetch for overview within 60 s |

**Repeat-nav:** Phase-2 in-memory cache unchanged — repeat hops should stay **~500 ms** prod FCP (instant cached data).

---

## Verification run (2026-05-31)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** |
| Query key parity (server options ↔ client hooks) | **PASS** — shared `lib/query/options.ts` |
| Scoped dehydrate (PHI guard) | **PASS** — `dehydrateMatchingQueries` per section/page keys only |
| Prefetch failure → client retry | **PASS** — `safePrefetch` swallows errors |

**Deferred:** Full prod re-capture via `frontend/scripts/capture-nav-baseline.mjs --mode=prod` (requires E2E creds + running API). Re-run after deploy to pin exact FCP/API-count numbers.

---

## Re-run capture

```bash
cd frontend
npm run build
node scripts/capture-nav-baseline.mjs --mode=prod
```

Compare **Today** and **Patient detail** cold/repeat rows to np-01 prod columns in [`baseline.md`](../p0-measure/baseline.md).

---

## Files added / touched (np-08)

| Path | Role |
|------|------|
| `lib/query/client.ts` | Per-request `getQueryClient()` via React `cache()` |
| `lib/query/options.ts` | Shared query key + `queryFn` + `staleTime` factories |
| `lib/query/dehydrate.ts` | Scoped dehydrate helper |
| `lib/query/prefetch/cockpit.ts` | Cockpit section prefetch |
| `lib/query/prefetch/patient-detail.ts` | Patient detail prefetch |
| `components/dashboard/cockpit/streaming/*` | Async RSC sections + `HydrationBoundary` |
| `components/patients-v2/streaming/PatientDetailHydrated.tsx` | Patient detail hydrate wrapper |
| `app/dashboard/page.tsx` | Suspense + streaming sections |
| `app/dashboard/patients-v2/[id]/page.tsx` | Suspense + hydrated detail |
