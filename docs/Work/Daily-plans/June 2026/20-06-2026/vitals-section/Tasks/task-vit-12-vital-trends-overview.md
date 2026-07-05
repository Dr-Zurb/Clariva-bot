# Task vit-12: "Vital trends" overview expander + categorical value-timeline

> **Filename:** `task-vit-12-vital-trends-overview.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

A scan-everything view: a collapsible **"Vital trends"** panel that lists per-vital charts for **only** the
vitals with ≥1 prior reading (skips empties), so a doctor can review a patient's whole vitals history at once.
Categorical vitals (pulse rhythm, AVPU, O₂ delivery method) render a **value-timeline** — chips by visit —
never a misleading line chart. Reuses the vit-10 series + the vit-11 chart; read-only.

**Program / Phase:** vitals-section · VP4 (per-vital trends)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Add component** — a "Vital trends" overview + categorical timeline. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** vit-10 series for all metrics; vit-11 per-vital chart; `CollapsibleContainer`; the P6 "Weight & BMI trends" expander pattern in `VitalsGrid`; the categorical registry (vit-01).
- ✅ **What's shipped:** `VitalTrendsOverviewSection` + `CategoricalVitalTimeline`; grouped overview with numeric charts (vit-11 `VitalTrendChart`) and categorical chip timelines.

**Scope Guard:**
- Expected files touched: ≤ 4 (overview panel + categorical-timeline component + grid wiring + tests). **No** new chart shell (reuse vit-11/`TrendChart`), **no** new dependency, **no** write path.
- Show charts only for numeric vitals with ≥1 reading; categorical → chips; nothing → omit.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Overview panel
- [x] ✅ 1.1 A collapsed "Vital trends" `CollapsibleContainer` (clone the P6 weight/BMI expander) listing per-vital charts **grouped**, for numeric vitals with ≥1 prior reading only; empties omitted; preview = count of vitals with history. - **Completed: 2026-06-21**
- [x] ✅ 1.2 Reuse the vit-11 per-vital chart (registry band + unit tooltip); no bespoke chart. - **Completed: 2026-06-21**

### 2. Categorical value-timeline
- [x] ✅ 2.1 For categorical vitals (rhythm, AVPU, O₂ method, glucose timing) render a **value-timeline** — the value at each visit as labelled chips oldest→newest — never a line chart. - **Completed: 2026-06-21**
- [x] ✅ 2.2 Sparse/0-visit categorical → omit or "no prior readings"; never throws. - **Completed: 2026-06-21**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: overview lists only vitals with history, grouped; numeric → chart, categorical → chips; empties omitted; a11y (expander + chart labels); 0/1-visit graceful. - **Completed: 2026-06-21**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: a "Vital trends" overview panel + a categorical value-timeline component (+ tests)
UPDATE: VitalsGrid (mount the overview, like the P6 weight/BMI expander)
DO NOT TOUCH: new chart shell (reuse vit-11/TrendChart); buildRxPayload; package.json
```

**When updating existing code:**
- [x] Reuse the vit-11 chart + `CollapsibleContainer`; do not fork a chart or an expander.
- [x] Categorical history is a chip timeline, never a line (a line over categories is misleading).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Numeric → chart; categorical → value-timeline** (V3-D4); empties omitted.
- **Reuse** vit-11 chart + `CollapsibleContainer`; recharts reused (P6-D2).
- **Read-only** — never reaches `buildRxPayload` (V3-D5).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write** — renders vit-10's read-only series.
  - [x] **RLS verified?** **Yes** — inherits vit-10's doctor-scoped read.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — read-only render reusing shipped chart + expander.

---

## ✅ Acceptance & Verification Criteria

- [x] "Vital trends" overview lists only vitals with history, grouped; numeric → chart, categorical → chip timeline; empties omitted.
- [x] Read-only; recharts reused; sparse/0-1-visit graceful; a11y holds.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Completes the trend story: the sparkline (vit-11) answers "how is this one vital moving?"; the overview answers "show me everything that has history" in one collapsible — without cluttering the entry grid.

---

## 🔗 Related Tasks

- [`task-vit-11-clickable-sparkline-chart.md`](./task-vit-11-clickable-sparkline-chart.md) — the per-vital chart this lists.
- [`task-vit-06-categorical-context-vitals.md`](./task-vit-06-categorical-context-vitals.md) — the categorical vitals timelined here.

---

**Last Updated:** 2026-06-21  
**Pattern:** P6 weight/BMI expander generalised to an all-vitals overview; categorical chip-timeline.  
**Reference:** `process/CODE_CHANGE_RULES.md`
