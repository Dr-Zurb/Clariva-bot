# Task subj-16: Form-state scoped templates (reusable button + chief complaints / PSH / family / social)

> **Filename:** `task-subj-16-form-state-scoped-templates.md` in `subjective-tab/p6-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Generalise the shipped subjective-preset helpers into **scoped** save/apply, build **one reusable
`SubjectiveSectionTemplateButton`**, and wire it into the four **form-state** subsections —
**Chief complaints**, **Past surgical history**, **Family history**, **Social/personal history** —
so each has a Templates button that saves *only* its slice and applies *only* its slice via the
Phase-1 reducer. No server writes here (PMH/allergies are subj-17).

**Program / Phase:** subjective-tab · Phase 6 (section templates)  
**Batch:** [`plan-p6-subjective-section-templates-batch.md`](../plan-p6-subjective-section-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-subjective-section-templates.md`](./EXECUTION-ORDER-p6-subjective-section-templates.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** + **small new component**. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** scoped save/apply/has-content helpers; `SubjectiveSectionTemplateButton`; Templates buttons on chief complaints, PSH, family history, social history.
- ✅ **subj-15 substrate:** `scope` on types/picker/list filter.

**Scope Guard:**
- Expected files touched: ≤ 7 (apply helper; new button; four subsection containers — some share a parent; optional test). Reuse `HistorySubsection`'s header `actions` slot for placement.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Scoped helpers (generalise `apply-subjective-template.ts`)
- [x] ✅ 1.1 `buildScopedTemplateSavePayload(scope, fields)` — returns a `subjective` payload carrying **only** the scope's slice (e.g. `chief_complaints` → just `complaints`; `family_history` → just `familyHistory*`). Reuse the existing field-extraction in `buildSubjectiveTemplateSavePayload`. - **Completed: 2026-06-17**
- [x] ✅ 1.2 `buildScopedTemplateApplyActions(scope, template)` — reducer actions that fill **only** the scope's slice (reuse `buildSubjectiveCarryForwardActions` with a scope-derived selection mask instead of `COPY_ALL_SUBJECTIVE_SELECTION`). - **Completed: 2026-06-17**
- [x] ✅ 1.3 `scopeHasContent(scope, fields)` — per-scope guard for the save-current "add something first" check. - **Completed: 2026-06-17**

### 2. Reusable button
- [x] ✅ 2.1 `SubjectiveSectionTemplateButton` — props `{ scope, label?, disabled? }`. Same shape as `SubjectivePresetButton` but scope-driven: opens `TemplatePicker scope={scope}`, applies via `buildScopedTemplateApplyActions`, saves via `buildScopedTemplateSavePayload`. Label "Templates". - **Completed: 2026-06-17**

### 3. Wire the four form-state subsections
- [x] ✅ 3.1 **Chief complaints** (`scope="chief_complaints"`) — into the complaint-list header actions. - **Completed: 2026-06-17**
- [x] ✅ 3.2 **Past surgical history** (`scope="past_surgical"`) — `PastSurgicalHistoryField` header (uses `HistorySubsection` actions slot). - **Completed: 2026-06-17**
- [x] ✅ 3.3 **Family history** (`scope="family_history"`). - **Completed: 2026-06-17**
- [x] ✅ 3.4 **Social / personal history** (`scope="social_history"`). - **Completed: 2026-06-17**

### 4. Verification & Testing
- [x] ✅ 4.1 Test: each scope saves only its slice and applies only its slice; other subsections untouched after apply; save-current guard fires per scope. - **Completed: 2026-06-17**
- [x] ✅ 4.2 `cd frontend && npx tsc --noEmit && npm run lint` clean; suite green. - **Completed: 2026-06-17** (scoped vitest suite green; pre-existing tsc noise unchanged)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/apply-subjective-template.ts (scoped save/apply/has-content helpers)
CREATE: frontend/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton.tsx
UPDATE: chief-complaint list container (header actions)
UPDATE: frontend/components/cockpit/rx/subjective/PastSurgicalHistoryField.tsx
UPDATE: family-history + social-history field containers
CREATE/UPDATE: a test for scoped save + scoped apply isolation
DO NOT TOUCH: the full SubjectivePresetButton (subj-18 renames it); PMH/allergy surfaces (subj-17)
```

**When updating existing code:**
- [x] Keep `buildSubjectiveTemplateSavePayload`/`buildSubjectiveTemplateApplyActions` working (the full button still calls them until subj-18) — add scoped variants beside them, don't replace.
- [x] Reuse the `HistorySubsection` header `actions` slot so placement is consistent across subsections.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Surgical apply (P6-D2).** A scope's apply dispatches reducer actions for *only* that scope's fields; never clears or writes sibling subsections.
- **Array/structured fill (P6-D4 / ST-D1).** Fills `complaints` array + structured history, not raw text.
- **One button, scope-parameterised.** Don't fork four near-identical buttons; parameterise by `scope`.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — reads/writes `doctor_rx_templates` (scoped); no patient PHI tables.
  - [x] **RLS verified?** **Yes** — per-doctor, unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Each of the four form-state subsections has a "Templates" button that saves only its slice, lists only its scope, and applies only its slice via the reducer; siblings untouched; per-scope save guard works; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the low-risk slice — it clones the shipped subj-08 path and parameterises it. The genuinely new work (server-backed apply) is subj-17.

---

## 🔗 Related Tasks

- [`task-subj-15-template-scope-foundation.md`](./task-subj-15-template-scope-foundation.md) — provides `scope`.
- [`task-subj-17-server-backed-scoped-templates.md`](./task-subj-17-server-backed-scoped-templates.md) — the server-backed counterpart (PMH/allergies).
- [`task-subj-18-whole-subjective-template-upgrade.md`](./task-subj-18-whole-subjective-template-upgrade.md) — composes these helpers into the full bundle.

---

**Last Updated:** 2026-06-17  
**Pattern:** scope-parameterised clone of the shipped `SubjectivePresetButton` + `apply-subjective-template` helpers.  
**Reference:** `process/CODE_CHANGE_RULES.md`
