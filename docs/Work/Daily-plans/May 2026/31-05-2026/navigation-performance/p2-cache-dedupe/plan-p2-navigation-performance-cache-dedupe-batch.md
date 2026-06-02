# Navigation performance — Phase 2: client cache + dedupe — batch plan

> **Product plan (what + why + decision locks):** [`../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../Product%20plans/plan-navigation-performance.md) — R-QUERY-CACHE + R-DEDUPE-POLL + R-SSR-AUTH.
>
> **Builds on Phase 1 ([p1-backend-tax](../p1-backend-tax/)).** Phase 1 removed the per-request **auth** tax (floor p50 **680→484 ms**, see [`../p1-backend-tax/p1-measurement-results.md`](../p1-backend-tax/p1-measurement-results.md)). The residual ~484 ms is the **Supabase DB round-trip per query** — which this phase stops paying on re-navigation by serving from a client cache, and reduces by collapsing duplicate/redundant requests.
>
> **Encodes:** **NP-DL-4** (one cache library — **TanStack Query**, NP-Q1 locked 2026-05-31 — adopted incrementally, no flag-day rewrite of `lib/api.ts`), **NP-DL-5** (no API contract / route / surface change), **NP-DL-2** (clinical correctness — time-sensitive reads stay fresh; see NP-R4). **NP-Q6 locked:** cockpit home → patients list → patient detail → opd-today.
>
> **Cost-aware model strategy:** [`../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-navigation-performance-cache-dedupe.md`](./Tasks/EXECUTION-ORDER-p2-navigation-performance-cache-dedupe.md).

---

## The problem this phase fixes (verified in code + baseline)

With the backend auth tax gone, two frontend problems now dominate the *felt* lag (product-plan F3/F4/F5/F6, confirmed in [`../p0-measure/baseline.md`](../p0-measure/baseline.md)):

1. **No client cache — every navigation refetches from scratch.** `frontend/lib/api.ts` hard-codes `cache: "no-store"` in **80** places and there is **no SWR/TanStack Query** in source. Revisiting a page you saw five seconds ago re-pays the full ~484 ms DB round-trip per request — the baseline shows *"full refetch every time"* on repeat nav.
2. **Redundant in-flight work.** `useDashboardCounts` is mounted in **both** `DashboardShell` and `KpiStrip` → two 30 s pollers, doubled `/queue-session` + `/kpis` traffic (F4). Server-side, `dashboard/layout.tsx` validates the user and then each page re-calls `supabase.auth.getUser()` + `getSession()` (**12** call sites, F5) → ≥2 server-side auth reads per navigation.

Per the baseline, the worst offenders are the **cockpit home** (~9 GETs/nav) and **patient detail** (~10 GETs/nav with the chart waterfall) — so those lead the migration order (NP-Q6).

---

## Scope (this phase)

| Task | Title | Status |
|---|---|---|
| [np-04](./Tasks/task-np-04-query-cache-foundation.md) | Stand up the TanStack Query cache foundation (provider at the client boundary + typed query-hook pattern + key conventions) | ✅ done |
| [np-05](./Tasks/task-np-05-migrate-surfaces-and-dedupe.md) | Migrate the daily-driver surfaces onto the cache (NP-Q6 order) + collapse the duplicate counts poller (R-DEDUPE-POLL) | ✅ done |
| [np-06](./Tasks/task-np-06-ssr-auth-dedupe.md) | Validate the user **once** per navigation server-side (retire the layout-then-page `getUser()`/`getSession()` double hop) | ✅ done |

**Order (see exec-order):** np-04 (foundation) and np-06 (server-side, independent of the cache) run **in parallel** in Wave 1; np-05 migrates surfaces in Wave 2 once the foundation exists. np-04 must **not** edit the server `dashboard/layout.tsx` (it mounts the provider in the client tree) so np-06 can own that file concurrently.

**Deliverable:** revisiting a recently-seen daily-driver surface renders **instantly from cache** (revalidates behind), no duplicate in-flight identical reads, exactly one counts source, and one server-side `getUser()` per navigation — with **zero API/route/surface change** and clinical reads kept fresh.

---

## Decision locks honoured

- **NP-DL-4 — one library, incremental.** TanStack Query only (NP-Q1). Foundation lands in np-04; hot surfaces port in np-05; the remaining hand-rolled `no-store` fetches keep working untouched until a later opportunistic pass (NP-R5).
- **NP-DL-5 — no contract change.** Same endpoints, same request/response shapes, same routes. This phase changes *how often and from where* data is fetched, never *what*.
- **NP-DL-2 / NP-R4 — clinical correctness over cache hits.** Time-sensitive reads (OPD queue / `queue-session`, live-consult vitals) use **zero or near-zero `staleTime`** and are never served stale; mutations invalidate their keys. Demographics/static catalogs may cache for minutes. The per-surface policy (NP-Q4) is drafted below and finalized in np-05.

---

## NP-Q4 — per-resource staleness (draft; finalize in np-05)

`staleTime` = how long cached data is served without a background refetch. Conservative by default; clinical-live = 0.

| Surface / data | Endpoint(s) (examples) | `staleTime` | Notes |
|---|---|---|---|
| OPD queue / session | `/queue-session`, `/possible-duplicates` | **0** | Always revalidate; queue order is operationally live (NP-R4). |
| Live-consult vitals | consult vitals reads | **0** | Clinical-live; never stale. |
| Dashboard counts / KPIs | `/kpis`, counts | **~30 s** | Match the current poll cadence; single shared key (R-DEDUPE-POLL). |
| Patients list | `/patients` list | **~30–60 s** | Revalidate on focus; cheap to refresh. |
| Patient detail — clinical | `/vitals`, `/conditions`, `/allergies`, `/problems`, `/prescriptions/recent` | **~60 s** + invalidate-on-mutation | Slow-changing but clinical — short stale + always invalidate after a write. |
| Static-ish | cockpit presets, services catalog, practice info | **5 min** | Rarely changes within a session. |

**Rule:** never cache mutation responses; after a mutation, invalidate the affected read keys explicitly (TanStack `invalidateQueries`).

---

## Acceptance gate (phase)

> **Shipped 2026-05-31** — np-04/05/06 all `✅ DONE` (provider `components/providers/QueryProvider.tsx`; `hooks/queries/*`; `useDashboardCounts` on shared keys; `useLogout` cache-clear; `lib/auth/server-user.ts`). **Outstanding:** the prod-build repeat-nav measurement below was **not** captured on ship — it is folded into the **Phase 3 gate** ([`../p3-perceived-streaming/`](../p3-perceived-streaming/)), which re-measures the same surfaces. Tick these against that result.

- [ ] **Re-nav is instant from cache.** Revisiting a migrated surface within its `staleTime` renders cached data with **no spinner**, then revalidates in the background (prove against [`../p0-measure/baseline.md`](../p0-measure/baseline.md) repeat-nav rows, prod build per NP-DL-6).
- [ ] **No duplicate in-flight identical reads.** Counts fire from exactly **one** source; identical concurrent reads dedupe to one network call (Network tab shows one `/queue-session`, one `/kpis`).
- [ ] **One server-side `getUser()` per navigation** (not layout + page); auth redirects unchanged; tokens still reach client components that need them.
- [ ] **Clinical freshness preserved (NP-DL-2 / NP-R4).** OPD queue + live vitals never served stale; mutations invalidate the right keys; no write response cached.
- [ ] **No contract/route/surface change (NP-DL-5).** Endpoints, shapes, routes, and visible UI behaviour unchanged except speed.
- [ ] **Hygiene.** `npx tsc --noEmit` clean (frontend); existing tests green; no new console errors; visibility-pause behaviour on pollers preserved.

**Re-run / measure:** reuse the np-01 client nav-timing (`frontend/lib/nav-perf/nav-timing.ts`) and the baseline table; record a short Phase-2 results note (repeat-nav FCP + requests/nav before vs after) alongside this batch.

---

**Prior phase:** [`../p1-backend-tax/`](../p1-backend-tax/)
**Next phase:** Phase 3 — **promoted** → [`../p3-perceived-streaming/`](../p3-perceived-streaming/) (`loading.tsx` skeletons + server `prefetch`/`HydrationBoundary` streaming). **Note:** the < ~100 ms *cold* server floor is blocked on the DB path (Phase 1 result); a data-path **Phase 4** (NP-Q5) is the likely follow-on after Phase 3.
