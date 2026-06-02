# np-09 · Profile the data-path floor (measure-first; attribute RTT vs PostgREST vs round-trips)

> **Phase 4, Wave 1** of [navigation-performance](../plan-p4-navigation-performance-data-path-batch.md). Pure measurement (product-plan R-DB-PROFILE / NP-DL-1): attribute the residual cold floor — ~484 ms trivial-GET (Phase-1 finding) and ~2.5 s patient-overview — into **network RTT vs PostgREST/connection overhead vs round-trip count**, per hot endpoint, so np-10 fixes the right thing and **NP-Q7** (direct-PG go/no-go) is decided from evidence.

| **Size** | S | **Model** | Sonnet 4.6 | **Wave** | 1 | **Depends on** | Phases 1–3 shipped | **Blocks** | np-10 (+ gates np-11) | **Status** | ✅ DONE |

---

## 📋 Task overview

Phases 1–3 are done; the remaining cold latency **is** the database path. We don't yet know *why* a trivial authenticated GET costs ~484 ms — it could be (a) cross-region network RTT, (b) PostgREST/connection overhead, or (c) genuine query time — and the right Phase-4 lever differs for each. This task **measures and attributes** the floor and emits a ranked recommendation. It changes **no behaviour**.

**Change type:** **Measurement / investigation only** (temporary instrumentation + a results doc). MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) for any temporary timing code (remove or guard before merge).

**Verified starting facts (from code):**
- The data layer is **100% Supabase REST (PostgREST over HTTPS)** via `@supabase/supabase-js`; **no `pg`/`postgres.js` driver exists** (`backend/src/config/database.ts`). So "direct-PG" would be net-new.
- `getPatientOverview` (`backend/src/services/patient-overview-service.ts`) runs **~4 sequential Supabase waves**: `findPatientByIdWithAdmin` → `Promise.all[appointment + conversation checks]` → `Promise.all[6 sections]` → `fetchPaymentEvents`.
- `computePatientsKpis` fetches **all** doctor appointments + follow-up prescriptions and counts them **in JS** (behind a 60 s LRU).
- Baseline (`../../p0-measure/baseline.md`): patient detail ~10 GETs/nav, cockpit ~9; Phase-1 (`../../p1-backend-tax/p1-measurement-results.md`): trivial-GET floor ~484 ms p50 after the auth tax was removed.

**Deliverable:** [`../p4-measurement-results.md`](../p4-measurement-results.md)

---

## ✅ Task breakdown (hierarchical)

### 1. Inventory the hot read paths
- [x] 1.1 List the endpoints on the daily-driver navs (cockpit home, patients list, patient detail, opd-today) and, per endpoint, the **count of Supabase round-trips** and whether they're **serial or parallel** (read the controllers/services; `patient-overview-service.ts` is the worst case).
- [x] 1.2 Note payload sizes for the count-heavy endpoints (KPIs pull full row sets).

### 2. Attribute the per-call floor (the key question)
- [x] 2.1 From the **API host** (prod-like, NP-DL-6), time three probes against Supabase: (a) a trivial single-row `select … limit 1`, (b) a `head:true, count:'exact'` count, (c) a slightly larger select — to separate **fixed RTT/connection** from **payload/query** cost.
- [x] 2.2 Determine **region locality**: the Supabase project region vs where the API runs. A cross-region round-trip is the single biggest, cheapest-to-fix RTT contributor.
- [x] 2.3 Instrument `getPatientOverview` to record **per-wave** wall-time (wave A findPatient, wave B ownership, wave C 6 sections, wave D payments) so the serial-waterfall cost is explicit. Timings only — **no PHI** in the logs (log durations + row counts, never row contents).

### 3. Profile the aggregators
- [x] 3.1 Capture p50/p95 server time for patient-overview and the patients-KPI endpoint (cold, prod build).
- [x] 3.2 Confirm the KPI JS-counting payload size (how many rows transferred to count) so np-10 can quantify the DB-side-count win.

### 4. Record results + rank levers (the deliverable)
- [x] 4.1 Write `p4-measurement-results.md` (sibling of this Tasks/ folder, in `p4-data-path/`) with: the per-endpoint round-trip table, the RTT-vs-PostgREST-vs-query attribution, and region locality.
- [x] 4.2 **Rank the levers** for np-10/np-11 and **resolve NP-Q7** using the product-plan decision rule: PostgREST/connection overhead dominates → recommend direct-PG (np-11); cross-region RTT dominates → recommend **co-location** (infra, skip direct-PG); round-trip count dominates → R-FANOUT (np-10) alone likely suffices.
- [x] 4.3 Remove or feature-guard any temporary timing instrumentation.

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Read-only timing of existing queries. No writes, no schema, no contract change.
- [x] **Any PHI in logs / serialized state?** **Hard rule:** temporary instrumentation logs **durations + row counts only** — never patient field values. Strip before merge.
- [x] **External API or AI call?** No — only the existing Supabase reads, timed.
- [x] **Retention / deletion impact?** None.

---

## ✅ Acceptance & verification criteria

- [x] `p4-measurement-results.md` attributes the ~484 ms trivial-GET **and** the ~2.5 s patient-overview into RTT / PostgREST overhead / round-trip count, per hot endpoint, in a prod build (NP-DL-6).
- [x] Region locality (API ↔ Supabase) stated explicitly.
- [x] Per-wave timing for `getPatientOverview` recorded (which waves dominate).
- [x] A **ranked lever recommendation** + a written **NP-Q7 resolution** (go/no-go on direct-PG, or co-locate).
- [x] No production behaviour change; temporary instrumentation removed/guarded; `tsc`/typecheck clean.

## 🚫 Anti-goals

- ❌ Don't fix anything here — no parallelizing, no RPC, no direct-PG. That's np-10/np-11.
- ❌ Don't log PHI in timing instrumentation.
- ❌ Don't draw lever conclusions from `next dev` numbers (NP-DL-6 — prod only).
- ❌ Don't change endpoints/shapes/routes.

## ⚠️ Risks

- **Mis-attribution → wrong lever.** If RTT and query time aren't separated, np-10/np-11 could optimize the wrong thing → the three-probe method (2.1) + region check (2.2) exist to prevent this.
- **Dev-build noise.** `next dev` / cold serverless inflate timings → measure prod-like (NP-DL-6).
- **Instrumentation left in.** Temporary timers must be removed/guarded (4.3) so they don't ship.

## 📝 Notes (design / approach)

- **This is the NP-DL-1 gate for Phase 4.** The phase's whole credibility rests on changing the data path *from evidence*. The cheapest possible outcome is "the API is cross-region from Supabase" — in which case co-location beats a multi-day direct-PG build, and np-11 never promotes.
- **No PG driver today.** Keep that in mind when ranking: direct-PG (np-11) is net-new dependency + connection-pool + a tenant-isolation surface (NP-DL-7), so it must clear a real bar in the numbers, not a marginal one.

---

## 🔗 Related

- Blocks: [`task-np-10-fanout-reduction.md`](./task-np-10-fanout-reduction.md) (consumes this profile)
- Baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md) · Phase-1 finding: [`../../p1-backend-tax/p1-measurement-results.md`](../../p1-backend-tax/p1-measurement-results.md)
- Product plan (R-DB-PROFILE, NP-Q7): [`../../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../../Product%20plans/plan-navigation-performance.md)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
