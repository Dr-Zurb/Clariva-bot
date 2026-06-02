# Navigation performance — Phase 3: perceived speed + streaming — batch plan

> **Product plan (what + why + decision locks):** [`../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../Product%20plans/plan-navigation-performance.md) — R-LOADING-SKELETONS + R-SERVER-FETCH.
>
> **Builds on Phase 2 ([p2-cache-dedupe](../p2-cache-dedupe/)).** Phase 2 made **repeat** navigation instant (TanStack Query cache). Phase 3 fixes the **cold / first-visit** path that the cache can't help: the click is still acknowledged by a blank pane, and heavy pages still assemble in visible stages on a cache miss. This phase makes the click feel instant (skeletons) and streams first paint from the server **into** the Phase-2 cache.
>
> **Encodes:** **NP-DL-5** (no API/route/surface change), **NP-DL-6** (prove wins in a **prod** build — dev compile inflates these numbers most, per F8/baseline), **NP-R7** (skeletons mirror the final layout to avoid layout shift). **Also closes the Phase-2 measurement gap** (no `p2-measurement-results.md` was recorded — see the gate).
>
> **Cost-aware model strategy:** [`../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-navigation-performance-perceived-streaming.md`](./Tasks/EXECUTION-ORDER-p3-navigation-performance-perceived-streaming.md).

---

## The problem this phase fixes (verified in code + baseline)

Phase 2 cached the data, but two *perceived*-speed problems remain (product-plan F6/F7, confirmed against the running app):

1. **Almost no route skeletons (F7).** Only `frontend/app/dashboard/appointments/[id]/loading.tsx` exists — **every other dashboard segment** (today, opd-today, patients-v2, patients-v2/[id], booking-review, insights, alerts, appointments, consult, settings/*) paints **blank** until its data lands. On a cold hop the click feels unacknowledged even though Phase 1 made the backend fast.
2. **Cold-visit client waterfalls on heavy pages (F6).** The heaviest surfaces (patient detail ~10 GETs, cockpit home ~9 GETs in the baseline) now use client query hooks, but on a **cache miss** they still fetch *after* the component mounts → the page assembles in stages. Server-streaming the first paint removes that staged assembly.

Phase 2 fixed "data you just saw"; Phase 3 fixes "the click feels instant **and** the first paint arrives in one pass".

---

## Scope (this phase)

| Task | Title | Status |
|---|---|---|
| [np-07](./Tasks/task-np-07-loading-skeletons.md) | Add `loading.tsx` skeletons to every dashboard route segment (mirror final layout; instant nav acknowledgement) | ✅ done |
| [np-08](./Tasks/task-np-08-server-stream-heavy-pages.md) | Server-stream first paint on the heavy pages — `prefetchQuery` + `dehydrate` + `<HydrationBoundary>` into the Phase-2 cache + Suspense | ✅ done |

**Order (see exec-order):** np-07 (Wave 1, ~1d) ships the broad perceived-speed win and provides the route-level fallbacks; np-08 (Wave 2, the deep one) streams the heavy pages and pairs its inner `<Suspense>` boundaries with np-07's skeletons.

**Deliverable:** every dashboard route paints a skeleton **< 100 ms** after click; patient detail and cockpit home stream their first paint in **one pass** (no per-card spinner cascade) on a cold visit; the streamed data **hydrates the existing client cache without an immediate refetch**; repeat-nav stays instant (no Phase-2 regression); **zero API/route/surface change**.

---

## Decision locks honoured

- **NP-DL-5 — no contract change.** Same endpoints/shapes/routes. Skeletons are static UI; streaming re-homes *where/when* the first read happens, never *what* it returns.
- **NP-DL-6 — prove in prod.** `next build && next start`; dev compile + Strict-Mode inflate these numbers the most (F8) — use prod for acceptance, dev only for smoke.
- **NP-R7 — no layout shift.** Skeletons are built from the real layout (same containers/spacing) and checked at common widths.
- **NP-DL-2 / NP-R4 — clinical freshness preserved.** Server-streamed reads still respect the per-surface `staleTime` set in Phase 2; live reads (OPD queue, consult vitals) still revalidate after hydration — streaming seeds the cache, it doesn't freeze it.

---

## np-08 approach (informed by Phase 2 — important)

The heavy pages already run on **TanStack Query (client)** and `frontend/components/providers/QueryProvider.tsx` has **no SSR hydration**. So R-SERVER-FETCH is **not** a server-component rewrite that bypasses the cache — it is:

1. Server `prefetchQuery` of the page's first-paint reads (parallel), using the **same query keys** the client hooks use.
2. `dehydrate` that server cache and wrap the page in `<HydrationBoundary state={…}>` so the client hydrates **without** refetching on mount.
3. Wrap independent regions in `<Suspense>` (fallbacks = np-07 skeletons) so the HTML streams progressively.

This keeps Phase 2's cache as the single source of truth and avoids a double-fetch.

---

## Acceptance gate (phase)

- [x] **Instant acknowledgement.** Every dashboard route paints a skeleton **< 100 ms** after click in a prod build (NP-DL-6); skeletons match final layout (no CLS, NP-R7).
- [x] **Streamed first paint.** Patient detail + cockpit home show core data in **one streamed pass** on a cold visit — no per-card spinner cascade.
- [x] **No double-fetch.** Server-streamed data hydrates the client cache; client hooks do **not** immediately refetch (Network shows no duplicate on first paint) — query keys match between server prefetch and client hooks.
- [x] **No Phase-2 regression.** Repeat-nav to a migrated surface is still instant from cache; clinical-live reads still revalidate.
- [x] **No contract/route/surface change (NP-DL-5).**
- [x] **Measurement recorded (closes Phase-2 gap too).** A short `p3-measurement-results.md` captures, in a prod build: cold first-paint FCP + requests/nav for patient detail & cockpit (before/after np-08), skeleton-ack time, **and** the deferred Phase-2 repeat-nav before/after — vs [`../p0-measure/baseline.md`](../p0-measure/baseline.md). Closes NP-DL-1/NP-DL-6 for Phases 2–3.
- [x] **Hygiene.** `npx tsc --noEmit` clean; existing tests green; no new console/hydration errors.

---

**Prior phase:** [`../p2-cache-dedupe/`](../p2-cache-dedupe/)
**Next:** Phase 4 shipped. Remaining North-star gap on trivial GET (~450 ms) is **infra** (co-locate API with Supabase). Out-of-plan axes: NP-D2 (bundle-size), NP-D3 (edge/ISR). np-11 (direct-PG) **NO-GO** per NP-Q7.
