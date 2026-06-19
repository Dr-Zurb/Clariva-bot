# Task subj-41: custom sections in the whole-subjective template + guarded delete dialog

> **Filename:** `task-subj-41-full-template-and-delete-warning.md` in `subjective-tab/p12-custom-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight.

---

## 📋 Task Overview

Two linked pieces that close the "what if a custom section is inside the whole template, and what happens when I delete it" question:

1. **`subjective_full` inclusion** — the whole-subjective template now **captures** the visit's custom sections and **applies** them **merge-by-id** (overwrite a same-id section's body/children, **create** an absent one). Static-subjective capture/apply is unchanged.
2. **Guarded delete** — the custom-section delete control (Phase-11 `handleRemoveCustomSection` + the trash icon in the Manage-sections menu / block header) now opens a **confirmation dialog** that enumerates the consequences (visit data loss, removal from the doctor default, **count of linked `custom_block` templates**, **count of `subjective_full` templates that embed this section**) and offers an **opt-in to archive** the linked `custom_block` templates. Cancel is a no-op. `subjective_full` snapshots are **never** mutated by a delete.

**Program / Phase:** subjective-tab · Phase 12 (custom-section templates)
**Batch:** [`plan-p12-custom-section-templates-batch.md`](../plan-p12-custom-section-templates-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-custom-section-templates.md`](./EXECUTION-ORDER-p12-custom-section-templates.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **DONE** — 2026-06-18

**Change Type:**
- [ ] **Update existing** + a confirm-dialog. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists (subj-40):** custom-block scoped save/apply via the reducer.
- ✅ **What exists (Phase 6):** `subjective_full` capture/apply in [`apply-subjective-template.ts`](../../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts) + [`SubjectivePresetButton.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/SubjectivePresetButton.tsx).
- ✅ **What exists (Phase 11):** `handleRemoveCustomSection` in [`SubjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) (removes from form state + order + hidden set) + the trash control in [`SectionManagerMenu.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/SectionManagerMenu.tsx).
- ⛳ **What's missing:** `subjective_full` ignores custom sections; delete is unguarded.

**Scope Guard:**
- Expected files touched: ≤ 6 (full-template capture/apply builders; delete-dialog component; `SubjectiveSection.tsx` delete wiring; client count helper; tests).
- **DO NOT TOUCH:** the migration/scope substrate (subj-39); chart-row apply paths; `buildRxPayload`/PDF/SMS. The actual archive **loop** lands in subj-42 — this task surfaces the **counts + opt-in flag** and calls the (existing) `archiveRxTemplate` client only behind the confirmed opt-in.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Whole-subjective capture
- [x] ✅ 1.1 `buildSubjectiveTemplateSavePayload` now includes live `customSubsections` via `serializeCustomSubsectionsForPayload` (ids + title + body + children preserved). Static capture unchanged. - **Completed: 2026-06-18**

### 2. Whole-subjective apply (merge-by-id)
- [x] ✅ 2.1 `buildSubjectiveTemplateApplyActions(template, fields)` appends `buildFullTemplateCustomSubsectionsApplyActions` — overwrite same-id via `UPDATE_CUSTOM_SUBSECTION`, create absent via `ADD_CUSTOM_SUBSECTION`; resurrection allowed. - **Completed: 2026-06-18**
- [x] ✅ 2.2 `SubjectivePresetButton` passes `state.fields`; single combined applying state unchanged. - **Completed: 2026-06-18**

### 3. Linked-template counts (client)
- [x] ✅ 3.1 `custom-section-linked-templates.ts`: `countLinkedCustomSectionTemplates` + `fetchLinkedCustomSectionTemplates` from `listRxTemplates("custom_block")` + `listRxTemplates("subjective_full")`. - **Completed: 2026-06-18**

### 4. Delete-confirmation dialog
- [x] ✅ 4.1 `DeleteCustomSectionDialog` gates `requestRemoveCustomSection` — enumerates visit data loss, default layout removal, linked `custom_block` count, `subjective_full` embed count. - **Completed: 2026-06-18**
- [x] ✅ 4.2 Opt-in checkbox (default off) passes `archiveCustomBlockTemplateIds` on confirm; `SubjectiveSection` calls `archiveRxTemplate` for each id behind opt-in. - **Completed: 2026-06-18**
- [x] ✅ 4.3 Cancel = full no-op; confirm-without-opt-in deletes section only; `subjective_full` snapshots never mutated. - **Completed: 2026-06-18**

### 5. Verification & Testing
- [x] ✅ 5.1 Unit: subjective_full save/apply custom-section round-trip (overwrite + create + resurrection); static-only templates unchanged. - **Completed: 2026-06-18**
- [x] ✅ 5.2 Delete dialog + linked-count tests; cancel no-op; opt-in archive ids — 33/33 vitest green across 3 suites. - **Completed: 2026-06-18**
- [x] ✅ 5.3 Lint clean on edited files; no new `tsc` errors in edited files (pre-existing unrelated noise unchanged). - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/apply-subjective-template.ts        (subjective_full capture + merge-by-id apply)
CREATE: frontend/components/cockpit/rx/subjective/DeleteCustomSectionDialog.tsx
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (gate handleRemoveCustomSection on the dialog)
UPDATE: frontend/lib/cockpit/apply-subjective-template.ts OR a small helper (linked-template counts)
UPDATE: relevant vitest (full round-trip + delete dialog)
DO NOT TOUCH: migration/scope substrate (subj-39); chart apply paths; buildRxPayload/PDF/SMS
```

**When updating existing code:**
- [ ] Reuse the existing `subjective_full` capture/apply orchestration — add custom sections as one more merged slice, don't fork it.
- [ ] The dialog must wrap the **existing** `handleRemoveCustomSection` — keep its form-state/order/hidden-set cleanup intact; only add the confirm gate + opt-in.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Merge-by-id (P12-D5).** Overwrite same-id, create absent; never duplicate by title; resurrection allowed.
- **Snapshots are immutable to delete (P12-D4).** A section delete never edits any `subjective_full` template.
- **Archive, opt-in, never silent (P12-D4).** Default keeps templates; cascade is archival + explicit; the loop itself is subj-42.
- **View-only (P12-D6).** No output change.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No new schema** — reads `doctor_rx_templates`; archival mutates `archived_at` (existing column, doctor-scoped) and only behind the opt-in.
  - [ ] **RLS verified?** **Yes** — doctor-scoped, unchanged.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **Yes (intentional)** — the dialog is the *guard*; archival is reversible (soft); hard delete of templates is out of scope.

---

## ✅ Acceptance & Verification Criteria

- [ ] Whole-subjective template captures + applies custom sections merge-by-id; static behaviour unchanged.
- [ ] Deleting a custom section opens a dialog enumerating data loss + default removal + linked `custom_block` count + `subjective_full` embed count; cancel no-ops; confirm-without-opt-in keeps all templates.
- [ ] Opt-in flags exactly the linked `custom_block` template ids for archival (executed in subj-42); `subjective_full` snapshots untouched.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the task that answers the doctor's two explicit worries — "what if a custom section is in the whole template" (merge-by-id, snapshots immutable) and "warn before deleting" (the dialog with live counts + an opt-in archive).

---

## 🔗 Related Tasks

- [`task-subj-18-whole-subjective-template-upgrade.md`](../../p6-section-templates/Tasks/task-subj-18-whole-subjective-template-upgrade.md) — the full-template orchestration this extends.
- [`task-subj-40-custom-section-template-button.md`](./task-subj-40-custom-section-template-button.md) — the per-section path.
- [`task-subj-42-integration-and-verification.md`](./task-subj-42-integration-and-verification.md) — runs the archive loop + closes the gate.

---

**Last Updated:** 2026-06-18.
**Pattern:** fold custom sections into the whole-subjective merge-by-id, and gate delete with a count-aware, opt-in-archival confirmation dialog.
**Reference:** `process/CODE_CHANGE_RULES.md`
