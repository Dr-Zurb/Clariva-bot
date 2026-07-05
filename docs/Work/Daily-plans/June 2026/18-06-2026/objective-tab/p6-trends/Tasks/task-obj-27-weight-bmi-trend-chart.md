# Task obj-27: Weight / BMI trend chart (expandable detail chart + reusable chart shell)

> **Filename:** `task-obj-27-weight-bmi-trend-chart.md` in `objective-tab/p6-trends/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Build the first **expandable detail trend chart** — weight + derived BMI over the patient's visit history —
as a **reusable `recharts` chart shell** (accessible axes, labels, range, tooltip) so BP / HR / SpO₂ / glucose
detail trends reuse the same shell instead of each reinventing a chart. Consumes obj-25's series; read-only.

**Program / Phase:** objective-tab · Phase 6 (trends)  
**Batch:** [`plan-p6-objective-tab-trends-batch.md`](../plan-p6-objective-tab-trends-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-objective-tab-trends.md`](./EXECUTION-ORDER-p6-objective-tab-trends.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **Complete** (2026-06-20)

**Change Type:**
- [x] **Add component** — a reusable trend-chart shell + the weight/BMI instance. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-25's series + hook; obj-26's sparkline; `recharts`; the Objective section host (`ObjectiveSection.tsx`) for the expand affordance; P2 BMI derivation.
- ✅ **What's shipped (obj-27):** `TrendChart` reusable shell + `SingleMetricTrendChart`; `WeightBmiTrendChart`; collapsed expand in `VitalsGrid`.

**Scope Guard:**
- Expected files touched: ≤ 4 (a `TrendChart` shell + the weight/BMI instance + test; the expand wiring). **No** growth charts (obj-28), **no** new dependency, **no** write path.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Reusable chart shell
- [x] ✅ 1.1 A `TrendChart` shell taking a metric series → `recharts` line/area with labelled axes, units, tooltip, and accessible description; sparse/single-point states render gracefully. - **Completed: 2026-06-20**
- [x] ✅ 1.2 Parameterized per metric so BP/HR/SpO₂/glucose reuse it (instances are thin). - **Completed: 2026-06-20**

### 2. Weight / BMI instance + expand
- [x] ✅ 2.1 A weight + derived-BMI instance; expandable from the vitals area (mirror an existing expand/disclosure affordance, do not invent). - **Completed: 2026-06-20**
- [x] ✅ 2.2 Read-only; degrade cleanly for sparse history. - **Completed: 2026-06-20**

### 3. Verification & Testing
- [x] ✅ 3.1 Unit test: shell renders axes/labels/units; weight/BMI instance plots the series; sparse states graceful; a11y description present. - **Completed: 2026-06-20**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/objective/TrendChart.tsx (reusable shell) + WeightBmiTrend instance + tests
UPDATE: vitals/objective host (expand affordance)
DO NOT TOUCH: buildRxPayload / write paths; obj-28 growth charts; package.json
```

**When updating existing code:**
- [x] Read-only render (P6-D1); reuse `recharts` (P6-D2); build the shell reusable so obj-28 + future metric trends inherit it.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Full chart on expand (P6-D4); reusable shell (DRY across metrics).**
- **No new package — recharts reused (P6-D2).**
- **Read-only; zero `buildRxPayload` impact (P6-D1).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write** — renders obj-25's read-only series.
  - [x] **RLS verified?** **Yes** — inherits obj-25's doctor-scoped read.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — read-only client render.

---

## ✅ Acceptance & Verification Criteria

- [x] A reusable `TrendChart` shell renders accessible axes/labels/units; the weight/BMI instance plots the full range; sparse data graceful.
- [x] No new dependency; no write; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The chart shell here is deliberately reusable so obj-28 (growth charts) and any later metric trend ride it rather than forking a second charting style.

---

## 🔗 Related Tasks

- [`task-obj-25-trend-data-foundation.md`](./task-obj-25-trend-data-foundation.md) — the series source.
- [`task-obj-28-pediatric-growth-charts.md`](./task-obj-28-pediatric-growth-charts.md) — reuses this chart shell.

---

**Last Updated:** 2026-06-20  
**Pattern:** reusable read-only `recharts` chart shell over the per-vital series.  
**Reference:** `process/CODE_CHANGE_RULES.md`
