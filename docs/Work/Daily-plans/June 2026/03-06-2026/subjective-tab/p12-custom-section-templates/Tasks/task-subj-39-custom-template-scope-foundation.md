# Task subj-39: `custom_block` template scope + `customSubsections` storage foundation

> **Filename:** `task-subj-39-custom-template-scope-foundation.md` in `subjective-tab/p12-custom-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-6/11 `Tasks/` folders.

---

## ⛔ Migration STOP — Opus required

This task adds a **migration** (widens the `doctor_rx_templates` scope CHECK enum). Per [`.cursor/rules/migrations.mdc`](../../../../../../../../.cursor/rules/migrations.mdc) + the agent contract, migrations are a **hard-rules STOP**: do not let Auto silently proceed. Run this slice on **Opus (max-thinking)**, follow [`MIGRATIONS_AND_CHANGE.md`](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) exactly, and keep the change **additive + reversible** (the enum widen drops+re-adds the CHECK; no data rewrite; RLS untouched).

---

## 📋 Task Overview

Make the shipped scoped-template substrate **custom-section aware**. Add a new **`custom_block`** value to the `doctor_rx_templates` scope enum and extend the template's `subjective_json` with an optional **`customSubsections`** array, threaded end-to-end (BE type → validation → service normaliser; FE type; picker scope label + content predicate + summary). This is **pure substrate** — **no save/apply logic, no buttons, no delete dialog** (those are subj-40/41/42).

**Program / Phase:** subjective-tab · Phase 12 (custom-section templates)
**Batch:** [`plan-p12-custom-section-templates-batch.md`](../plan-p12-custom-section-templates-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-custom-section-templates.md`](./EXECUTION-ORDER-p12-custom-section-templates.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **DONE** — 2026-06-18

**Change Type:**
- [ ] **Update existing** — widen the scope enum + extend the template JSON shape across both layers. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`141_doctor_rx_templates_scope.sql`](../../../../../../../../backend/migrations/141_doctor_rx_templates_scope.sql) (7-value scope enum, no `custom_block`); [`rx-template-service.ts`](../../../../../../../../backend/src/services/rx-template-service.ts) (`normalizeSubjective`-style normaliser, list/create/get); scope types both sides ([`backend`](../../../../../../../../backend/src/types/rx-template.ts) / [`frontend`](../../../../../../../../frontend/types/rx-template.ts)); [`TemplatePicker.tsx`](../../../../../../../../frontend/components/ehr/TemplatePicker.tsx) (`SCOPE_PICKER_LABELS`, `templateHasScopedContent`, `formatTemplateSummary`); the stable [`CustomSubsection`](../../../../../../../../frontend/lib/cockpit/custom-subsections.ts) shape (Phase 7/11).
- ⛳ **What's missing:** the enum has no `custom_block`; `subjective_json` carries no `customSubsections`; the picker has no labels/summary for the custom-block scope.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration; BE type; BE validation; BE service normaliser; FE type; picker labels/predicate/summary; + tests). **No** buttons, **no** apply/save logic, **no** delete dialog.
- Highest existing migration is **148** — new file is `149_…`.
- **DO NOT TOUCH:** `apply-subjective-template.ts`, any section button, `SubjectiveSection.tsx`, `handleRemoveCustomSection` (subj-40/41).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `149_doctor_rx_templates_custom_block_scope.sql`: drop + re-add `doctor_rx_templates_scope_valid` CHECK to include `custom_block` alongside the existing 7 values; idempotent (`DROP CONSTRAINT IF EXISTS` → `ADD CONSTRAINT`); header comment + rollback line; **no** data rewrite, **no** RLS change. The `(doctor_id, scope)` index from `141` already covers the new value. - **Completed: 2026-06-18**

### 2. Backend types + validation + service
- [x] ✅ 2.1 Added `custom_block` to the `RxTemplateScope` union in `backend/src/types/rx-template.ts`; added optional `customSubsections` to `RxTemplateSubjective`. - **Completed: 2026-06-18**
- [x] ✅ 2.2 `validation.ts`: added `custom_block` to the scope enum (via `RX_TEMPLATE_SCOPE_VALUES`); validates `customSubsections` **tolerantly** — malformed sections/children are dropped (element `.nullable().catch(null)` + filter), the array is sliced to the cap, the template is never rejected. - **Completed: 2026-06-18**
- [x] ✅ 2.3 `rx-template-service.ts`: extended `normalizeSubjective` to round-trip `customSubsections` through create/update (new `normalizeCustomSubsections` helper; drops untitled entries, mints missing ids, caps counts); omitted when absent. - **Completed: 2026-06-18**

### 3. Frontend types
- [x] ✅ 3.1 Mirrored `custom_block` in the `RxTemplateScope` union + `customSubsections?` in `RxTemplateSubjective` in `frontend/types/rx-template.ts`. - **Completed: 2026-06-18**

### 4. Picker scope-awareness (display only)
- [x] ✅ 4.1 `template-picker-summary.ts` (the helpers `TemplatePicker.tsx` consumes): added `SCOPE_PICKER_LABELS["custom_block"]` (title/hint); extended `templateHasScopedContent` (via `hasCustomSubsectionsContent`), `formatTemplateSummary` (section count) + `templateMatchesSearch`. **No** new save/apply behaviour. - **Completed: 2026-06-18**

### 5. Verification & Testing
- [x] ✅ 5.1 Tests: migration content-sanity (`149-…migration.test.ts` — enum includes `custom_block`, additive/reversible, RLS unchanged); validation tolerance (`rx-template-scope-validation.test.ts` — accepts well-formed, drops malformed sections/children); service round-trip (`rx-template-service.test.ts` — `custom_block` + `subjective_full`, id mint, omitted-when-absent). - **Completed: 2026-06-18**
- [x] ✅ 5.2 Backend `tsc` clean; targeted suites green (28/28); FE `tsc` + lint clean for the edited files. Pre-existing unrelated noise (the `@react-pdf/renderer` ESM jest issue + FE social-history typing) unchanged. - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/149_doctor_rx_templates_custom_block_scope.sql
UPDATE: backend/src/types/rx-template.ts          (custom_block scope + customSubsections)
UPDATE: backend/src/utils/validation.ts           (scope enum + tolerant customSubsections)
UPDATE: backend/src/services/rx-template-service.ts (normaliser round-trips customSubsections)
UPDATE: frontend/types/rx-template.ts             (mirror scope + customSubsections)
UPDATE: frontend/components/ehr/TemplatePicker.tsx (custom_block label + predicate + summary)
DO NOT TOUCH: apply-subjective-template.ts, any section button, SubjectiveSection.tsx (subj-40/41)
```

**When updating existing code:**
- [ ] Audit every scope-enum + subjective-normaliser caller before widening — keep the 7 existing scopes byte-unchanged; `custom_block` is purely additive.
- [ ] Keep `customSubsections` optional everywhere — absent ⇒ today's behaviour for all existing templates.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One table, additive scope (P12-D1).** Reuse `doctor_rx_templates`; no per-section table.
- **Content rides `subjective_json` (P12-D2).** No new column / no PHI column — `customSubsections` is an optional array on the existing JSON.
- **Tolerant by construction (P12-D3 / P11-D5).** Malformed/partial `customSubsections` are dropped, never rejected — applying tolerates stale ids downstream.
- **Per-doctor RLS unchanged (P6-D5).** The enum widen does not widen access.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — additive enum value + optional JSON field on `doctor_rx_templates` (per-doctor). No backfill, no rewrite.
  - [ ] **RLS verified?** **Yes** — doctor-scoped (migration 091); enum widen does not widen access.
- [ ] **Any PHI in logs?** **No** — template bodies are doctor boilerplate, not patient data; still never logged.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No** (delete/cascade lands in subj-41/42).

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration runs idempotently; CHECK enum gains `custom_block`; existing rows + the 7 prior scopes unchanged; RLS unchanged.
- [ ] Service round-trips `subjective_json.customSubsections` on create/list/get for `custom_block` (array of one) and `subjective_full` (array of N); malformed entries dropped.
- [ ] Picker lists/labels/summarises `custom_block` templates as non-empty when they carry custom sections; no save/apply wiring yet.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Deliberately logic-free — it only makes the table + JSON shape + picker *custom-block aware* so subj-40 (per-section save/apply) and subj-41 (full-template + delete dialog) plug onto a stable substrate. Migration is the only schema change in the whole phase.

---

## 🔗 Related Tasks

- [`task-subj-15-template-scope-foundation.md`](../../p6-section-templates/Tasks/task-subj-15-template-scope-foundation.md) — the scope substrate this widens.
- [`task-subj-36-stable-custom-section-identity.md`](../../p11-custom-section-visibility/Tasks/task-subj-36-stable-custom-section-identity.md) — the stable id this links templates by.
- [`task-subj-40-custom-section-template-button.md`](./task-subj-40-custom-section-template-button.md) — first consumer of the new scope.

---

**Last Updated:** 2026-06-18.
**Pattern:** additive enum value + optional JSON field + picker display-awareness on the shipped scoped `doctor_rx_templates`/`TemplatePicker`.
**Reference:** `process/CODE_CHANGE_RULES.md`
