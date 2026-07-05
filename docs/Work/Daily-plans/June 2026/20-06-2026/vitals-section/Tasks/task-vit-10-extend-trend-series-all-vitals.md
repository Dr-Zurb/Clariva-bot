# Task vit-10: Extend trend series to all vitals (storage-aware read)

> **Filename:** `task-vit-10-extend-trend-series-all-vitals.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Make the P6 trend substrate cover the **whole catalog**. Today `buildVitalsTrendSeries`
(`frontend/lib/cockpit/vitals-trends.ts`) reads a fixed column map for the original 14 vitals. Extend it to be
**storage-aware** — read a vital's per-visit value from its column **or** from `vitals_json` per the registry's
`storage` flag — so every numeric vital produces a `{ metric, unit, points: { value, at }[] }` series. Pure,
read-only, no chart UI. The series shape is unchanged; only its coverage grows.

**Program / Phase:** vitals-section · VP4 (per-vital trends)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Update existing** — make `buildVitalsTrendSeries` registry/storage-driven. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `vitals-trends.ts` (`buildVitalsTrendSeries`, `indexVitalsTrendSeries`, `getVitalTrendSeries`) over a fixed `PRESCRIPTION_VITAL_COLUMN` map + derived BMI/MAP/BSA; vit-03 `vitals_json` on the read; vit-01 registry `storage` flag.
- ✅ **What's shipped:** json-backed vitals project into series via `readStoredVitalValue` (registry `storage` flag); `ALL_METRICS` covers full catalog + derived metrics.

**Scope Guard:**
- Expected files touched: ≤ 2 (`vitals-trends.ts` + its test). **No** chart/sparkline UI (vit-11/12), **no** new endpoint, **no** write path; keep derived BMI/MAP/BSA as-is.
- The per-patient read (`listPrescriptionsByPatient`) must already return `vitals_json` (vit-03) — if not, surface it, don't widen blindly.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Storage-aware read
- [x] ✅ 1.1 Replace the fixed column map with a registry-driven read: for each numeric vital, pull its per-visit value from the column (`storage: "column"`) or from `vitals_json` (`storage: "json"`); skip null/absent per metric (P6-D4/D6). - **Completed: 2026-06-21**
- [x] ✅ 1.2 Keep derived BMI/MAP/BSA series exactly as today; `ALL_METRICS` grows to include the new numeric vitals; units from the registry. - **Completed: 2026-06-21**

### 2. Stability
- [x] ✅ 2.1 `indexVitalsTrendSeries` / `getVitalTrendSeries` return a stable shape for every catalog metric (empty series when no data); never throws on sparse/legacy rows. - **Completed: 2026-06-21**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: a json-backed vital across visits projects an ordered series; column vitals unchanged; sparse rows keep other metrics; 0/1-visit graceful. - **Completed: 2026-06-21**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green; existing trends tests still pass. - **Completed: 2026-06-21** (lint clean; vitest 13/13 + parity suites green; pre-existing unrelated `tsc` errors elsewhere)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/vitals-trends.ts (storage-aware read over the registry)
UPDATE: its test (add json-backed coverage)
DO NOT TOUCH: chart/sparkline UI (vit-11/12); write paths; buildRxPayload; backend read shape
```

**When updating existing code:**
- [x] Read-only; reuse derived helpers; do not fork a new series shape.
- [x] Drive column-vs-json off the registry `storage` flag (single source).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Read-only projection** — no write, no `buildRxPayload` touch (P6-D1 / V3-D5).
- **Storage-aware via the registry** — never hardcode which vitals are json.
- **Sparse/legacy tolerant** — 0/1 points, missing json keys, legacy rows all graceful.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write** — read-only projection over the existing per-patient read.
  - [x] **RLS verified?** **Yes** — reuses the shipped doctor-scoped read (now incl. `vitals_json` via vit-03).
- [x] **Any PHI in logs?** **No** — never log vital values.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — read-only transform extension; no schema/server change.

---

## ✅ Acceptance & Verification Criteria

- [x] Every numeric vital (column + json) projects a series via the registry `storage` flag; derived metrics unchanged.
- [x] Stable shape for all metrics; sparse/legacy/0-1-visit graceful.
- [x] `tsc`/lint/tests green; existing trends tests pass.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The smallest change with the widest reach: flip one read from a fixed map to a registry-driven, storage-aware lookup and every catalogued vital instantly has trend data for the sparkline (vit-11) and overview (vit-12).

---

## 🔗 Related Tasks

- [`task-vit-01-storage-agnostic-vitals-registry.md`](./task-vit-01-storage-agnostic-vitals-registry.md) — the `storage` flag this reads.
- [`task-vit-11-clickable-sparkline-chart.md`](./task-vit-11-clickable-sparkline-chart.md) — first consumer of the widened series.

---

**Last Updated:** 2026-06-21  
**Pattern:** extend the P6 `vitals-trends.ts` projection to be registry/storage-aware; shape unchanged.  
**Reference:** `process/CODE_CHANGE_RULES.md`
