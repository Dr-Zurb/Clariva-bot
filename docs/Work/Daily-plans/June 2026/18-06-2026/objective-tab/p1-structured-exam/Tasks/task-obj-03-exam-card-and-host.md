# Task obj-03: `ExamSystemCard` + `ExamSystemList`; rewire `ObjectiveSection`

> **Filename:** `task-obj-03-exam-card-and-host.md` in `objective-tab/p1-structured-exam/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Build the structured-exam UI: an `ExamSystemCard` (tri-state: not examined / normal /
abnormal; one-tap "within normal limits" fills the normal one-liner; "abnormal" reveals the
chip palette + free text + notes) and an `ExamSystemList` (the 5 core cards in registry order
+ a **"mark entire exam normal"** header action). Rewire `ObjectiveSection` to render the
list above the kept (collapsed) general/systemic free-text fallback, leaving `VitalsGrid` and
the test-results textarea untouched. Cards read obj-01's `examFindings` state via the reducer
and obj-02's registry. This is the Objective analog of subjective `subj-02`
(`ComplaintCard`/`ComplaintList`), cloned from the proven `MedicineRow` card pattern.

**Program / Phase:** objective-tab · Phase 1 (structured exam)  
**Batch:** [`plan-p1-objective-tab-structured-exam-batch.md`](../plan-p1-objective-tab-structured-exam-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-objective-tab-structured-exam.md`](./EXECUTION-ORDER-p1-objective-tab-structured-exam.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19

**Change Type:**
- [x] **Update existing** — rewire `ObjectiveSection` (add cards, keep fallback). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`ObjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx) (vitals grid + General/Systemic textareas via `parseExam`/`serializeExam` + test-results textarea + a `details` legacy `vitalsText`); `MedicineRow.tsx` / `ComplaintCard.tsx` (structured-card + chip patterns); obj-01's `examFindings` state + reducer actions; obj-02's `exam-schema.ts`.
- ❌ **What's missing:** any structured exam card UI.

**Scope Guard:**
- Expected files touched: ≤ 4 (`ExamSystemCard.tsx`, `ExamSystemList.tsx`, `ObjectiveSection.tsx`, a component test).
- **No** state/derivation change (obj-01 owns it), **no** registry change (obj-02), **no** vitals change, **no** layout chrome (reorder/collapse — P3).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. ExamSystemCard
- [x] ✅ 1.1 Tri-state status control (not examined / Normal / Abnormal) per system; reads/writes via obj-01 reducer (`CLEAR_EXAM_SYSTEM`, `SET_EXAM_SYSTEM`). - **Completed: 2026-06-19**
- [x] ✅ 1.2 Normal ⇒ `SET_EXAM_SYSTEM` with `status: 'normal'`; shows registry WNL one-liner in card. - **Completed: 2026-06-19**
- [x] ✅ 1.3 Abnormal ⇒ abnormal chip palette (toggle into `findings`) + notes input. - **Completed: 2026-06-19**
- [x] ✅ 1.4 Accessibility: `role="radiogroup"` + `role="radio"` + `aria-checked`; arrow-key navigation; honors `disabled`. - **Completed: 2026-06-19**

### 2. ExamSystemList + host rewire
- [x] ✅ 2.1 `ExamSystemList`: 5 core cards in `listExamSystems()` order; header **Mark entire exam normal** → `MARK_ALL_EXAM_NORMAL`. - **Completed: 2026-06-19**
- [x] ✅ 2.2 `ObjectiveSection`: `ExamSystemList` between vitals and test-results; General/Systemic textareas moved into collapsed **Free-text exam (legacy)** `<details>`. Vitals + test-results untouched. - **Completed: 2026-06-19**

### 3. Verification & Testing
- [x] ✅ 3.1 Component tests: tri-state, WNL, abnormal chips/notes, mark-all-normal, not-examined clear. - **Completed: 2026-06-19**
- [x] ✅ 3.2 a11y tests: arrow-key navigation, `aria-checked`, disabled read-only. - **Completed: 2026-06-19**
- [x] ✅ 3.3 Vitest (20 passed) + eslint clean on touched files. - **Completed: 2026-06-19**

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/inputs/ExamSystemCard.tsx
CREATE: frontend/components/cockpit/rx/inputs/ExamSystemList.tsx
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (host cards + collapse legacy free-text)
CREATE/UPDATE: component test
```

**When updating existing code:** (MANDATORY)
- [ ] Audit `ObjectiveSection` consumers (cockpit panes, any tests) before moving the textareas.
- [ ] Keep the general/systemic free-text working (it feeds obj-01's legacy passthrough) — do not delete it.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- UI-only: all writes go through obj-01's reducer; this task adds **no** derivation and **no** payload logic.
- Reuse the existing card chrome + chip patterns (`MedicineRow`/`ComplaintCard`/`DdxChipList`) — no new primitive.
- No reorder/collapse/visibility (P3); all 5 cards render statically, vitals stays open.
- No PHI in logs; respect `disabled` (read-only consult states).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **N** directly (writes via existing reducer; persistence is obj-01).
- [x] **Any PHI in logs?** **No**.
- [x] **External API or AI call?** **N**.
- [x] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] 5 tri-state cards render in registry order; WNL one-tap + abnormal chips/notes + "mark all normal" work.
- [x] Legacy general/systemic free-text still present (collapsed) and functional; vitals + test-results unchanged.
- [x] a11y passes; tests added; vitest + eslint clean on touched files.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-01-…`](./task-obj-01-data-model-and-derived-contract.md) — owns the state + reducer this UI drives.
- [`task-obj-02-…`](./task-obj-02-exam-system-registry.md) — supplies the systems + normal lines + chips.
- [`task-obj-04-…`](./task-obj-04-derivation-close-gate.md) — verifies output parity after this lands.

---

**Last Updated:** 2026-06-18  
**Pattern:** Subjective `ComplaintCard`/`ComplaintList` (cloned from `MedicineRow`) ported to exam systems.
