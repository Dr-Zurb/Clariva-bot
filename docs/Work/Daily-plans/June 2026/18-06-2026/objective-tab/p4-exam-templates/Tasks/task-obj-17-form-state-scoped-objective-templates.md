# Task obj-17: Form-state scoped objective templates (`apply-objective-template.ts` + reusable button + wire vitals/exam/per-system/custom)

> **Filename:** `task-obj-17-form-state-scoped-objective-templates.md` in `objective-tab/p4-exam-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Build the objective analog of the subjective scoped-template engine (`subj-16`): a pure form-state
save/apply helper (`apply-objective-template.ts`), a reusable `ObjectiveSectionTemplateButton`, and the
wiring for each objective section (vitals, structured exam, per-system, custom block). **Apply is a
RxForm reducer dispatch only** — objective templates are entirely form state (`examFindings` / `vitals_*`
/ `testResults` / `objectiveCustomSections`), so there is **no server-apply, no chart-row create, no
dedup** (the subjective PMH/allergies complexity has no objective counterpart).

**Program / Phase:** objective-tab · Phase 4 (exam templates + specialty packs)  
**Batch:** [`plan-p4-objective-tab-exam-templates-batch.md`](../plan-p4-objective-tab-exam-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p4-objective-tab-exam-templates.md`](./EXECUTION-ORDER-p4-objective-tab-exam-templates.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ⏳ **PENDING** — Sonnet. Depends on **obj-16**.

**Change Type:**
- [ ] **New feature** (engine + reusable button) + **wire existing** (section headers). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-16's objective scopes + `objective_json` payload; the subjective engine to mirror ([`apply-subjective-template.ts`](../../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts)) + reusable subjective section button; the objective form state + reducer actions in [`RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) (`examFindings` + `SET_EXAM_FINDINGS`, the `vitals_*` fields + setters, `testResults`, `objectiveCustomSections` + `SET_OBJECTIVE_CUSTOM_SECTIONS`); [`exam-schema.ts`](../../../../../../../../frontend/lib/cockpit/exam-schema.ts); the section shells in [`ObjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx).
- ❌ **What's missing:** the scoped objective save/apply helpers; a reusable objective Templates button; the per-section wiring.

**Scope Guard:**
- Expected files touched: ≤ 6 (apply engine; reusable button; the objective section headers that mount it; a test). **No** server/chart writes, **no** `doctor_settings` layout/visibility writes, **no** migration (obj-16 owns it), **no** packs (obj-18).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Apply/save engine
- [ ] 1.1 `apply-objective-template.ts`: `buildObjectiveTemplateSavePayload(scope, fields)` reads only the scope's slice — `vitals` → the `vitals_*` subset; `exam_systemic` → all `examFindings`; per-system (`exam_cvs`…) → that one `examFindings` entry; `objective_custom_block` → one `objectiveCustomSections` entry; `objective_full` → all of the above.
- [ ] 1.2 `buildObjectiveTemplateApplyActions(scope, template)` returns the reducer dispatch(es) that fill only that scope's form state (merge semantics matching subjective P6 — confirm replace-vs-merge per system entry). Pure; no I/O.
- [ ] 1.3 `objectiveScopeHasContent(scope, fields)` gates the save affordance (don't save empty).

### 2. Reusable button
- [ ] 2.1 `ObjectiveSectionTemplateButton` (clone the subjective section template button): reads `scope`, renders the `TemplatePicker` (variant `objective`), wires save-current → `buildObjectiveTemplateSavePayload`, apply → dispatch `buildObjectiveTemplateApplyActions`. Label **"Templates"** (P4-D6).

### 3. Wire the sections
- [ ] 3.1 Mount the button in the vitals section header (`scope="vitals"`).
- [ ] 3.2 Mount it on the structured exam section (`scope="exam_systemic"`) and, if the per-system affordance is in scope for v1, per `ExamSystemCard` (`scope="exam_cvs"`…). *(If per-system buttons bloat the UI, ship `exam_systemic` only in v1 and defer per-system — note the call.)*
- [ ] 3.3 Mount it on each custom objective block (`scope="objective_custom_block"`).

### 4. Verification & Testing
- [ ] 4.1 Tests: each scope's save captures only its slice; apply fills only its slice (other sections untouched); `objectiveScopeHasContent`; apply → `buildRxPayload` derives identically to hand-entry (OBJ-D2).
- [ ] 4.2 Scoped vitest green; `tsc`/eslint clean on touched files.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/apply-objective-template.ts (save/apply/scopeHasContent — pure)
CREATE: frontend/components/cockpit/rx/objective/ObjectiveSectionTemplateButton.tsx (reusable)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (mount buttons per section)
CREATE/UPDATE: a test for scoped save + apply + derived-text parity
DO NOT TOUCH: doctor_settings layout/visibility writes (P3); any server chart path; buildRxPayload derivation
```

**When updating existing code:**
- [ ] Compose, don't fork — model the engine on `apply-subjective-template.ts`; reuse `custom-objective-sections.ts` for the custom-block slice.
- [ ] Apply dispatches only — never write `objective_section_order`/`_hidden`/`_collapsed` (that's P3 config, not template data).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Form-state only (P4-D2).** Apply = reducer dispatch into objective form state; no server chart write, no config write, no direct derived-text write.
- **Surgical scope (P4-D5).** A `vitals` template touches only vitals; a per-system template only that entry; `objective_full` composes them. Never cross-write.
- **Derived-text contract (P4-D3 / OBJ-D2).** After apply, `buildRxPayload` derives `examination_findings`/`test_results` exactly as for hand-entry — proven in obj-19.
- **"Templates" everywhere (P4-D6).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — reads/writes the doctor's own `doctor_rx_templates` rows (obj-16 paths); fills RxForm state.
  - [ ] **RLS verified?** **Yes** — inherits obj-16's doctor-scoped template paths; no new surface.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Each objective section has a **Templates** button that saves only its slice and applies only its slice via the reducer; other sections untouched.
- [ ] Apply fills `examFindings`/`vitals_*`/`testResults`/`objectiveCustomSections` and `buildRxPayload` derives identically to hand-entry (no derived-text drift).
- [ ] No `doctor_settings` layout write, no server chart write; `tsc`/lint/scoped tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the **form-state half** of subjective P6 only — because objective data has no server-backed chart slice, obj-17 alone covers what subj-16 **and** subj-17 covered together (minus all the create-on-apply/dedup/partial-failure machinery).

---

## 🔗 Related Tasks

- [`task-subj-16-form-state-scoped-templates.md`](../../../../03-06-2026/subjective-tab/p6-section-templates/Tasks/task-subj-16-form-state-scoped-templates.md) — the form-state engine this mirrors.
- [`task-obj-16-objective-template-scope-foundation.md`](./task-obj-16-objective-template-scope-foundation.md) — the substrate.
- [`task-obj-18-specialty-exam-packs.md`](./task-obj-18-specialty-exam-packs.md) — first consumer of this apply engine.

---

**Last Updated:** 2026-06-19  
**Pattern:** clone `apply-subjective-template.ts` into a pure objective scoped save/apply engine + a reusable section Templates button; reducer-dispatch apply only.  
**Reference:** `process/CODE_CHANGE_RULES.md`
