# Task obj-29: Trends close-gate (view-only byte-parity + a11y + sparse-data states + verification)

> **Filename:** `task-obj-29-trends-close-gate.md` in `objective-tab/p6-trends/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 6: **prove** that every trend surface (obj-26 sparklines, obj-27 weight/BMI + metric charts,
obj-28 growth charts) is strictly **read-only** — it changes `buildRxPayload` by **zero bytes**, writes no
row, and never reaches the PDF/SMS/snapshot (P6-D1) — that charts read only already-authorized doctor-scoped
data, that no new dependency was added (recharts reused, P6-D2), that a11y holds (chart text/aria descriptions,
keyboard reach, sparse-state announce), and that sparse/single/zero-data states render gracefully. Then run the
verification gate green. Mirrors obj-04 / obj-15 / obj-19 / obj-24.

**Program / Phase:** objective-tab · Phase 6 (trends)  
**Batch:** [`plan-p6-objective-tab-trends-batch.md`](../plan-p6-objective-tab-trends-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-objective-tab-trends.md`](./EXECUTION-ORDER-p6-objective-tab-trends.md)  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ **COMPLETE** (2026-06-20) — close-gate test file (13 assertions) green; P6 trends frontend slice (48) pass; eslint clean on touched file. No source drift — the gate held with tests only (fixture DOB adjusted so pediatric measurements fall within the 60-month reference cap).

**Change Type:**
- [x] **Add tests + verify** — close-gate fixtures + the phase verification gate. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **Shipped:** obj-25..28 contracts + [`objectiveTrendsParity.test.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/__tests__/objectiveTrendsParity.test.tsx) (13 assertions: view-only byte-parity, read-scope, sparse/empty, a11y); batch plan gate ticked; Phase 6 marked complete in README + product plan.

**Scope Guard:**
- Expected files touched: ≤ 2 (a new `objectiveTrendsParity.test.tsx` + any tiny a11y/sparse-state fix the gate surfaces). **No** feature work — if a real source fix is needed beyond a one-line a11y/empty-state tweak, surface it.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. View-only byte-parity (P6-D1)
- [x] ✅ 1.1 Assert `buildRxPayload` is **byte-identical** with and without any trend surface rendered (sparkline / chart / growth chart) — trends never change the payload. - **Completed: 2026-06-20**
- [x] ✅ 1.2 Assert no trend surface writes a row or reaches the PDF/SMS/snapshot reads; charts consume only the read-only series. - **Completed: 2026-06-20**

### 2. No-new-dependency + read-scope (P6-D2)
- [x] ✅ 2.1 Confirm recharts reused, no new package added; trends read only already-authorized doctor-scoped data (no new endpoint/widened read). - **Completed: 2026-06-20**

### 3. a11y + sparse-data sweep (P6-D4/P6-D6)
- [x] ✅ 3.1 Sparklines + charts have text/aria descriptions + accessible labels; keyboard-reachable; degrade to a readable summary. - **Completed: 2026-06-20**
- [x] ✅ 3.2 0/1/sparse-point data renders gracefully across all surfaces (no throw, no misleading line); empty states announced. - **Completed: 2026-06-20**

### 4. Verification gate
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green; pre-existing unrelated failures routed (not introduced). - **Completed: 2026-06-20**
- [x] ✅ 4.2 Mark obj-29 + the batch plan + program README done. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/.../__tests__/objectiveTrendsParity.test.tsx
UPDATE: (only if the gate surfaces a tiny a11y/empty-state fix) the relevant trend component
DO NOT TOUCH: feature scope — obj-25..28 land the surfaces; this proves them
```

**When updating existing code:**
- [x] This is a proof/gate task — prefer tests over source changes; surface any real fix beyond a one-line a11y/empty-state tweak.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Trends are view-only; zero `buildRxPayload` impact; no write; no PDF/SMS/snapshot change (P6-D1).**
- **No new dependency; read-only doctor-scoped data (P6-D2).**
- **Graceful sparse/empty states + a11y (P6-D4/P6-D6).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — proof + verification only.
  - [x] **RLS verified?** **Yes** — re-confirms trends reuse the shipped doctor-scoped read.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **Opus-grade:** the parity/verification slice (like obj-04/obj-15/obj-19/obj-24) — maximum care proving the view-only contract holds, even though it ships no schema.

---

## ✅ Acceptance & Verification Criteria

- [x] `buildRxPayload` byte-identical with/without any trend surface; no row written; PDF/SMS/snapshot unchanged.
- [x] No new dependency; charts read only authorized doctor-scoped data; a11y + sparse-data states pass.
- [x] `frontend` tsc/lint/test + `backend` test green for the slice; phase docs marked done.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The cheapest close-gate in the program to *pass* (no schema to round-trip) but the most important to *prove*: trends touch the highest-traffic surface (vitals) and must demonstrably never leak into the patient-facing derived output. Direct analog of obj-04 / obj-15 / obj-19 / obj-24.

---

## 🔗 Related Tasks

- [`task-obj-24-poc-results-close-gate.md`](../../p5-poc-results-media/Tasks/task-obj-24-poc-results-close-gate.md) — the P5 close-gate this mirrors.
- [`task-obj-25-trend-data-foundation.md`](./task-obj-25-trend-data-foundation.md) — the read-only substrate proven here.

---

**Last Updated:** 2026-06-20  
**Pattern:** view-only byte-parity + a11y + sparse-data close-gate (mirror obj-04/obj-15/obj-19/obj-24).  
**Reference:** `process/CODE_CHANGE_RULES.md`
