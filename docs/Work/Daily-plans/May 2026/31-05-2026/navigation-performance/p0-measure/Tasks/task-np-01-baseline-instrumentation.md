# np-01 · Baseline instrumentation + perf budget

> **Phase 0, step 1** of [navigation-performance](../plan-p0-navigation-performance-measure-batch.md). Captures the before snapshot the whole program is measured against (NP-DL-1), in both dev and a production build (NP-DL-6). **Measurement only — this task changes no request/response behaviour.**

| **Size** | S | **Model** | Sonnet 4.6 | **Wave** | 1 | **Depends on** | — | **Blocks** | np-02, np-03 | **Status** | ✅ DONE |

---

## 📋 Task overview

Produce a committed baseline of how the dashboard performs **today**, so Phases 1–3 can each prove a measurable win and surface regressions. Cover the four daily-driver surfaces: **Today** (`/dashboard`), **OPD** (`/dashboard/opd-today`), **Patients list** (`/dashboard/patients-v2`), and **Patient detail** (`/dashboard/patients-v2/[id]`).

**Change type:** New feature (add measurement tooling only — no change to existing behaviour).

**Current state (verified in code):**
- ✅ The backend already emits per-request `durationMs` (`backend/src/middleware/request-logger.ts`, `request-timing.ts`) — the floor numbers can be read straight from logs; no new backend instrumentation needed.
- ✅ `reactStrictMode: true` (`frontend/next.config.mjs`) — so `next dev` double-invokes effects; this is exactly why a prod-build column is mandatory.
- ✅ Client nav-timing util + committed baseline doc — see [`baseline.md`](../baseline.md) and `frontend/lib/nav-perf/nav-timing.ts`.

**Scope guard:** expected files touched ≤ 3 (a small client nav-timing util + a baseline markdown doc; optionally a throwaway script). Any expansion needs explicit approval.

---

## ✅ Task breakdown (hierarchical)

### 1. Define the metric set + budget
- [x] 1.1 Pin the three metrics: authenticated-request floor (p50/p95 `durationMs`), requests-per-navigation (browser Network count), click→route-first-contentful-paint.
- [x] 1.2 Write the perf budget from the product plan's North-star targets (request floor < ~100ms; instant cached re-nav; skeleton < 100ms).

### 2. Capture the baseline (dev)
- [x] 2.1 For each of the 4 surfaces, record request count + p50/p95 `durationMs` from the backend logs for one cold navigation and one repeat navigation.
- [x] 2.2 Record click→FCP for each surface in `next dev`.

### 3. Capture the baseline (production build) — NP-DL-6
- [x] 3.1 Run `next build && next start`; repeat 2.1–2.2 against the prod build.
- [x] 3.2 Note dev-vs-prod deltas (compile, Strict-Mode double-effects, `<Link>` prefetch) so later phases aren't credited/blamed for dev-only noise.

### 4. Commit the artifact
- [x] 4.1 Write the baseline table (dev + prod columns side by side) into this phase folder (or a `baseline.md` beside this task).
- [x] 4.2 Cross-link it from the product plan's R-MEASURE item and the Phase 1 batch so np-02/np-03 compare against it.

### 5. Verification
- [x] 5.1 `npx tsc --noEmit` clean (frontend + backend).
- [x] 5.2 Confirm `git diff` shows no behavioural change to backend middleware or routes (measurement-only).

---

## 🌍 Global safety gate

- [x] **Data touched?** No (reads timing/metrics only; no patient data read or written).
- [x] **Any PHI in logs?** Must be **No** — capture only durations/counts/correlation IDs; never log request bodies, patient names, or identifiers.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & verification criteria

- [x] Baseline committed for all 4 surfaces with the 3 metrics, in **both** dev and prod build.
- [x] Perf budget written and agreed.
- [x] No request/response semantics changed (instrumentation-only).
- [x] `npx tsc --noEmit` clean.

## 🚫 Anti-goals

- ❌ Don't start any fix (auth, audit, cache, skeletons) — this phase only measures.
- ❌ Don't add heavyweight APM/analytics deps; a thin local timing util + reading existing logs is enough.
- ❌ Don't log any PHI to capture a metric.

---

## 🔗 Related

- **Baseline artifact:** [`../baseline.md`](../baseline.md)
- Next phase (measured against this): [`../../p1-backend-tax/`](../../p1-backend-tax/)
- Product plan R-MEASURE: [`../../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../../Product%20plans/plan-navigation-performance.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
