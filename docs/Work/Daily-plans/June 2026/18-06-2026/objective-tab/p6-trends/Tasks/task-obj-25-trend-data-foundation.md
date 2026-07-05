# Task obj-25: Trend data foundation (read-only per-vital time-series selector + query hook)

> **Filename:** `task-obj-25-trend-data-foundation.md` in `objective-tab/p6-trends/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Give Phase 6 its substrate: a **read-only** selector that projects the already-captured per-visit vitals
history (`prescriptions.vitals_*` over `created_at`, per patient) into a typed **per-vital time series**
(`{ metric, unit, points: { value, at }[] }`), tolerant of null/sparse rows + unit normalization, plus a thin
**query hook** that wraps the **shipped** doctor-scoped per-patient prescription read
([`listPrescriptionsByPatient`](../../../../../../../../backend/src/services/prescription-service.ts)).
This is the pure data layer — **no chart, no sparkline, no UI** (those are obj-26/27/28). It adds **no
schema, no column, no migration, and no new server surface** (P6-D1): it only *reads* what P2 already persists.

**Program / Phase:** objective-tab · Phase 6 (trends)  
**Batch:** [`plan-p6-objective-tab-trends-batch.md`](../plan-p6-objective-tab-trends-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-objective-tab-trends.md`](./EXECUTION-ORDER-p6-objective-tab-trends.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **Complete** (2026-06-20)

**Change Type:**
- [x] **Update existing / add helper** — a new read-only transform + query hook over the shipped per-patient read. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** per-visit vitals columns on `prescriptions` (migrations 103 + 151) + `created_at`; the doctor-scoped per-patient read `listPrescriptionsByPatient`; P2's BMI/unit derivation in `frontend/lib/cockpit/vitals-derive.ts`; the frontend query-hook + query-keys pattern.
- ✅ **What's shipped (obj-25):** `frontend/lib/cockpit/vitals-trends.ts` (transform + helpers); `frontend/hooks/queries/useVitalsTrendsQuery.ts`; `queryKeys.patient(id).vitalsTrends()`.

**Scope Guard:**
- Expected files touched: ≤ 4 (a trend-series transform helper + its test; a query hook; query-keys entry). **No** chart/sparkline UI (obj-26/27/28), **no** new endpoint, **no** schema/migration, **no** write path.
- If the existing per-patient read does not already return all needed vitals columns, prefer widening its `select` minimally over adding a new endpoint — surface the choice before expanding scope.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Trend-series transform (pure)
- [x] ✅ 1.1 A pure helper that takes the per-patient prescription list (vitals + `created_at`) and returns a typed per-vital series `{ metric, unit, points: { value, at }[] }`, sorted oldest→newest, dropping null/absent values per metric. - **Completed: 2026-06-20**
- [x] ✅ 1.2 Reuse P2's `vitals-derive.ts` for derived metrics (BMI from wt/ht; canonical units) — do not re-derive; sparse rows (missing one vital) keep other metrics' points. - **Completed: 2026-06-20**

### 2. Query hook (read-only)
- [x] ✅ 2.1 A hook wrapping the **existing** doctor-scoped per-patient read (no new endpoint); returns the projected series + loading/empty state; reuses `lib/query/keys.ts`. - **Completed: 2026-06-20**
- [x] ✅ 2.2 No write, no mutation; tolerant of 0/1-visit patients (returns empty/single-point series, never throws). - **Completed: 2026-06-20**

### 3. Verification & Testing
- [x] ✅ 3.1 Unit test the transform: multi-visit → ordered series; missing vitals dropped per metric; BMI derived; 0/1-point inputs return graceful empty/single series. - **Completed: 2026-06-20**
- [x] ✅ 3.2 `frontend tsc` + lint clean on touched files; targeted vitest green; pre-existing unrelated noise routed. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/vitals-trends.ts (per-vital series transform) + its test
CREATE/UPDATE: a read-only query hook over listPrescriptionsByPatient + lib/query/keys.ts entry
DO NOT TOUCH: buildRxPayload / write paths; chart + sparkline UI (obj-26/27/28); any migration/schema
```

**When updating existing code:**
- [x] Read-only only — never write a row, never touch `buildRxPayload` (P6-D1).
- [x] Reuse the shipped per-patient read + P2 derivation; do not fork a new data path or charting style.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Trends are read-only views; no schema, no new server surface (P6-D1).**
- **Visit-derived series, not a new vitals store (P6-D5).**
- **Graceful with sparse data (P6-D4/P6-D6)** — 0/1 points never error.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write** — read-only projection of existing per-visit vitals.
  - [x] **RLS verified?** **Yes** — reuses the shipped doctor-scoped per-patient read; no widening.
- [x] **Any PHI in logs?** **No** — never log vital values.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — derives from existing prescription rows.

> **No STOP/Opus gate:** no migration, no new column, no new server surface, no write — Sonnet-grade.

---

## ✅ Acceptance & Verification Criteria

- [x] Selector projects the per-patient prescription history into a typed per-vital series (value + unit + timestamp), tolerant of null/sparse rows, reusing P2 derivation.
- [x] Hook reuses the shipped doctor-scoped read; adds no endpoint/column/migration; returns empty/single-point series gracefully.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Direct analog of the other "foundation" tasks (obj-01 / obj-20) but **read-only** — it freezes the series shape so obj-26 (sparklines), obj-27 (BMI chart), and obj-28 (growth charts) plug onto a stable projection without each re-deriving the history.

---

## 🔗 Related Tasks

- [`task-obj-26-vital-sparklines.md`](./task-obj-26-vital-sparklines.md) — first consumer of the series.
- P2 vitals derivation ([`p2-vitals-2/`](../../p2-vitals-2/)) — the BMI/unit helpers reused here.

---

**Last Updated:** 2026-06-20  
**Pattern:** read-only time-series projection over the shipped per-patient prescription read; no schema, no server surface.  
**Reference:** `process/CODE_CHANGE_RULES.md`
