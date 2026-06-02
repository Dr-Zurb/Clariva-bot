# Navigation performance — Phase 0 baseline (np-01)

> **Captured:** 2026-05-31 · **Reference:** [`task-np-01-baseline-instrumentation.md`](./Tasks/task-np-01-baseline-instrumentation.md) · **Product plan:** [`../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../Product%20plans/plan-navigation-performance.md) (R-MEASURE)
>
> **Re-run:** `frontend/scripts/capture-nav-baseline.mjs` (see script header). Raw JSON: [`capture-dev.json`](./capture-dev.json), [`capture-prod.json`](./capture-prod.json).

---

## Metrics (pinned)

| # | Metric | Source | Notes |
|---|--------|--------|-------|
| 1 | Authenticated-request floor (p50 / p95 `durationMs`) | Backend request logger (`backend/src/middleware/request-logger.ts`) | Per GET during one navigation window; PHI-free (path + duration only). |
| 2 | Requests-per-navigation | Browser Network / `[nav-perf]` `api_request_count` | Count of `/api/v1/` GETs between click and route FCP. |
| 3 | Click → route first-contentful-paint | `frontend/lib/nav-perf/nav-timing.ts` (`NavPerfTracker`) | Sidebar click → double-rAF paint on destination route. |

---

## Perf budget (North-star — Phases 1–3 gate)

From [`plan-navigation-performance.md`](../../../../../Product%20plans/plan-navigation-performance.md):

| Target | Budget | Today (baseline) |
|--------|--------|------------------|
| Authenticated trivial GET floor | **< ~100 ms** | **~600–900 ms** (p50 ~680 ms, p95 ~1.5 s) |
| Re-nav to recently-seen page | **Instant (cached)** | Full refetch every time |
| Route shell / skeleton ack | **< 100 ms** | Often blank until data lands |
| Duplicate in-flight identical reads | **0** | Yes (e.g. doubled counts poll) |

Constants exported in code: `NAV_PERF_BUDGET` in `frontend/lib/nav-perf/nav-timing.ts`.

---

## Baseline table — daily-driver surfaces

**Cold** = first hop to surface after starting from another tab. **Repeat** = revisit within the same session.

Backend `durationMs` rows are from backend logs during the capture window (2026-05-31, E2E doctor account). Client FCP from Playwright + `NavPerfTracker`; prod = `next build && next start` on `:3004`, dev = `next dev` on `:3000`.

| Surface | Route | | Backend p50 / p95 `durationMs` | API GETs / nav | Click → FCP |
|---------|-------|---|-------------------------------:|---------------:|------------:|
| | | | **dev** | **prod** | **dev** | **prod** | **dev** | **prod** |
| **Today** | `/dashboard` | cold | 680 / 1 280 | 680 / 1 280 | 12 | 9 | 3 473 | 612 |
| | | repeat | 650 / 1 100 | 650 / 1 100 | 12 | 9 | 1 912 | 517 |
| **OPD** | `/dashboard/opd-today` | cold | 720 / 1 520 | 720 / 1 520 | 7 | 2 | 48 | 44 |
| | | repeat | 700 / 1 400 | 700 / 1 400 | 7 | 2 | 1 916 | 517 |
| **Patients list** | `/dashboard/patients-v2` | cold | 620 / 1 050 | 620 / 1 050 | 6 | 4 | 1 764 | 533 |
| | | repeat | 600 / 980 | 600 / 980 | 6 | 4 | 796 | 531 |
| **Patient detail** | `/dashboard/patients-v2/[id]` | cold | 900 / 2 530 | 900 / 2 530 | 11 | ~10 | ~3 200* | 2 894 |
| | | repeat | 880 / 2 400 | 880 / 2 400 | 10 | ~10 | ~3 100* | 2 788 |

\*Dev patient-detail FCP includes on-demand compile + Strict-Mode double-effects; measured via wall-clock in capture script when client tracker not yet hydrated (same order of magnitude as prod × compile inflation).

**Backend sample (Today cold, dev log excerpt):** `/kpis` 439 ms, `/queue-session` 634 ms, `/` 602–1 076 ms, `/cockpit-presets` 631 ms, `/possible-duplicates` 1 023 ms — consistent with product-plan finding F1/F2 (~600–900 ms floor before business logic).

**Patient detail backend sample:** patient GET ~1 304 ms, `/overview` ~2 531–2 599 ms (client waterfall of chart tabs).

---

## Dev vs prod deltas (NP-DL-6 / F8)

| Effect | Dev (`next dev`) | Prod (`next start`) | Impact on baseline |
|--------|------------------|---------------------|-------------------|
| On-demand compile | Yes — first hop to a route compiles (e.g. Today cold **3.5 s** FCP) | Pre-built chunks | **Do not** credit Phase 1–3 wins using dev-only Today numbers |
| React Strict Mode | Double-invokes effects → duplicate fetches | Single invoke | Inflates dev API counts and repeat-nav times |
| `<Link>` prefetch | Limited in dev | Active in prod | Prod sidebar hops **~500 ms** FCP vs multi-second dev spikes |
| Backend auth tax | Same | Same | `durationMs` comparable across builds — backend is the shared floor |

**Rule for later phases:** prove wins against **prod** columns; use dev only for regression smoke, not acceptance.

---

## Instrumentation added (measurement-only)

| File | Role |
|------|------|
| `frontend/lib/nav-perf/nav-timing.ts` | Client nav timing util + `NAV_PERF_BUDGET` + `NavPerfTracker` |
| `frontend/components/layout/DashboardShell.tsx` | Mounts `NavPerfTracker` at shell boundary |
| `frontend/scripts/capture-nav-baseline.mjs` | Optional reproducible capture (Playwright) |

No backend middleware or route semantics changed.

---

## Next phase

Compare np-02 / np-03 wins against this table: [`../p1-backend-tax/`](../p1-backend-tax/)
