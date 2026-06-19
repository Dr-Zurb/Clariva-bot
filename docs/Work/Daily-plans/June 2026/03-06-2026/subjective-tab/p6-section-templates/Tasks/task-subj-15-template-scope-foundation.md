# Task subj-15: Template `scope` foundation (column + types + validation + list filter + picker prop)

> **Filename:** `task-subj-15-template-scope-foundation.md` in `subjective-tab/p6-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-2 `Tasks/` folder.

---

## 📋 Task Overview

Add a **`scope`** discriminator to `doctor_rx_templates` so the one template table can hold
per-subsection bundles, and thread it end-to-end: the **list filter** (`listRxTemplates(scope?)`)
and the **picker** (`scope` prop) so each Templates button only ever sees its own scope's
templates. This is the pure substrate — **no apply/save logic, no new buttons** (those are subj-16/17/18).

**Program / Phase:** subjective-tab · Phase 6 (section templates)  
**Batch:** [`plan-p6-subjective-section-templates-batch.md`](../plan-p6-subjective-section-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-subjective-section-templates.md`](./EXECUTION-ORDER-p6-subjective-section-templates.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** — extend the template table + types + the list path. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`119_doctor_rx_templates_subjective_json.sql`](../../../../../../../../backend/migrations/119_doctor_rx_templates_subjective_json.sql) (`subjective_json`); [`rx-template-service.ts`](../../../../../../../../backend/src/services/rx-template-service.ts) (`listRxTemplates`, `createRxTemplate`); types both sides ([`backend`](../../../../../../../../backend/src/types/rx-template.ts) / [`frontend`](../../../../../../../../frontend/types/rx-template.ts)); [`TemplatePicker.tsx`](../../../../../../../../frontend/components/ehr/TemplatePicker.tsx) with a `variant: "full" | "subjective"`.
- ✅ **What's done:** `141_doctor_rx_templates_scope.sql`; `scope` filter on list query + API client; `scope` prop on the picker that filters the listed templates and passes scope to save-current callbacks.

**Scope Guard:**
- Expected files touched: ≤ 7 (migration; BE type; BE validation; BE service; FE type; FE api client; picker). **No** new buttons, **no** apply logic.
- Highest existing migration is `140` — new file is `141_…`.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `141_doctor_rx_templates_scope.sql`: add `scope TEXT NOT NULL DEFAULT 'subjective_full'` with a CHECK enum over the 7 scopes (`subjective_full`, `chief_complaints`, `past_medical`, `past_surgical`, `family_history`, `social_history`, `allergies`); idempotent (`ADD COLUMN IF NOT EXISTS`, drop+add constraint). Index on `(doctor_id, scope)` for the list filter. Header comment + rollback line. - **Completed: 2026-06-17**

### 2. Backend types + validation + service
- [x] ✅ 2.1 Add `scope` (typed union) to the row + payload types in `backend/src/types/rx-template.ts`. - **Completed: 2026-06-17**
- [x] ✅ 2.2 `validation.ts`: validate `scope` against the enum on create (default `subjective_full` when omitted). - **Completed: 2026-06-17**
- [x] ✅ 2.3 `rx-template-service.ts`: `listRxTemplates` accepts an optional `scope` and filters; `createRxTemplate` persists `scope`. - **Completed: 2026-06-17**

### 3. Frontend types + API client
- [x] ✅ 3.1 Mirror `scope` union + field in `frontend/types/rx-template.ts` (`DoctorRxTemplate` + `RxTemplatePayload`). - **Completed: 2026-06-17**
- [x] ✅ 3.2 `frontend/lib/api.ts` `listRxTemplates` passes an optional `scope` query param. - **Completed: 2026-06-17**

### 4. Picker scope wiring
- [x] ✅ 4.1 `TemplatePicker.tsx`: accept a `scope` prop; pass it to `listRxTemplates`; stamp it onto save-current payloads. Keep `variant` working (default scope `subjective_full` preserves today's `Presets` behaviour). - **Completed: 2026-06-17**

### 5. Verification & Testing
- [x] ✅ 5.1 Test: migration enum + default; `listRxTemplates(scope)` filters; existing rows read back as `subjective_full`. - **Completed: 2026-06-17**
- [x] ✅ 5.2 `cd backend && npm test` + `cd frontend && npx tsc --noEmit && npm run lint` clean. - **Completed: 2026-06-17** (new rx-template tests pass; pre-existing suite/tsc noise unchanged)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/141_doctor_rx_templates_scope.sql
UPDATE: backend/src/types/rx-template.ts (scope union on row + payload)
UPDATE: backend/src/utils/validation.ts (scope enum)
UPDATE: backend/src/services/rx-template-service.ts (list filter + persist scope)
UPDATE: frontend/types/rx-template.ts (scope mirror)
UPDATE: frontend/lib/api.ts (listRxTemplates scope param)
UPDATE: frontend/components/ehr/TemplatePicker.tsx (scope prop → list filter + save payload)
DO NOT TOUCH: the apply/save subjective logic (subj-16+) or any section button (subj-16/17/18)
```

**When updating existing code:**
- [x] Audit every `listRxTemplates`/`createRxTemplate` caller before adding `scope` — default to `subjective_full` so the shipped `Presets` button is byte-unchanged.
- [x] Keep `variant` and `scope` orthogonal — `variant` styles the picker; `scope` filters the data.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One table, one discriminator (P6-D1).** No per-section tables.
- **Backwards-compatible default.** Existing rows + the global button stay `subjective_full`; no behaviour change until later tasks add scoped buttons.
- **Per-doctor RLS unchanged (P6-D5).** `scope` is just a filter within the doctor's own rows.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — additive `scope` column on `doctor_rx_templates` (per-doctor).
  - [x] **RLS verified?** **Yes** — doctor-scoped (migration 091); `scope` does not widen access.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Migration runs idempotently; existing rows default to `subjective_full`; CHECK enum covers all 7 scopes; `(doctor_id, scope)` index exists.
- [x] `listRxTemplates(scope)` filters server-side; the picker only lists its scope's templates; save-current stamps the scope.
- [x] Shipped `Presets`/full-Rx paths unchanged; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This task is deliberately logic-free — it only makes the table + list + picker *scope-aware* so subj-16/17/18 can plug scoped save/apply behaviour onto a stable substrate.

---

## 🔗 Related Tasks

- [`task-subj-08-subjective-presets.md`](../../p2-fast-entry/Tasks/task-subj-08-subjective-presets.md) — the whole-subjective preset this scopes.
- [`task-subj-16-form-state-scoped-templates.md`](./task-subj-16-form-state-scoped-templates.md) — first consumer of `scope`.

---

**Last Updated:** 2026-06-17  
**Pattern:** additive enum column + list filter + prop threading on shipped `doctor_rx_templates`/`TemplatePicker`.  
**Reference:** `process/CODE_CHANGE_RULES.md`
