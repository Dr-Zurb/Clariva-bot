# Task obj-26: Vital sparklines (inline last-N mini-trend per `VitalsGrid` field)

> **Filename:** `task-obj-26-vital-sparklines.md` in `objective-tab/p6-trends/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Render an inline **sparkline** beside each `VitalsGrid` field — a compact `recharts` mini-line of that vital's
recent values (last N visits, **default 5** per P6-D4) — extending P2's single *last-visit ghost value* into a
recent-history glance. Consumes the obj-25 series; writes nothing. Sparse data (0/1 points) renders a graceful
empty/single-dot state, never an error and never a misleading connecting line.

**Program / Phase:** objective-tab · Phase 6 (trends)  
**Batch:** [`plan-p6-objective-tab-trends-batch.md`](../plan-p6-objective-tab-trends-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-objective-tab-trends.md`](./EXECUTION-ORDER-p6-objective-tab-trends.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **Complete** (2026-06-20)

**Change Type:**
- [x] **Update existing** — add a sparkline affordance to `VitalsGrid`. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-25's per-vital series + hook; `VitalsGrid` + the P2 last-visit ghost-value affordance; `recharts` (already a dependency).
- ✅ **What's shipped (obj-26):** `VitalSparkline` component; wired into `VitalsGrid` + `VitalsExtended` via `useVitalsTrendsQuery`.

**Scope Guard:**
- Expected files touched: ≤ 4 (a `VitalSparkline` component + its test; `VitalsGrid` wiring; minor style). **No** expandable detail chart (obj-27), **no** growth charts (obj-28), **no** new dependency.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Sparkline component
- [x] ✅ 1.1 A `VitalSparkline` rendering the last-N points of one metric's obj-25 series as a `recharts` mini-line (no axes/labels — compact glance). - **Completed: 2026-06-20**
- [x] ✅ 1.2 Sparse-data states: 0 points → nothing/placeholder; 1 point → a single dot (no line); ≥2 → the mini-line. Never throws. - **Completed: 2026-06-20**

### 2. Wire into `VitalsGrid`
- [x] ✅ 2.1 Place the sparkline beside the relevant fields, extending (not replacing) the P2 ghost value; default N = 5 (P6-D4). - **Completed: 2026-06-20**
- [x] ✅ 2.2 Read-only — no input/write coupling; degrade cleanly for patients with one visit. - **Completed: 2026-06-20**

### 3. Verification & Testing
- [x] ✅ 3.1 Unit test: 0/1/many-point series render the right state; correct last-N slice; a11y label/description present. - **Completed: 2026-06-20**
- [x] ✅ 3.2 `frontend tsc` + lint clean on touched files; targeted vitest green. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/objective/VitalSparkline.tsx + its test
UPDATE: VitalsGrid (mount sparkline beside fields; keep P2 ghost value)
DO NOT TOUCH: buildRxPayload / write paths; obj-27 detail chart; obj-28 growth charts; package.json
```

**When updating existing code:**
- [x] Read-only render only (P6-D1); reuse obj-25's series + the existing `recharts` dependency (P6-D2).
- [x] Sparse/single/zero-point states render gracefully (P6-D4/P6-D6).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Inline sparkline = last-N (default 5); full chart on expand (P6-D4).**
- **No new package — recharts reused (P6-D2).**
- **Read-only; never reaches `buildRxPayload` (P6-D1).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No write** — renders obj-25's read-only series.
  - [x] **RLS verified?** **Yes** — inherits obj-25's doctor-scoped read.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — read-only client render, no schema/server change.

---

## ✅ Acceptance & Verification Criteria

- [x] Each relevant `VitalsGrid` field shows an inline last-N sparkline; sparse/single/zero data renders gracefully.
- [x] No new dependency; no write; `tsc`/lint/tests green for the slice.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The smallest visible payoff of the phase — turns each numeric vital into a glanceable recent trend without leaving the grid. Builds straight on P2's ghost value.

---

## 🔗 Related Tasks

- [`task-obj-25-trend-data-foundation.md`](./task-obj-25-trend-data-foundation.md) — provides the series.
- [`task-obj-27-weight-bmi-trend-chart.md`](./task-obj-27-weight-bmi-trend-chart.md) — the expandable detail counterpart.

---

**Last Updated:** 2026-06-20  
**Pattern:** read-only `recharts` sparkline over a frozen per-vital series; extends the P2 ghost value.  
**Reference:** `process/CODE_CHANGE_RULES.md`
