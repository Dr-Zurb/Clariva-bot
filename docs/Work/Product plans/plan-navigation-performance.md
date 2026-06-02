# Plan — Navigation performance

## Make every click in the dashboard feel instant — kill the per-request backend tax, stop refetching everything on every navigation, and give each route an immediate skeleton

> **Source thread:** 2026-05-31 chat. The doctor: *"the flow of navigation and smoothness… currently it feels too laggy and slow when switching between tabs, clicking and opening a page, loading. We need to laser-fast the processes."*
>
> **Status:** `Shipped (Phases 0–4)` — updated 2026-05-31. **Phases 0–4 shipped**: auth tax removed; TanStack cache + dedupe + SSR-auth; route skeletons + SSR streaming; data-path fan-out reduction (overview **−48%**, KPI **−57%** vs np-09 profile). **np-11 (direct-PG)** remains **NO-GO** (NP-Q7) — co-location first.
>
> **Strategy:** infrastructure / performance refactor across two layers — (1) the Express auth+audit middleware that taxes every API request, and (2) the Next.js client data layer that refetches everything uncached on every navigation. **No API contract changes, no route renames, no new product surface.** Mostly backend + frontend data-layer; near-zero net-new UI.
>
> **Status legend (matches `ehr/` convention):** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Selection markers per item:** `Decision: [ ] Yes / [ ] No / [ ] Modify`. Tick exactly one in each item before promotion.

---

## Why this plan exists now

The slowness is **measured, not vibes** — the running backend dev log shows a hard floor of ~600–900ms on *trivial* GETs, with spikes to ~2.4s:

```
path: "/kpis"          durationMs: 1982   statusCode: 200
path: "/vitals"        durationMs: 912    statusCode: 200
path: "/conditions"    durationMs: 924    statusCode: 200
path: "/queue-session" durationMs: 2266   statusCode: 200
path: "/"              durationMs: 1667   statusCode: 200
```

Two independent problems compound into the laggy feel:

1. **Every API request pays a fixed tax of two serial network round-trips before any business logic runs.** In [`backend/src/middleware/auth.ts`](../../../backend/src/middleware/auth.ts), `authenticateToken` (a) calls `supabase.auth.getUser(token)` — an HTTP round-trip to Supabase's hosted Auth (GoTrue) server to validate the JWT on *every* request — then (b) `await`s `logAuditEvent(...)`, an `audit_logs` INSERT over PostgREST that **blocks `next()`**. That's the ~600–900ms floor, before the controller's own DB calls (also over the Supabase REST client, each its own HTTPS hop).

2. **The frontend has no client cache and refetches everything from scratch on every navigation.** [`frontend/lib/api.ts`](../../../frontend/lib/api.ts) hard-codes `cache: "no-store"` in **80** places; there is **no SWR / TanStack Query** anywhere in source. Every component hand-rolls `useEffect` + `fetch`, so revisiting a page you saw five seconds ago re-pays the full backend tax for data that hasn't changed. On top of that:
   - **Duplicate identical pollers.** `useDashboardCounts` is mounted in *both* [`DashboardShell`](../../../frontend/components/layout/DashboardShell.tsx) and [`KpiStrip`](../../../frontend/components/dashboard/cockpit/KpiStrip.tsx) — two 30s pollers each firing 3 requests (the doubled `/queue-session`, `/kpis` in the logs).
   - **Server components double the auth round-trip.** `supabase.auth.getUser()` is called in **12** server components; the dashboard layout calls it, then each page calls it *again* plus `getSession()` — so one navigation = ≥2 GoTrue round-trips server-side before data fetching even starts.
   - **Client fetch waterfalls.** The cockpit home mounts 5 cards that each fetch on mount; the patient page fetches `/vitals`, `/conditions`, `/allergies`, `/problems`, `/prescriptions/recent` separately — each paying the backend tax — so pages visibly assemble piece by piece.
   - **Only one `loading.tsx` exists in the entire app** (`appointments/[id]`), so most navigations show nothing until data lands.

Fixing problem 1 speeds up *literally every* click because all page data sits behind it. Fixing problem 2 makes re-navigation instant and stops the waterfalls. Doing them now, before more pages/pollers are built on the same base, is far cheaper than retrofitting later.

---

## North star

> A doctor clicking between Today, OPD, Patients, and a patient chart sees the destination's shell **immediately** and real data within a couple hundred milliseconds — never a blank pane, never a spinner for data they just saw. The app feels like a native desktop tool, not a series of slow page loads.

Concretely, after this plan ships:

1. **The authenticated-request floor is < ~100ms** (down from ~600–900ms) — no synchronous GoTrue round-trip, no blocking audit write, in the request path.
2. **Re-navigating to a recently-seen page is instant** — cached data renders immediately, revalidates in the background.
3. **Every dashboard route shows an instant skeleton** on navigation (`loading.tsx` per segment), so the click feels acknowledged in < 100ms regardless of data latency.
4. **No duplicate in-flight requests** — identical reads dedupe to one network call.
5. **Auth security and compliance audit completeness are preserved** — nothing about this plan drops an audit event or weakens token rejection.
6. **No API contract, route, or product-surface changes** — purely how fast existing surfaces load.

---

## Findings / evidence (the diagnosis this plan acts on)

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| F1 | GoTrue round-trip per request | [`auth.ts`](../../../backend/src/middleware/auth.ts) L64 `supabase.auth.getUser(token)` | ~150–500ms × every request |
| F2 | Audit INSERT blocks the request | [`auth.ts`](../../../backend/src/middleware/auth.ts) L84 `await logAuditEvent(...)`; [`audit-logger.ts`](../../../backend/src/utils/audit-logger.ts) L155 awaited PostgREST insert | adds a 2nd serial round-trip to the floor |
| F3 | No client cache; everything `no-store` | **80×** `cache: "no-store"` in [`lib/api.ts`](../../../frontend/lib/api.ts); no SWR/TanStack in source | every nav refetches; back/forward is slow |
| F4 | Duplicate `useDashboardCounts` | mounted in [`DashboardShell`](../../../frontend/components/layout/DashboardShell.tsx) L98 **and** [`KpiStrip`](../../../frontend/components/dashboard/cockpit/KpiStrip.tsx) L117 | doubled poll traffic (seen in logs) |
| F5 | Double server-side `getUser()` per nav | [`dashboard/layout.tsx`](../../../frontend/app/dashboard/layout.tsx) L18 + each page (e.g. [`patients-v2/[id]/page.tsx`](../../../frontend/app/dashboard/patients-v2/%5Bid%5D/page.tsx) L22); **12** call sites total | ≥2 GoTrue hops before data fetch |
| F6 | Client fetch waterfalls per page | cockpit cards + patient tabs each fetch on mount (`useEffect`) | pages assemble slowly, multiple skeletons |
| F7 | Almost no route skeletons | only `app/dashboard/appointments/[id]/loading.tsx` exists | navigations look frozen until data lands |
| F8 | Measuring `next dev` | terminal `11.txt` runs `npm run dev` | dev compile + Strict-Mode double-effects + no `<Link>` prefetch inflate the felt lag |

---

## Decision locks (proposed — confirm in chat before promotion)

These are scoping decisions recommended from the 2026-05-31 investigation. Tick or modify each in chat; revisiting a locked one later requires a `Decision: … [x] Modify` block on the affected R-item.

> **Locked 2026-05-31 (chat):** NP-DL-1, NP-DL-2, NP-DL-3, NP-DL-5, NP-DL-6 confirmed (Phases 0–1 shipped on these). **NP-DL-4 now locked** — NP-Q1 resolved to **TanStack Query** (2026-05-31); Phase 2 promoted on it.

| ID | Proposed decision | Implication |
|----|-------------------|-------------|
| **NP-DL-1** | **Measure first, every item.** Capture a before/after baseline (request `durationMs`, requests-per-navigation, perceived nav time) for each R-item. R-MEASURE runs before any fix. | Phase 0 is non-optional. Backend already logs `durationMs`; we add a thin client nav timing. |
| **NP-DL-2** | **Preserve security + compliance posture.** Invalid/expired tokens are still rejected; **no audit event is ever dropped** (moved off the hot path ≠ best-effort-lossy). The local-verify revocation tradeoff (below) is documented and accepted. | Constrains *how* R-AUTH-VERIFY and R-AUDIT-ASYNC are built. |
| **NP-DL-3** | **Backend tax first.** R-AUTH-VERIFY + R-AUDIT-ASYNC (Phase 1) precede frontend work — they multiply across every page and unblock the rest. | Ordering lock. |
| **NP-DL-4** | **One client-cache library, adopted incrementally.** Default **TanStack Query** (see NP-Q1). Migrate hot surfaces first; the 80 hand-rolled fetches are ported opportunistically, not big-bang. | No flag-day rewrite of `lib/api.ts`; old fetches keep working during migration. |
| **NP-DL-5** | **No API contract / route / product-surface change.** This plan changes *how fast* existing things load, never *what* they are. | Keeps effort bounded; no doctor-visible behaviour change except speed + skeletons. |
| **NP-DL-6** | **Validate in a production build, not just `next dev`.** Acceptance numbers are taken from `next build && next start`. | Separates real wins from dev-only noise (F8). |
| **NP-DL-7** | **Preserve tenant isolation when optimizing the data path.** Any aggregation, `SECURITY DEFINER` RPC, or direct-PG path that bypasses per-section RLS/TS gating MUST enforce the same `doctor_id` ownership and pass a cross-tenant parity battery before flip. **No** hand-rolled multi-table JOIN that could leak across tenants (per the explicit warning in `patient-overview-service.ts`). *(Added 2026-05-31 for Phase 4.)* | Constrains *how* R-FANOUT and R-DB-POOL are built. |

---

## What changes vs what stays

### 🟡 Touched (substantive diffs)

- [`backend/src/middleware/auth.ts`](../../../backend/src/middleware/auth.ts) — replace per-request `getUser()` with local JWT verification + fallback; make audit logging non-blocking (R-AUTH-VERIFY, R-AUDIT-ASYNC).
- [`backend/src/utils/audit-logger.ts`](../../../backend/src/utils/audit-logger.ts) — add an async/queued emit path (keep the existing API for callers).
- [`frontend/components/layout/DashboardShell.tsx`](../../../frontend/components/layout/DashboardShell.tsx) / [`KpiStrip.tsx`](../../../frontend/components/dashboard/cockpit/KpiStrip.tsx) — single shared counts source (R-DEDUPE-POLL).
- [`frontend/app/dashboard/layout.tsx`](../../../frontend/app/dashboard/layout.tsx) + dashboard pages — stop re-calling `getUser()` per page; validate once and pass down (R-SSR-AUTH).
- Hot data hooks/components on the daily-driver surfaces — re-home onto the cache layer (R-QUERY-CACHE).

### 🆕 Created (new files)

- A client query provider + typed query hooks layer (TanStack Query) — wraps existing `lib/api.ts` callers.
- `loading.tsx` skeletons per dashboard route segment (R-LOADING-SKELETONS).
- A backend JWT-verification util (local verify with project secret/JWKS) + an audit emit queue.
- A lightweight client nav-timing util for the baseline (R-MEASURE).

### 🚫 Untouched

- All API routes, request/response shapes, and the `audit_logs` schema.
- RLS policies and the service-role usage in audit logging.
- Product UI, copy, IA, and the cockpit/pane model.
- Twilio/voice/video real-time paths (their own pollers stay; out of scope here).

---

## Decision matrix (single-screen overview)

| ID | Item | Phase | Yes | No | Modify | Effort |
|----|------|-------|-----|----|--------|--------|
| R-MEASURE | Baseline instrumentation + perf budget | 0 | [x] | [ ] | [ ] | ~0.5–1d |
| R-AUTH-VERIFY | Local JWT verification in middleware | 1 | [x] | [ ] | [ ] | ~1–2d |
| R-AUDIT-ASYNC | Audit logging off the request hot path | 1 | [x] | [ ] | [ ] | ~1–1.5d |
| R-QUERY-CACHE | Client cache layer (TanStack Query) | 2 | [x] | [ ] | [ ] | ~3–5d |
| R-DEDUPE-POLL | Single counts source + poller consolidation | 2 | [x] | [ ] | [ ] | ~0.5d |
| R-SSR-AUTH | Stop double `getUser()` per navigation | 2 | [x] | [ ] | [ ] | ~1–2d |
| R-LOADING-SKELETONS | `loading.tsx` per route segment | 3 | [x] | [ ] | [ ] | ~1d |
| R-SERVER-FETCH | Server-component + Suspense first paint | 3 | [x] | [ ] | [ ] | ~3–5d |
| R-DB-PROFILE | Attribute the residual DB-path floor | 4 | [x] | [ ] | [ ] | ~0.5–1d |
| R-FANOUT | Collapse per-request round-trips + SQL-side counts | 4 | [x] | [ ] | [ ] | ~2–4d |
| R-DB-POOL | Pooled direct-PG for hottest reads *(NP-Q7 = NO-GO this batch)* | 4 | [ ] | [x] | [ ] | ~3–5d |

---

## Work items

### R-MEASURE — Baseline instrumentation + perf budget *(Phase 0)*

**What:**
- Record a before snapshot per daily-driver surface (Today, OPD, Patients list, Patient detail): request count per navigation, p50/p95 `durationMs` (already in backend logs), and a client "click → first contentful paint of route" timing.
- Define the perf budget the rest of the plan is held to (the North-star numbers).

**Why:** NP-DL-1. Without a baseline we can't prove wins or catch regressions, and Strict-Mode/dev noise (F8) will mislead.

**Acceptance:** a short baseline table (dev *and* prod build) committed alongside the plan; budget agreed. **Baseline (2026-05-31):** [`docs/Work/Daily-plans/May 2026/31-05-2026/navigation-performance/p0-measure/baseline.md`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p0-measure/baseline.md).

**Effort:** ~0.5–1d. **Dependencies:** none. **Files:** new client nav-timing util; reuse backend `durationMs`.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-01](../Daily-plans/May%202026/31-05-2026/navigation-performance/p0-measure/Tasks/task-np-01-baseline-instrumentation.md).*

---

### R-AUTH-VERIFY — Local JWT verification in the auth middleware *(Phase 1 — biggest win)*

**What:**
- In [`auth.ts`](../../../backend/src/middleware/auth.ts), verify the access token **locally** (signature + `exp`/`aud`/`iss`) using the Supabase project's JWT secret (HS256) or JWKS (asymmetric keys — see NP-Q2) instead of calling `supabase.auth.getUser(token)` on every request.
- Keep a narrow fallback to `getUser()` only when local verify is inconclusive, and continue rejecting invalid/expired tokens exactly as today.

**Why:** F1 — removes the dominant ~150–500ms per-request cost. This single change benefits every authenticated route.

**Acceptance:** authenticated-request floor drops to < ~100ms in prod build; invalid/expired/garbage tokens still 401; `req.user` shape unchanged for downstream handlers; revocation tradeoff (NP-Q2 / R5) documented.

**Effort:** ~1–2d. **Dependencies:** R-MEASURE. **Files:** `auth.ts`, new `verify-jwt` util, `config/env.ts` (secret/JWKS source).

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-02](../Daily-plans/May%202026/31-05-2026/navigation-performance/p1-backend-tax/Tasks/task-np-02-local-jwt-verification.md). NP-Q2 resolved: detect signing scheme first.*

---

### R-AUDIT-ASYNC — Move audit logging off the request hot path *(Phase 1)*

**What:**
- Stop `await`ing `logAuditEvent(...)` inside `authenticateToken` (and similar read-path call sites). Emit to an in-process async queue that flushes (batched) without blocking `next()`; drain on graceful shutdown.
- Preserve the existing `logAuditEvent` / `logSecurityEvent` API so callers don't change.

**Why:** F2 — removes the 2nd serial round-trip from the floor.

**Acceptance:** no audit write in the synchronous request path; **zero audit events dropped** under normal operation and on clean shutdown (NP-DL-2); failed-auth `logSecurityEvent` still recorded; load test shows floor reduction stacking with R-AUTH-VERIFY.

**Effort:** ~1–1.5d. **Dependencies:** R-MEASURE (parallel with R-AUTH-VERIFY). **Files:** `audit-logger.ts`, `auth.ts`, shutdown hook.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-03](../Daily-plans/May%202026/31-05-2026/navigation-performance/p1-backend-tax/Tasks/task-np-03-audit-logging-off-hot-path.md). Sequenced after np-02 (shared `auth.ts`), not parallel.*

---

### R-QUERY-CACHE — Client cache layer (TanStack Query) *(Phase 2)*

**What:**
- Add a query client provider at the dashboard boundary; wrap `lib/api.ts` calls in typed query hooks with sensible `staleTime`s. Get caching, request de-duplication, background revalidation, and visibility refetch for free.
- Migrate the daily-driver surfaces first (cockpit cards, patients list, patient detail tabs); replace their `useEffect` + `no-store` fetches and bespoke `setInterval` pollers.

**Why:** F3/F6 — re-navigation becomes instant (render cache, revalidate behind), waterfalls collapse into deduped parallel queries.

**Acceptance:** revisiting a recently-seen page renders cached data with no spinner; no duplicate in-flight identical requests; mutations invalidate the right keys; clinically time-sensitive reads (OPD queue, live-consult vitals) use short/zero stale times.

**Effort:** ~3–5d (incremental; NP-DL-4). **Dependencies:** Phase 1 landed (so cached misses are also fast). **Files:** new provider + hooks; touched daily-driver components.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31. NP-Q1 locked → **TanStack Query**. Split: [np-04](../Daily-plans/May%202026/31-05-2026/navigation-performance/p2-cache-dedupe/Tasks/task-np-04-query-cache-foundation.md) (provider + hook foundation) → [np-05](../Daily-plans/May%202026/31-05-2026/navigation-performance/p2-cache-dedupe/Tasks/task-np-05-migrate-surfaces-and-dedupe.md) (migrate daily-driver surfaces). Cached misses now cost ~484 ms (Phase-1 DB floor), so caching is the dominant felt-speed win on repeat nav.*

---

### R-DEDUPE-POLL — Single counts source + poller consolidation *(Phase 2)*

**What:**
- Collapse the two `useDashboardCounts` mounts (F4) into one shared source (a single query key once R-QUERY-CACHE lands, or a single provider in the interim). Audit other duplicate/overlapping pollers on the dashboard.

**Why:** F4 — halves the badge/count poll traffic and removes redundant work competing with navigation.

**Acceptance:** exactly one set of counts requests on the dashboard; badges still update; visibility-pause behaviour preserved.

**Effort:** ~0.5d. **Dependencies:** ideally rides R-QUERY-CACHE. **Files:** `DashboardShell.tsx`, `KpiStrip.tsx`, `useDashboardCounts.ts`.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31; folded into [np-05](../Daily-plans/May%202026/31-05-2026/navigation-performance/p2-cache-dedupe/Tasks/task-np-05-migrate-surfaces-and-dedupe.md) — the two `useDashboardCounts` mounts collapse to one shared query key once the cache lands.*

---

### R-SSR-AUTH — Stop the double `getUser()` per navigation *(Phase 2)*

**What:**
- Validate the user once per request (layout or middleware) and pass `user`/`token` down, rather than each page re-calling `getUser()` + `getSession()` (F5). With R-AUTH-VERIFY this is already cheap, but removing the redundant hop is still worth it.

**Why:** F5 — fewer server-side auth round-trips per navigation.

**Acceptance:** one validated `getUser()` per navigation (not per layout+page); auth redirects unchanged; tokens still reach client components that need them.

**Effort:** ~1–2d. **Dependencies:** R-AUTH-VERIFY (so the chosen approach is consistent). **Files:** `dashboard/layout.tsx`, dashboard pages, possibly `middleware.ts`.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-06](../Daily-plans/May%202026/31-05-2026/navigation-performance/p2-cache-dedupe/Tasks/task-np-06-ssr-auth-dedupe.md). Independent of the cache work (server-side), so it runs parallel to np-04 in the batch.*

---

### R-LOADING-SKELETONS — `loading.tsx` per route segment *(Phase 3)*

**What:**
- Add a `loading.tsx` skeleton to each dashboard route segment (today, opd-today, patients-v2, patients-v2/[id], booking-review, insights, alerts, settings/*) so navigation paints an instant acknowledgement (F7) while the server works.

**Why:** F7 — biggest *perceived*-speed win for the least code; the click feels instant even when data isn't.

**Acceptance:** every dashboard route shows a skeleton < 100ms after click; skeletons match final layout to avoid shift.

**Effort:** ~1d. **Dependencies:** none (can land anytime; most effective after Phase 1). **Files:** new `loading.tsx` per segment.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-07](../Daily-plans/May%202026/31-05-2026/navigation-performance/p3-perceived-streaming/Tasks/task-np-07-loading-skeletons.md). Verified: only `appointments/[id]/loading.tsx` exists today — every other dashboard segment paints blank on navigation.*

---

### R-SERVER-FETCH — Server-component first paint + Suspense streaming *(Phase 3)*

**What:**
- Move first-paint reads on the heaviest pages (patient detail, cockpit home) into server components that fetch in parallel and stream via Suspense, instead of client `useEffect` waterfalls. Client cache (R-QUERY-CACHE) then hydrates and owns subsequent revalidation.

**Why:** F6 — data arrives with the HTML; the page stops assembling in visible stages.

**Acceptance:** patient detail first paint shows core chart data in one streamed pass (no per-card spinner cascade) in prod build; no regression vs cached client navigation.

**Effort:** ~3–5d. **Dependencies:** R-QUERY-CACHE, R-AUTH-VERIFY. **Files:** patient detail + cockpit server components and their data utils.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-08](../Daily-plans/May%202026/31-05-2026/navigation-performance/p3-perceived-streaming/Tasks/task-np-08-server-stream-heavy-pages.md). **Approach now informed by Phase 2:** the heavy pages already run on TanStack Query (client) and `QueryProvider` has no SSR hydration — so np-08 does server `prefetchQuery` + `dehydrate` + `<HydrationBoundary>` to stream first paint **into** the existing cache, not a bypassing server-component rewrite.*

---

### R-DB-PROFILE — Attribute the residual data-path floor *(Phase 4 — measure first)*

**What:**
- Profile *where* the residual cost is: the ~484 ms trivial-GET floor and the ~2.5 s patient-overview. Break it into (a) **network RTT** to Supabase (same-region vs cross-region), (b) **PostgREST/connection overhead** vs raw query time, and (c) **round-trips per request** — e.g. `getPatientOverview` runs ~4 sequential Supabase waves (`findPatient` → ownership checks → 6 sections → payments); `computePatientsKpis` fetches *all* rows and counts in JS.
- Emit a per-hot-endpoint table (round-trips/req, payload size, p50/p95 server time, RTT attribution) + a ranked lever recommendation.

**Why:** NP-DL-1 — the right lever (parallelize vs aggregate vs pooled-PG vs co-locate) depends on which cost dominates. This decides NP-Q7.

**Acceptance:** a `p4` profile doc attributing the floor and ranking levers; measurement-only (no behaviour change).

**Effort:** ~0.5–1d. **Dependencies:** Phases 1–3 shipped. **Files:** a profiling script + read of the hot services.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-09](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/Tasks/task-np-09-db-path-profile.md).*

---

### R-FANOUT — Collapse per-request round-trips + SQL-side counts *(Phase 4)*

**What:**
- Cut sequential Supabase round-trips on the hot read endpoints **within the existing per-section TS services** (NP-DL-7 — no hand-rolled cross-table JOIN): parallelize the remaining serial waves (fold patient-existence + ownership; issue payments without a strict extra wave) and use PostgREST `select` embedding to merge sub-reads.
- Replace the KPI **fetch-all-rows-then-count-in-JS** with PostgREST exact/`head` count queries (or a reviewed `SECURITY DEFINER` RPC only if unavoidable — NP-Q8) so the DB counts and payloads shrink.
- Drop page-level fan-out where an endpoint already returns a sibling's data (e.g. `/overview` already returns `vitals_trends`).

**Why:** residual F1/F6 — each removed serial hop saves ~400–500 ms; smaller payloads cut transfer + parse.

**Acceptance:** patient-overview server time materially reduced (fewer sequential waves, proven vs the np-09 profile, prod); KPI endpoint stops transferring full row sets; **tenant-isolation parity battery green (NP-DL-7)**; no contract change (NP-DL-5).

**Effort:** ~2–4d. **Dependencies:** R-DB-PROFILE. **Files:** `patient-overview-service.ts`, hot `*-service.ts` readers, possibly a reviewed RPC.

**Decision:** [x] Yes  [ ] No  [ ] Modify — *promoted 2026-05-31 → [np-10](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/Tasks/task-np-10-fanout-reduction.md).*

---

### R-DB-POOL — Pooled direct-Postgres for the hottest reads *(Phase 4 — profile-gated)*

**What:**
- **Only if** np-09 attributes the dominant residual cost to **PostgREST/connection overhead** (not region RTT), add a pooled direct-PG path (`postgres.js`/`pg` + pgBouncer/Supavisor) for the few hottest read controllers, bypassing PostgREST.

**Why:** removes PostgREST per-call overhead where it dominates.

**Acceptance:** **security-critical (NP-DL-7)** — direct-PG runs with service-role-equivalent access, so every query MUST enforce the same `doctor_id` tenant gate the TS services do today, proven by a cross-tenant parity battery before flip; measured per-call win vs np-09.

**Effort:** ~3–5d. **Dependencies:** R-DB-PROFILE + NP-Q7 = go. **Files:** new pooled-PG client + the hottest read paths.

**Decision:** [ ] Yes  [x] No  [ ] Modify — ***NP-Q7 resolved NO-GO 2026-05-31*** (np-09 profile). Round-trip *count*, not PostgREST per-call overhead, dominated the slow aggregators — so np-10 captured the win (overview **−48%**, KPI **−57%**) on plain PostgREST + existing tenant gates. The profile ran from a **local dev host**, so the ~450 ms per-RTT floor is conflated with home-internet latency. **Re-evaluate np-11 only if** a **co-located** prod re-profile still shows a per-RTT floor **> ~100 ms** with PostgREST overhead (not trip count) as the residual.

---

## Sequencing

Four phases after the baseline. Within a phase, items can run in parallel chats.

### Phase 0 — Measure · `Shipped` 2026-05-31 → [`p0-measure/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p0-measure/)
- **R-MEASURE.** Baseline (dev + prod build) and agreed budget. Gate: numbers committed. → ✅ [`baseline.md`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p0-measure/baseline.md).

### Phase 1 — Backend tax (the multiplier) · `Shipped` 2026-05-31 → [`p1-backend-tax/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p1-backend-tax/)
| R-item | Effort | Notes |
|---|---|---|
| R-AUTH-VERIFY | 1–2d | local JWT verify; biggest single win |
| R-AUDIT-ASYNC | 1–1.5d | audit off hot path; **sequenced after R-AUTH-VERIFY** (shared `auth.ts`), not parallel |

**Gate:** authenticated-request floor < ~100ms in prod build; security/compliance acceptance met.

#### Phase 1 result (2026-05-31)
**Shipped** ([`p1-measurement-results.md`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p1-backend-tax/p1-measurement-results.md)). Auth tax removed: floor **p50 680→484 ms (−29%)**, **p95 1280→539 ms (−58%)**; audit completeness **60/60** with the new lossless async queue; tokens still fail closed.
**Important — the < ~100 ms gate was *not* met.** With F1 (GoTrue round-trip) and F2 (blocking audit insert) gone, the residual floor is dominated by the **Supabase PostgREST DB round-trip** for the handler query (~400–500 ms from this host) — *not* auth. **Consequence:** Phase 2 (cache) and Phase 3 (skeletons/streaming) *hide* this on repeat-nav and perceptually, but a sub-100 ms **cold** server floor needs backend data-path work — now an evidence-backed candidate (see NP-Q5 → potential Phase 4).

### Phase 2 — Client cache + dedupe · `Shipped` 2026-05-31 → [`p2-cache-dedupe/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p2-cache-dedupe/)
| R-item | Effort | Notes |
|---|---|---|
| R-QUERY-CACHE | 3–5d | TanStack Query (NP-Q1 locked); migrate daily-driver surfaces first → np-04 (foundation) + np-05 (migrate) |
| R-DEDUPE-POLL | 0.5d | rides R-QUERY-CACHE; folded into np-05 |
| R-SSR-AUTH | 1–2d | remove redundant server-side hop → np-06 (parallel to np-04) |

**Gate:** re-navigation instant from cache; no duplicate in-flight reads; one `getUser()` per nav. Clinical reads (OPD queue, live vitals) stay zero/near-zero stale (NP-R4).

#### Phase 2 result (2026-05-31)
**Shipped** (np-04/05/06 all `✅ DONE`). In place: `@tanstack/react-query` + dev-only devtools, a client `QueryProvider` (stable client, `STALE.LIVE` default, no-retry-on-4xx), a `hooks/queries/*` layer (`STALE` constants in `lib/query/stale.ts`), the daily-driver surfaces migrated, `useDashboardCounts` collapsed onto shared query keys (R-DEDUPE-POLL), `useLogout` clearing the cache on sign-out (cross-user PHI hygiene), and `lib/auth/server-user.ts` (`cache()`-memoized server user, R-SSR-AUTH).
**Open item:** unlike Phase 1, **no `p2-measurement-results.md` was recorded** — the prod-build repeat-nav before/after (NP-DL-1 / NP-DL-6) is outstanding and is **folded into the Phase 3 gate** (Phase 3 re-measures the same daily-driver surfaces anyway).

### Phase 3 — Perceived speed + streaming · `Shipped` 2026-05-31 → [`p3-perceived-streaming/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p3-perceived-streaming/)
| R-item | Effort | Notes |
|---|---|---|
| R-LOADING-SKELETONS | 1d | instant nav acknowledgement → np-07 (all segments; only `appointments/[id]` has one today) |
| R-SERVER-FETCH | 3–5d | kill client waterfalls on heavy pages → np-08 (server `prefetch` + `dehydrate`/`HydrationBoundary` into the Phase-2 cache) |

**Gate:** every route paints a skeleton < 100ms; heavy pages stream in one pass; **+ records the deferred Phase-2 prod repeat-nav measurement** (closes NP-DL-1/NP-DL-6 for both phases).

#### Phase 3 result (2026-05-31)
**Shipped** (np-07/08 `✅ DONE`; [`p3-measurement-results.md`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p3-perceived-streaming/p3-measurement-results.md)). 13 `loading.tsx` skeletons (only `appointments/[id]` had one before) → instant route acknowledgement; server `prefetchQuery` → scoped `dehydrate` → `<HydrationBoundary>` on Today + patient detail (shared keys in `lib/query/options.ts`; scoped dehydrate as the PHI guard); tsc + build green.
**Important:** skeletons/streaming make cold nav *feel* instant, but the **data still lands at backend speed** — patient-overview is ~2.5 s cold because `/overview` runs ~4 sequential Supabase waves. That residual **data-path latency** is exactly what Phase 4 targets.

### Phase 4 — Data-path latency · `Shipped` 2026-05-31 → [`p4-data-path/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/)
| R-item | Effort | Notes |
|---|---|---|
| R-DB-PROFILE | 0.5–1d | measure-first; attribute the residual floor (RTT vs PostgREST vs round-trips) → np-09 ✅ |
| R-FANOUT | 2–4d | collapse per-request serial round-trips + SQL-side counts, within per-section gating (NP-DL-7) → np-10 ✅ |
| R-DB-POOL | 3–5d | pooled direct-PG for hottest reads — **NP-Q7 = NO-GO; np-11 not promoted** |

**Gate:** ✅ patient-overview **−48%** cold (949 ms vs 1833 ms); KPI **−57%** cold; tenant parity battery green; no contract change.

#### Phase 4 result (2026-05-31)
**Shipped** (np-09/10 `✅ DONE`; [`p4-measurement-results.md`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/p4-measurement-results.md) + [`p4-np10-measurement-results.md`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/p4-np10-measurement-results.md)). np-09 attributed the floor (round-trip count dominates; NP-Q7 **NO-GO** on direct-PG). np-10 merged overview tenant waves, overlapped payments fetch, embedded rx sub-reads, parallelized KPI compute + DB-side `count`/`head` for new-patient tiles. **Sub-100 ms trivial GET still blocked on per-RTT infra** (~450 ms) — next lever is **co-locate API with Supabase region**, not np-11.

### Total effort estimate
**~13–23 dev-days serial** (incl. Phase 4; **+3–5d** if NP-Q7 = go on pooled-PG). Phase 1 (~2–3.5d) delivered the largest felt win; Phase 4 is the only remaining lever for the sub-100 ms **cold** server floor.

---

## Success criteria

| Metric | Today (measured / observed) | Target |
|--------|------------------------------|--------|
| Authenticated-request floor (trivial GET) | ~600–900ms | < ~100ms |
| GoTrue round-trips per request | 1 (in `getUser`) | 0 on the hot path |
| Blocking audit write per request | 1 (awaited INSERT) | 0 |
| Re-navigating to a seen page | full refetch + spinners | instant from cache |
| Duplicate in-flight identical reads | yes (e.g. doubled counts) | 0 |
| Server-side `getUser()` per navigation | ≥ 2 (layout + page) | 1 |
| Routes with an instant skeleton | 1 of ~10 | all dashboard routes |
| Audit events recorded | all (blocking) | all (non-blocking, none dropped) |
| API contracts / routes changed | n/a | 0 (NP-DL-5) |
| Cold patient-overview server time | ~949 ms (was ~2.5 s) | materially reduced ✅ |
| KPI counts computed by | DB-side `count`/`head` + parallel wave ✅ | DB-side count (PostgREST/RPC) |
| Tenant-isolation parity on data-path changes | n/a | battery green before any flip (NP-DL-7) |

---

## Open questions (live — answer in chat, then lock here)

### NP-Q1 — TanStack Query vs SWR?
**Question:** Which client cache library? **Lean: TanStack Query** (richer invalidation/mutation story, devtools, good fit for the many mutation flows). SWR is lighter if we want minimal surface. **Lock before R-QUERY-CACHE.**
**Locked 2026-05-31 → TanStack Query.** Rationale: the app is mutation-heavy (booking, prescriptions, consult actions) and TanStack's explicit query-key invalidation + devtools make the per-surface staleness/invalidation work (NP-Q4, NP-R4) tractable and auditable — worth the slightly larger surface over SWR. Adopted incrementally per NP-DL-4 (foundation in np-04, hot surfaces in np-05); the 80 hand-rolled `no-store` fetches keep working during migration.

### NP-Q2 — Local JWT verification mechanism
**Question:** Verify with the legacy shared **HS256 secret**, or with **JWKS** (asymmetric) if the Supabase project uses the newer signing keys? Determines the util and env config. **Lock before R-AUTH-VERIFY.** *(Tradeoff: local verify means a revoked refresh token isn't caught until the short-lived access token expires — standard and acceptable for ~1h tokens; document it. Optionally keep a periodic full `getUser()` refresh.)*
**Locked 2026-05-31 (= detect-first):** np-02 detects the project's signing scheme before choosing the verifier rather than pre-committing — the engineering-correct path that works for either key type.

### NP-Q3 — Audit off-hot-path mechanism
**Question:** In-process async flush (`setImmediate` / microtask queue with batched insert + shutdown drain) for v1, or an external queue? **Lean: in-process batched flush** with a graceful-shutdown drain; revisit only if volume demands a real queue. **Lock before R-AUDIT-ASYNC.**

### NP-Q4 — Per-resource staleness policy
**Question:** What `staleTime` per data type? Static-ish (practice info, services catalog) can be minutes; OPD queue / live-consult vitals need seconds or zero. **Draft a small table during R-QUERY-CACHE; lock per surface.**

### NP-Q5 — Direct pooled Postgres for the hottest endpoints?
**Question:** Should the slowest controllers bypass the Supabase REST client for a pooled PG connection (pgBouncer)? **Lean: defer** — measure after Phase 1; the auth tax may be most of the cost. Parked as a fast-follow if specific endpoints stay slow.
**Measured 2026-05-31 (post-Phase-1) — premise answered:** the auth tax was **not** most of the cost. After np-02/np-03, a trivial authenticated GET still sits at **~484 ms p50**, dominated by the **Supabase PostgREST round-trip** (~400–500 ms/query from this host), plus per-page fan-out (patient detail issues ~10 such GETs). So the North-star **< ~100 ms cold server floor is now blocked on the data path, not auth.** This elevates NP-Q5 from "maybe" to a **likely Phase 4** once Phase 2–3 land. Candidate levers to scope then: (a) pooled direct-PG (pgBouncer/`postgres.js`) for the hottest read controllers; (b) collapse per-page fan-out into fewer round-trips (batch/`select` embedding, or a single aggregate endpoint); (c) co-locate the API with the DB region if it isn't already. Decide after Phase 2 shows how much cold latency the cache actually removes from the felt experience.
**Promoted 2026-05-31 → Phase 4** ([`p4-data-path/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/)). Lever choice is now itself measured-first: R-DB-PROFILE (np-09) attributes the floor, then R-FANOUT (np-10, lever b) ships the safe win; lever a (direct-PG) is gated on NP-Q7 and lever c (co-location) is a deployment recommendation the profile emits.

### NP-Q6 — Migration scope / order for R-QUERY-CACHE
**Question:** Which surfaces first? **Lean: cockpit home → patients list → patient detail → opd-today** (daily drivers), then opportunistic. **Lock at R-QUERY-CACHE kickoff.**
**Locked 2026-05-31 → cockpit home → patients list → patient detail → opd-today**, then opportunistic. Order tracks the baseline's biggest offenders (cockpit ~9 GETs/nav; patient detail ~10 GETs with the chart waterfall). Encoded in np-05.

### NP-Q7 — Pooled direct-PG: go or no-go? *(gated on the np-09 profile)*
**Question:** Add a pooled direct-PG path for the hottest reads, or stay on PostgREST? **Decision rule (set by R-DB-PROFILE):** if np-09 attributes the floor mainly to **PostgREST/connection overhead** → **go** (R-DB-POOL); if mainly **cross-region RTT** → prefer **co-locating** the API with the DB region (cheaper; NP-Q5 lever c) and skip direct-PG; if mainly **round-trip count** → R-FANOUT alone may suffice. **Lock after np-09.**
**Resolved 2026-05-31 (np-09) → NO-GO (this batch).** The three-probe attribution showed the per-call floor (~230–330 ms PostgREST, ~450 ms full authenticated HTTP) is fixed HTTPS/PostgREST cost, but the **dominant multiplier** on the slow aggregators is **round-trip count** (4 serial overview waves; KPI fetch-all; rx N+1) — *not* marginal PostgREST overhead. So np-10 captured the win on plain PostgREST. Profiled from a **local dev host** (per-RTT includes home-internet). **Next lever is co-location (rank 2), not np-11.** Promote np-11 only if, after the prod API is co-located with the Supabase region and re-profiled, the per-RTT floor stays **> ~100 ms** with PostgREST overhead (not trip count) as the residual.
**Locked 2026-05-31 → NO-GO.** np-09: round-trip count dominates aggregators; np-10 shipped R-FANOUT (−48% overview, −57% KPI). Per-RTT floor (~450 ms trivial GET) is infra/co-location, not marginal PostgREST savings. np-11 not promoted.

### NP-Q8 — Aggregate counts: PostgREST count vs `SECURITY DEFINER` RPC?
**Question:** Express the patients-KPI counts as PostgREST `head`/exact-count queries (no new SQL surface — safest), or a `SECURITY DEFINER` Postgres function (one round-trip, but new security surface)? **Lean: PostgREST count queries first;** add an RPC only if the counts can't be expressed without it — and then with the NP-DL-7 tenant-isolation battery. **Lock during R-FANOUT (np-10).**
**Locked 2026-05-31 (np-10) → PostgREST `count`/`head:true`.** new-patient tiles now count DB-side with no full-row transfer; **no RPC added** (the `doctor_id` gate stays in TypeScript). Cross-tenant parity battery 3/3 green.
**Locked 2026-05-31 → PostgREST `count`/`head` for new_30d/new_7d;** minimal row fetch retained for active_90d + followup_overdue (cross-row logic). No RPC added.

---

## Deferred — explicitly out of scope for this plan

- **NP-D1: Real-time consult transports** (Twilio video/voice, text-session pollers) — their latency profile is separate; not touched here.
- **NP-D2: Bundle-size / code-splitting pass** (e.g. recharts, twilio-video chunking) — a separate perf axis; measure need after Phase 3.
- **NP-D3: Edge/CDN or ISR strategy** — deployment-layer optimization; out of scope.
- **NP-D4: Direct-PG / data-path latency** — **promoted to Phase 4** ([`p4-data-path/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/)). Profiling (R-DB-PROFILE) + fan-out reduction (R-FANOUT) committed (np-09/np-10); direct-PG (R-DB-POOL) profile-gated (NP-Q7). No longer deferred.
- **NP-D5: Service-worker / offline caching** — future.

---

## Risk register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| NP-R1 | Local JWT verify accepts a token it shouldn't (misconfig secret/JWKS) | **High** | Verify `exp`/`aud`/`iss`; fail closed on any verify error; parity test against `getUser()` on a token battery before flip |
| NP-R2 | Audit events lost when moved off hot path (crash/backpressure) | **High** | Bounded durable-ish queue, flush on shutdown, never silently drop; keep failed-auth security events guaranteed (NP-DL-2) |
| NP-R3 | Token revocation delay from skipping `getUser()` | Med | Short access-token TTL; document tradeoff (NP-Q2); optional periodic full refresh; revocation still enforced at token refresh |
| NP-R4 | Cache staleness shows wrong clinical data | **High** | Conservative `staleTime`s; zero-stale for queue/live vitals; invalidate on mutation; never cache write responses |
| NP-R5 | Big-bang cache migration destabilizes many pages | Med | NP-DL-4 incremental adoption; old fetches keep working; migrate per-surface behind review |
| NP-R6 | Dev-only noise (Strict Mode, compile) masks/misattributes results | Med | NP-DL-6 measure in prod build; compare dev vs prod explicitly |
| NP-R7 | Skeletons that don't match final layout cause shift | Low | Build skeletons from the real layout; visual check at common widths |
| NP-R8 | Data-path optimization (RPC / direct-PG / aggregation) leaks rows across tenants | **High** | NP-DL-7: keep per-section `doctor_id` gating; cross-tenant parity battery before flip; no hand-rolled multi-table JOINs |

---

## Cost estimate (per [`process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

Security-sensitive items (R-AUTH-VERIFY, R-AUDIT-ASYNC, and in Phase 4 **R-DB-POOL** + any aggregation RPC under **R-FANOUT** — tenant isolation, NP-DL-7) touch auth/compliance/PHI and warrant a **higher-tier model + careful review**; profiling (R-DB-PROFILE) and the frontend cache/skeleton work are Sonnet-tier. Phase 4 may add a `SECURITY DEFINER` RPC but **no RLS redesign** — NP-DL-7 preserves the existing per-section tenant gating.

| Phase | R-items | Effort (serial) |
|---|---|---|
| Phase 0 — Measure | R-MEASURE | ~0.5–1d |
| Phase 1 — Backend tax | R-AUTH-VERIFY + R-AUDIT-ASYNC | ~2–3.5d |
| Phase 2 — Cache + dedupe | R-QUERY-CACHE + R-DEDUPE-POLL + R-SSR-AUTH | ~4.5–7.5d |
| Phase 3 — Perceived + streaming | R-LOADING-SKELETONS + R-SERVER-FETCH | ~4–6d |
| Phase 4 — Data-path latency | R-DB-PROFILE + R-FANOUT (+ R-DB-POOL if NP-Q7 = go) | ~2.5–5d (+3–5d pooled-PG) |

---

## Plan rules (pre-ship workflow)

1. **Editing this file is welcome under any `Notes:` line.** Don't edit headers, R-IDs, or NP-DL-IDs.
2. **Don't renumber items.** R-IDs and NP-DL-IDs are stable; killed items keep their ID + `[KILLED]` suffix with a one-line reason.
3. **NP-DL-IDs lock on confirmation.** Reopening one requires a `Decision: … [x] Modify` block on the affected R-item with written rationale.
4. **When all Phase 1 R-items have a `Decision:` ticked, this plan promotes to a dated batch** under `docs/Work/Daily-plans/<Month>/<date>/navigation-performance/p{N}-<slug>/` and becomes `Committed`. Later phases promote as sibling `p{N}-` subfolders under the same `navigation-performance/` folder created on the start date. Folder rules: [`process/PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md).
5. **Implementation MUST NOT start until promotion.** R-IDs are decided here; the daily-plans batch derives per-task files from them.
6. **The security/compliance acceptance (NP-DL-2) re-runs at every phase gate that touches auth/audit**, not just at the end.

---

## References

### Code surfaces
- **Backend tax:** [`backend/src/middleware/auth.ts`](../../../backend/src/middleware/auth.ts), [`backend/src/utils/audit-logger.ts`](../../../backend/src/utils/audit-logger.ts), [`backend/src/config/database.ts`](../../../backend/src/config/database.ts).
- **Frontend data layer:** [`frontend/lib/api.ts`](../../../frontend/lib/api.ts), [`frontend/lib/api-base.ts`](../../../frontend/lib/api-base.ts), [`frontend/hooks/useDashboardCounts.ts`](../../../frontend/hooks/useDashboardCounts.ts).
- **Shell + nav:** [`frontend/components/layout/DashboardShell.tsx`](../../../frontend/components/layout/DashboardShell.tsx), [`frontend/components/layout/Sidebar.tsx`](../../../frontend/components/layout/Sidebar.tsx), [`frontend/app/dashboard/layout.tsx`](../../../frontend/app/dashboard/layout.tsx).
- **Waterfall examples:** [`frontend/components/dashboard/cockpit/KpiStrip.tsx`](../../../frontend/components/dashboard/cockpit/KpiStrip.tsx), [`frontend/components/dashboard/cockpit/NowNextCard.tsx`](../../../frontend/components/dashboard/cockpit/NowNextCard.tsx), [`frontend/app/dashboard/patients-v2/%5Bid%5D/page.tsx`](../../../frontend/app/dashboard/patients-v2/%5Bid%5D/page.tsx).

### Process
- [`process/PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md) — promotion / folder rules.
- [`process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier guidance.

---

**Created:** 2026-05-31.  
**Status:** `Shipped (Phases 0–4)` · _Phase 4 = data-path latency shipped (R-DB-PROFILE + R-FANOUT); R-DB-POOL NO-GO (NP-Q7)._  
**Owner:** TBD.  
**Promoted to:** [`Daily-plans/May 2026/31-05-2026/navigation-performance/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/README.md) — Phases 0–4 shipped 2026-05-31 ([`p4-data-path/`](../Daily-plans/May%202026/31-05-2026/navigation-performance/p4-data-path/) results: overview −48%, KPI −57%).  
**Relationship:** Infrastructure/perf foundation beneath the cockpit, OPD, and patient surfaces; no overlap with their feature plans.
