# Task vit-11: Clickable sparkline → per-vital chart popover (with registry reference band)

> **Filename:** `task-vit-11-clickable-sparkline-chart.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Turn each vital's inline sparkline (obj-26) into a **drill-in**: clicking it opens that vital's **full visit
chart** in a popover, reusing the shipped `SingleMetricTrendChart` (`TrendChart.tsx`) with the registry's
advisory `range` drawn as the green reference band, a unit-aware tooltip, and an oldest→newest x-axis by visit.
Read-only; recharts reused; sparse/empty states already handled by the chart shell.

**Program / Phase:** vitals-section · VP4 (per-vital trends)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Update existing** — make `VitalSparkline` clickable → chart popover. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `VitalSparkline.tsx` (inline mini-line, `role=img`); `SingleMetricTrendChart` in `TrendChart.tsx` (reference band, tooltip, sparse states); vit-10 series for all vitals; `components/ui/popover`; the registry advisory `range`.
- ✅ **What's shipped:** `VitalTrendChartPopover` wraps sparkline in keyboard-operable button → popover chart with registry reference band; wired through `VitalsGrid` with patient demographics for age/sex-aware bands.

**Scope Guard:**
- Expected files touched: ≤ 4 (`VitalSparkline` interactivity + a chart-popover wrapper + grid wiring + tests). **No** overview panel (vit-12), **no** new chart component (reuse `SingleMetricTrendChart`), **no** new dependency.
- Keep the inline sparkline's existing look/a11y; add interactivity, don't replace it.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Clickable sparkline
- [x] ✅ 1.1 Wrap the sparkline in a keyboard-operable button (`aria-label` "Open {label} trend"); Enter/Space + click open the popover; preserve the current `role=img` summary for screen readers. - **Completed: 2026-06-21**
- [x] ✅ 1.2 Sparkline-with-0-points stays non-interactive (nothing to chart); 1+ points opens the chart. - **Completed: 2026-06-21**

### 2. Per-vital chart popover
- [x] ✅ 2.1 The popover renders `SingleMetricTrendChart` for that vital's vit-10 series: registry advisory `range` → reference band, unit-aware tooltip, oldest→newest x-axis, title = vital label. - **Completed: 2026-06-21**
- [x] ✅ 2.2 Reuse the chart shell's sparse/single-point states (no bespoke empty handling); read-only — no edit coupling. - **Completed: 2026-06-21**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: click/keyboard opens the chart with the right series + band; 0-point sparkline non-interactive; a11y label present; no payload/write coupling. - **Completed: 2026-06-21**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/objective/VitalSparkline.tsx (unchanged display; wrapped by popover)
CREATE: frontend/components/cockpit/rx/objective/VitalTrendChartPopover.tsx + test
UPDATE: VitalsGrid wiring (pass label + rangeCtx for the band)
DO NOT TOUCH: overview panel (vit-12); buildRxPayload; package.json
```

**When updating existing code:**
- [x] Reuse `SingleMetricTrendChart` + the registry `range`; do not build a new chart.
- [x] Keep the inline sparkline's a11y summary; interactivity is additive.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse the shipped chart shell** + registry advisory band (P6-D2 / V3-D4).
- **Read-only** — never reaches `buildRxPayload` (V3-D5).
- **Keyboard-reachable** drill-in; 0-point sparkline non-interactive.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write** — renders vit-10's read-only series.
  - [x] **RLS verified?** **Yes** — inherits vit-10's doctor-scoped read.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — read-only client render reusing the shipped chart.

---

## ✅ Acceptance & Verification Criteria

- [x] Sparkline is keyboard-operable → opens that vital's chart with registry band + unit tooltip; 0-point non-interactive.
- [x] Reuses `SingleMetricTrendChart`; read-only; no new dependency.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The per-vital payoff: any number in the grid becomes a one-click history with its normal band drawn in — the doctor sees "is this trending toward/away from normal" without leaving the visit.

---

## 🔗 Related Tasks

- [`task-vit-10-extend-trend-series-all-vitals.md`](./task-vit-10-extend-trend-series-all-vitals.md) — provides the series.
- [`task-vit-12-vital-trends-overview.md`](./task-vit-12-vital-trends-overview.md) — the all-vitals overview counterpart.

---

**Last Updated:** 2026-06-21  
**Pattern:** clickable sparkline → reused `SingleMetricTrendChart` + registry reference band.  
**Reference:** `process/CODE_CHANGE_RULES.md`
