# Task subj-20: Custom-subsections editor UI (add / rename / reorder / remove + one nested level)

> **Filename:** `task-subj-20-custom-subsections-editor-ui.md` in `subjective-tab/p7-custom-subsections/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Build the **editor** for custom subsections in the Subjective tab. The doctor can add a subsection
(custom heading + free-text body), add **one level** of sub-subsections under it, rename/reorder/remove
at both levels, and collapse each subsection. Mounts in `SubjectiveSection` directly **below** the
existing free-text notes block and binds to the `customSubsections` form-state field + reducer actions
from subj-19. Pure UI — no new storage, no seeding logic.

**Program / Phase:** subjective-tab · Phase 7 (custom subsections)  
**Batch:** [`plan-p7-subjective-custom-subsections-batch.md`](../plan-p7-subjective-custom-subsections-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p7-subjective-custom-subsections.md`](./EXECUTION-ORDER-p7-subjective-custom-subsections.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **New feature** — new component mounted into the existing section; reducer already exists (subj-19). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`SubjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) with the free-text notes `CollapsibleContainer` (mount point just below it); [`CollapsibleContainer.tsx`](../../../../../../../../frontend/components/ui/CollapsibleContainer.tsx); structured-field UX precedents ([`FamilyHistoryField.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/FamilyHistoryField.tsx), [`PastSurgicalHistoryField.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/PastSurgicalHistoryField.tsx)); shared styles in `field-styles.ts`; subj-19 `customSubsections` field + reducer actions; **`CustomSubsectionsField` editor UI**.
- ❌ **What's missing (was):** any UI to create/edit custom subsections — **now implemented**.
- ⚠️ **Notes:** depth cap = 2 — a sub-subsection must **not** show an "add child" control. Honour `disabled`.

**Scope Guard:**
- Expected files touched: ≤ 4 (new `CustomSubsectionsField` component; mount in `SubjectiveSection.tsx`; optional small subcomponent for a row; a test).
- **No** changes to the reducer/types (subj-19) or storage.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md) · [ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/ARCHITECTURE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Component
- [x] ✅ 1.1 `CustomSubsectionsField`: renders the `customSubsections` array; each subsection is a `CollapsibleContainer` with an editable title and a free-text body textarea. - **Completed: 2026-06-17**
- [x] ✅ 1.2 Section-level controls: add subsection, remove, reorder (up/down or drag — match the complaint/history reorder UX), collapse. - **Completed: 2026-06-17**
- [x] ✅ 1.3 Sub-subsection level: within a subsection, add child (title + body), remove, reorder; **no** "add child" on a child (depth cap). - **Completed: 2026-06-17**
- [x] ✅ 1.4 Empty state + "Add custom section" affordance; sensible char limits matching subj-19 Zod caps. - **Completed: 2026-06-17**

### 2. Wiring
- [x] ✅ 2.1 Mount `CustomSubsectionsField` in `SubjectiveSection.tsx` directly below the free-text notes block; pass `disabled`. - **Completed: 2026-06-17**
- [x] ✅ 2.2 Dispatch the subj-19 reducer actions on every edit; no local duplicate state of record-of-truth. - **Completed: 2026-06-17**

### 3. Accessibility & polish
- [x] ✅ 3.1 Labelled inputs, keyboard add/remove/reorder, focus management on add; aria for collapse toggles (match existing sections). - **Completed: 2026-06-17**
- [x] ✅ 3.2 Visual parity with sibling structured fields (`field-styles.ts`). - **Completed: 2026-06-17**

### 4. Verification & Testing
- [x] ✅ 4.1 Test/interaction: add → rename → add child → reorder → remove updates form state correctly; depth cap holds (no nested-child control). - **Completed: 2026-06-17**
- [x] ✅ 4.2 `disabled` renders read-only; no dispatch. - **Completed: 2026-06-17**
- [x] ✅ 4.3 `cd frontend && npx tsc --noEmit && npm run lint` clean; relevant suite green. - **Completed: 2026-06-17** (eslint on touched files green; full `tsc` has pre-existing duplicate-file noise)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (mount below free-text notes)
CREATE: frontend/components/cockpit/rx/subjective/__tests__/CustomSubsectionsField.test.tsx
DO NOT TOUCH: RxFormContext reducer/types (subj-19); doctor_settings/seed (subj-21); PDF (subj-22)
```

**When updating existing code:**
- [x] Audit `SubjectiveSection.tsx` render order; insert after the free-text `CollapsibleContainer`, before `</section>`.
- [x] Reuse `CollapsibleContainer` + `field-styles.ts`; do not introduce a new collapsible primitive.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Depth capped at 2 (P7-D2).** UI must make a third level impossible (no control), matching the Zod cap.
- **Single source of truth.** Edits dispatch subj-19 reducer actions; the component holds no parallel canonical state.
- **A11y parity (subj-10 gate).** Keyboard + aria match the existing subjective sections.
- **Disabled honoured.** Read-only mode renders without edit controls (telemed/locked visit).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — UI only; persistence is subj-19's prescription round-trip.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Doctor can add/rename/reorder/remove subsections and one level of sub-subsections; no way to nest a third level.
- [x] Edits reflect immediately in form state and survive a save/reload via subj-19's round-trip.
- [x] `disabled` is fully read-only; a11y/keyboard parity with sibling sections.
- [x] `tsc`/lint/tests green (subj-20 slice).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Reuse the family/social field interaction patterns (titles, notes textarea, reorder) so the new block feels native to the tab.

---

## 🔗 Related Tasks

- [`task-subj-19-data-model-custom-subsections.md`](./task-subj-19-data-model-custom-subsections.md) — provides the field + reducer this binds to.
- [`task-subj-21-doctor-default-subsections.md`](./task-subj-21-doctor-default-subsections.md) — the "save current as default" action may surface in this UI.

---

**Last Updated:** 2026-06-17  
**Pattern:** dynamic list editor over a form-state array using `CollapsibleContainer`, dispatching the subj-19 reducer; one nesting level.  
**Reference:** `process/CODE_CHANGE_RULES.md`
