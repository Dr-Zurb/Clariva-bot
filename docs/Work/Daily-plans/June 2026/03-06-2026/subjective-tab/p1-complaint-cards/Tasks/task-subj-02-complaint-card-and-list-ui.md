# Task subj-02: `ComplaintCard` + `ComplaintList` UI; rewire `SubjectiveSection`

> **Filename:** `task-subj-02-complaint-card-and-list-ui.md` in `subjective-tab/p1-complaint-cards/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Replace the two raw fields in the Subjective tab with a **reorderable list of complaint
cards**. Each card = one complaint with a collapsed summary line and an expanded editor
(attribute rows fed by subj-03), modeled on the proven `MedicineRow` pattern (drag handle,
collapse, remove). Add an "add complaint" row and a collapsed **free-text fallback** (the
former `hopi` textarea). Narrow-rail friendly (single column).

**Program / Phase:** subjective-tab · Phase 1 (complaint-cards)  
**Batch:** [`plan-p1-subjective-tab-complaint-cards-batch.md`](../plan-p1-subjective-tab-complaint-cards-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md`](./EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md)  
**Estimated Time:** ~3 hours  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **New feature** — new `ComplaintCard` / `ComplaintList` components.
- [x] **Update existing** — `SubjectiveSection` is rewired from two inputs to the list + fallback. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** the two-field [`SubjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx); the card pattern reference [`MedicineRow.tsx`](../../../../../../../../frontend/components/consultation/MedicineRow.tsx) (collapsed-summary vs editor, `GripVertical` drag, remove); the chip pattern [`DdxChipList.tsx`](../../../../../../../../frontend/components/cockpit/rx/inputs/DdxChipList.tsx); subj-01's `complaints` state + reducer actions.
- ❌ **What's missing:** the `ComplaintCard` + `ComplaintList` components; the rewire of `SubjectiveSection`; the free-text fallback affordance.
- ⚠️ **Notes:** the Subjective pane is a ~22% rail in the Consult layout — design collapsed-first, single column.

**Scope Guard:**
- Expected files touched: ≤ 5 (2 new components, `SubjectiveSection.tsx`, the `SubjectivePane` test, 1 new test). The complaint-type attribute vocab is subj-03 — consume its registry, don't author it here.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. `ComplaintCard`
- [x] ✅ 1.1 Build a card with: number badge (priority), complaint name, collapsed summary line (e.g. "2d · severe · throbbing"), expand/collapse, remove. - **Completed: 2026-06-03**
- [x] ✅ 1.2 Expanded editor renders attribute rows (the field set comes from subj-03's registry; default OLDCARTS until 03 lands — render a sensible default set so 02 is testable standalone). - **Completed: 2026-06-03**
- [x] ✅ 1.3 Drag handle for reorder (mirror `MedicineRow`'s `GripVertical`); wire to `REORDER_COMPLAINTS`. - **Completed: 2026-06-03**

### 2. `ComplaintList`
- [x] ✅ 2.1 Render ordered cards from `complaints`; "+ Add complaint" appends a new card via `ADD_COMPLAINT` and focuses its name input. - **Completed: 2026-06-03**
- [x] ✅ 2.2 Empty state: a single add affordance / hint when there are no complaints. - **Completed: 2026-06-03**

### 3. Rewire `SubjectiveSection`
- [x] ✅ 3.1 Replace the CC `<input>` + HOPI `<textarea>` with `<ComplaintList>`. - **Completed: 2026-06-03**
- [x] ✅ 3.2 Add a collapsed **free-text fallback** (`<details>`) housing the legacy `hopi` textarea for non-chippable notes / dictation. - **Completed: 2026-06-03**

### 4. Verification & Testing
- [x] ✅ 4.1 Update the `SubjectivePane` test to the new structure. - **Completed: 2026-06-03**
- [x] ✅ 4.2 New test: add 3 complaints → reorder → edit → remove; autosave fires; collapsed summary reflects fields. - **Completed: 2026-06-03**
- [x] ✅ 4.3 a11y: labels, focus order on add, 44px hit targets; `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/subjective/ComplaintCard.tsx
CREATE: frontend/components/cockpit/rx/subjective/ComplaintList.tsx
CREATE: frontend/components/cockpit/rx/subjective/__tests__/ComplaintList.test.tsx
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (list + fallback)
UPDATE: frontend/components/patient-profile/panes/__tests__ (SubjectivePane structure)
DO NOT TOUCH: RxFormContext reducer (subj-01 owns it), the schema registry (subj-03)
```

**When updating existing code:**
- [x] Audit `SubjectiveSection` callers (the pane + any test) before rewiring — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [x] Remove the obsolete two raw inputs (replaced by the list + fallback), updating their tests.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Mirror `MedicineRow`** — collapsed-summary-vs-editor, drag-to-reorder, remove; consistency + reuse.
- **Narrow-rail first** — single column, collapsed-first; the pane is ~22% wide in Consult.
- **No direct field mutation** — all writes go through subj-01's reducer actions (autosave is wired off that).
- **Free-text fallback precedence** follows the rule subj-01 defines (don't fight the derivation).
- a11y: every input labelled, focus moves to the new card's name on add, decorative icons `aria-hidden`.

**DO NOT include** code or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** (UI only; writes go through existing state — schema owned by subj-01).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Subjective tab renders reorderable complaint cards (add/edit/remove/reorder), collapsed-summary vs editor.
- [x] Free-text fallback present + collapsed; autosave fires on edits.
- [x] Narrow-rail friendly; a11y holds; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The card host. Keep the attribute field-set pluggable so subj-03 can swap OLDCARTS for a
complaint-type-specific set without touching this component's structure.

---

## 🔗 Related Tasks

- [`task-subj-01-data-model-complaints-and-histories.md`](./task-subj-01-data-model-complaints-and-histories.md) — the state this renders.
- [`task-subj-03-complaint-type-attribute-schema.md`](./task-subj-03-complaint-type-attribute-schema.md) — feeds the card's attribute rows.

---

**Last Updated:** 2026-06-03  
**Pattern:** `MedicineRow`-mirrored structured card list.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md`
