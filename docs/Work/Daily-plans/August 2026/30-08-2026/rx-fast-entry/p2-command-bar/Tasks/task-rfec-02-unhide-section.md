# Task rfec-02: Unhide a section from the command bar

> **Filename:** `task-rfec-02-unhide-section.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add *Show \<section\>* (and *Show \<vital\>*) results to the command bar. Accepting one removes that id from the live hidden set, persists through the existing doctor-settings helpers the manage menus already use, then scrolls and focuses. This is the discoverability half of lean defaults.

**Program / Phase:** rx-fast-entry · Phase 2 (command-bar)
**Batch:** [`plan-p2-rx-fast-entry-command-bar-batch.md`](../plan-p2-rx-fast-entry-command-bar-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md`](./EXECUTION-ORDER-p2-rx-fast-entry-command-bar.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** Each SOAP section keeps `hiddenIds` in React state and persists via `hiddenOverridesToPersist` + `saveSubjectiveSectionHidden` / objective / plan / assessment equivalents. Vitals use `saveVitalsHidden` + `vitals_hidden` from `VitalsGrid`. Empty stored set still means factory lean default (`resolveEffective*Hidden`). Manage menus already unhide by filtering the id out of `hiddenIds`.
- ❌ **What's missing:** No command-bar path into those setters. Hidden sections are still menu-only.
- ⚠️ **Notes:** `__show_all__` appears **only in tests** as a dummy unknown id so `storedHidden.length > 0`. Do **not** ship that sentinel (RFE-Q5, RFE2-D3). The empty-set snap-back is a known inherited edge — same as the menus.

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-9, DL-10, RFE-Q5, RFE2-D3

---

## ✅ Task Breakdown (Hierarchical)

### 1. Results
- [x] ✅ 1.1 When the query matches a currently hidden static section, offer *Show \<label\>*. - **Completed: 2026-08-30** (Subjective only in this task — see Notes)
- [x] ✅ 1.2 When the query matches a currently hidden vital, offer *Show \<label\>*. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Visible sections/vitals do not get a Show action (jump from rfec-01 already covers them). - **Completed: 2026-08-30**

### 2. Apply
- [x] ✅ 2.1 Accepting Show removes that id from the live hidden set through the **same setter** the matching manage menu uses (do not PATCH settings from the bar while the section component also owns the persist effect — pick one write path and audit it). - **Completed: 2026-08-30**
- [x] ✅ 2.2 After the section/vital mounts, scroll and focus (reuse Phase 1 consumer / existing scroll helpers). - **Completed: 2026-08-30**
- [x] ✅ 2.3 Do not persist `[]` as a creative "show all" unless the manage menu would have done the same for that click. Match the menus. - **Completed: 2026-08-30**

### 3. Verification & Testing
- [x] ✅ 3.1 Show Family history: section appears; persist payload is the remaining hidden ids (not a new key). - **Completed: 2026-08-30**
- [x] ✅ 3.2 Show a hidden vital: vital appears; `vitals_hidden` persist path is used. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Manage-section menu still hides/shows after a command-bar unhide (same state). - **Completed: 2026-08-30**
- [x] ✅ 3.4 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: command bar from rfec-01 (add Show results)
UPDATE: a thin seam so the bar can ask a tab to unhide
        (prefer a small context/callback already near hiddenIds —
         audit SubjectiveSection / ObjectiveSection / PlanSection /
         AssessmentSection / VitalsGrid before adding a new store)
```

**Existing Code Status:**
- ✅ Hidden persist helpers — EXIST on each tab + `VitalsGrid`.
- ⚠️ Command bar shell — EXISTS after rfec-01; this task only adds Show.
- ❌ New persist API — must not be created.

**When updating existing code:**
- [x] ✅ Audit who currently calls `save*SectionHidden` / `saveVitalsHidden` (the section persist effects). The bar should trigger the same in-memory mutation those effects already persist. - **Completed: 2026-08-30**
- [x] ✅ Do not add a parallel PATCH from the bar. - **Completed: 2026-08-30**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Same persist path as the manage menus (RFE2-D3).
- No new sentinel, no new settings key (RFE-Q5, RFE-DL-9).
- Lean defaults stay (RFE-DL-10) — unhide is per-doctor, not a factory change.
- No PHI in logs.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes — existing `doctor_settings` hidden arrays only.** No new column. RLS unchanged (existing doctor-settings PATCH).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] *Show Family history* makes that section visible and persists through the existing subjective hidden key.
- [x] *Show \<hidden vital\>* uses the existing vitals hidden key.
- [x] No new doctor-settings field. No production `__show_all__`.
- [x] Type-check + lint + unhide tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Wiring all four SOAP tabs + vitals would exceed the 5-file budget.
**Solution:** Used the written escape hatch: Subjective + Vitals landed. Plan / Assessment / Objective *section* Show is a residual for rfec-03 (do not start set-value in that residual if it cannot fit).

---

## 📝 Notes

- If wiring all four tabs plus vitals blows the file budget, land Subjective + Vitals (the lean-default hole + the "where is SpO₂" case) and list Plan/Assessment/Objective sections as a residual for rfec-03 — do not start set-value in that residual.
- Seam is `registerRxHiddenSource` — tabs call the same `setHiddenIds` the persist effects already watch. No parallel PATCH.

---

## 🔗 Related Tasks

- [`task-rfec-01-command-bar-shell.md`](./task-rfec-01-command-bar-shell.md)
- [`task-rfec-03-set-vital.md`](./task-rfec-03-set-vital.md)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Same hidden-set mutation the menus already persist
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
