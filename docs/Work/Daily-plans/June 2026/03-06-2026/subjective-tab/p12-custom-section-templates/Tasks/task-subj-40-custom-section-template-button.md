# Task subj-40: custom-section save/apply + per-section Templates button

> **Filename:** `task-subj-40-custom-section-template-button.md` in `subjective-tab/p12-custom-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight.

---

## 📋 Task Overview

Give each custom section the same Templates affordance static subsections already have. Clone the Phase-6 [`SubjectiveSectionTemplateButton`](../../../../../../../../frontend/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton.tsx) pattern into a **custom-section** save/apply flow on the new `custom_block` scope: **save** snapshots only the one live custom section into `subjective_json.customSubsections`; **apply** fills the matching section (by stable id) or **creates** it; the picker **surfaces the section's own-id templates first**. Pure form-state + doctor-settings — **no server chart writes, no output change**.

**Program / Phase:** subjective-tab · Phase 12 (custom-section templates)
**Batch:** [`plan-p12-custom-section-templates-batch.md`](../plan-p12-custom-section-templates-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-custom-section-templates.md`](./EXECUTION-ORDER-p12-custom-section-templates.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **DONE** — 2026-06-18

**Change Type:**
- [ ] **Update existing** + small new button component. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists (subj-39):** `custom_block` scope + `subjective_json.customSubsections` round-trip; picker labels/summary.
- ✅ **What exists (Phase 6):** [`apply-subjective-template.ts`](../../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts) (`buildScopedTemplateSavePayload` + scoped apply via the reducer); [`SubjectiveSectionTemplateButton.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton.tsx) (save-icon + picker per scope).
- ✅ **What exists (Phase 7/11):** `CustomSubsectionBlock` render + the stable `custom_block:<id>` model in [`custom-subsections.ts`](../../../../../../../../frontend/lib/cockpit/custom-subsections.ts); the `ADD_CUSTOM_SUBSECTION` / update reducer actions in [`RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx).
- ⛳ **What's missing:** a custom-block branch in the scoped save/apply builders + a button mounted on each custom-section header.

**Scope Guard:**
- Expected files touched: ≤ 6 (apply-subjective-template builders; new `CustomSectionTemplateButton`; `SubjectiveSection.tsx`/`CustomSubsectionBlock` mount + wiring; tests).
- **DO NOT TOUCH:** the migration/scope substrate (subj-39 done); `subjective_full` capture/apply + the delete dialog (subj-41); `buildRxPayload`/PDF/SMS.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Scoped save (custom_block)
- [x] ✅ 1.1 Extended `apply-subjective-template.ts` with `buildCustomBlockTemplateSavePayload`: reads the one target custom section by id and emits `subjective_json.customSubsections = [thatSection]` (title + body + children, ids preserved via `sanitizeCustomSubsectionForStorage`). - **Completed: 2026-06-18**
- [x] ✅ 1.2 `customBlockSectionHasContent` — emptiness requires body or child content (title alone reports empty); save returns `null` and the button shows the guard alert. - **Completed: 2026-06-18**

### 2. Scoped apply (custom_block)
- [x] ✅ 2.1 `buildCustomBlockTemplateApplyActions`: same-id path overwrites body/children (+ title); absent-id path `ADD_CUSTOM_SUBSECTION` then fill; never duplicates by title. - **Completed: 2026-06-18**
- [x] ✅ 2.2 Cross-apply fills the current header's section (keeps its title); malformed/empty templates return `[]` (safe no-op). - **Completed: 2026-06-18**

### 3. Button + mount
- [x] ✅ 3.1 New `CustomSectionTemplateButton`: save-icon + `TemplatePicker` (`variant="subjective"` `scope="custom_block"`) with `priorityCustomSectionId={sectionId}`. - **Completed: 2026-06-18**
- [x] ✅ 3.2 Mounted on each custom-section header via `templateActions` prop on `CustomSubsectionBlock`, wired from `SubjectiveSection.tsx` alongside rename/remove controls. - **Completed: 2026-06-18**

### 4. Picker surfacing
- [x] ✅ 4.1 `sortCustomBlockTemplatesForSection` + `TemplatePicker.priorityCustomSectionId` — own-id `custom_block` templates list first; all remain applicable. - **Completed: 2026-06-18**

### 5. Verification & Testing
- [x] ✅ 5.1 Unit tests: save→apply round-trip (overwrite + create), cross-apply, empty no-op, picker sort — 24/24 vitest green in `apply-subjective-template.test.ts`. - **Completed: 2026-06-18**
- [x] ✅ 5.2 Lint clean on edited files; `tsc` has no errors in new/edited files (pre-existing unrelated `social-history*` / `subjective-section-*` noise unchanged). - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/apply-subjective-template.ts        (custom_block save + apply branch)
CREATE: frontend/components/cockpit/rx/subjective/CustomSectionTemplateButton.tsx
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (mount on custom headers)
UPDATE: frontend/lib/cockpit/__tests__/apply-subjective-template*.test.ts (round-trip)
DO NOT TOUCH: subjective_full capture/apply + delete dialog (subj-41); buildRxPayload/PDF/SMS
```

**When updating existing code:**
- [ ] Reuse the existing scoped builder switch — add a `custom_block` case, don't fork a parallel path.
- [ ] Apply must go through the **reducer** (ADD/UPDATE custom subsection), preserving the stable-id contract from subj-36.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Surgical scope (P6-D2).** A `custom_block` template touches only its target custom section — never other subsections or chart rows.
- **Merge-by-id, create-if-absent (P12-D3 / P12-D5).** Apply overwrites a same-id section, creates an absent one; never duplicates by title.
- **View-only (P12-D6).** Fills form state only; `buildRxPayload`/PDF/SMS unreachable from this path.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No new schema** — reads/writes the doctor's own `doctor_rx_templates` (subj-39 column) + RxForm state.
  - [ ] **RLS verified?** **Yes** — doctor-scoped, unchanged.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No** (delete lands subj-41/42).

---

## ✅ Acceptance & Verification Criteria

- [ ] Each custom-section header has a Templates button; **save** snapshots only that section; **apply** fills (overwrite) or creates (absent) that section via the reducer.
- [ ] Picker surfaces the section's own-id templates first; cross-apply fills the current header's section.
- [ ] Empty/malformed template is a safe no-op; static-subsection behaviour unchanged.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the visible payoff of subj-39 — it clones the shipped Phase-6 scoped button onto custom sections with one extra wrinkle (apply may have to *create* the section), all on stable ids.

---

## 🔗 Related Tasks

- [`task-subj-16-form-state-scoped-templates.md`](../../p6-section-templates/Tasks/task-subj-16-form-state-scoped-templates.md) — the scoped button this clones.
- [`task-subj-39-custom-template-scope-foundation.md`](./task-subj-39-custom-template-scope-foundation.md) — the substrate.
- [`task-subj-41-full-template-and-delete-warning.md`](./task-subj-41-full-template-and-delete-warning.md) — full-template + delete dialog.

---

**Last Updated:** 2026-06-18.
**Pattern:** clone the Phase-6 scoped save/apply button onto custom sections; apply is overwrite-or-create by stable id via the reducer.
**Reference:** `process/CODE_CHANGE_RULES.md`
