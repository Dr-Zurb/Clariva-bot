# Task obj-16: Objective template scope + `objective_json` foundation (migration + types + Zod + service + API + picker variant)

> **Filename:** `task-obj-16-objective-template-scope-foundation.md` in `objective-tab/p4-exam-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Extend the shipped `doctor_rx_templates` table so it can also hold **objective** templates: add the
objective `scope` enum values and **one** additive `objective_json` JSONB payload column (a mirror of
`subjective_json`, migration 119), then thread the new shape end-to-end — types both sides, Zod
validation, the `listRxTemplates(scope)` filter, and the picker's `objective` variant. This is the
pure substrate — **no apply/save logic, no new buttons, no specialty packs** (those are obj-17/18/19).

**Program / Phase:** objective-tab · Phase 4 (exam templates + specialty packs)  
**Batch:** [`plan-p4-objective-tab-exam-templates-batch.md`](../plan-p4-objective-tab-exam-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p4-objective-tab-exam-templates.md`](./EXECUTION-ORDER-p4-objective-tab-exam-templates.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ⏳ **PENDING** — **Opus** (hard rule: new migration; additive JSONB column — downgrade to Auto only under an explicit migration policy)

**Change Type:**
- [ ] **Update existing** — extend the shipped template table + types + the list/validation path. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** [`119_doctor_rx_templates_subjective_json.sql`](../../../../../../../../backend/migrations/119_doctor_rx_templates_subjective_json.sql) (`subjective_json`); [`141_doctor_rx_templates_scope.sql`](../../../../../../../../backend/migrations/141_doctor_rx_templates_scope.sql) + [`149_doctor_rx_templates_custom_block_scope.sql`](../../../../../../../../backend/migrations/149_doctor_rx_templates_custom_block_scope.sql) (the `scope` enum); [`rx-template-service.ts`](../../../../../../../../backend/src/services/rx-template-service.ts) (`listRxTemplates(scope?)`, `createRxTemplate`, `normalizeSubjective`); types both sides ([`backend`](../../../../../../../../backend/src/types/rx-template.ts) / [`frontend`](../../../../../../../../frontend/types/rx-template.ts)); [`TemplatePicker.tsx`](../../../../../../../../frontend/components/ehr/TemplatePicker.tsx) (`variant` + `scope`).
- ❌ **What's missing:** an `objective_json` payload column; the objective `scope` enum values; the objective payload type + Zod shape; the picker `objective` variant.

**Scope Guard:**
- Expected files touched: ≤ 7 (migration; BE type; BE validation; BE service; FE type; FE api client; picker). **No** apply/save logic (obj-17), **no** buttons (obj-17), **no** packs (obj-18).
- Highest existing migration is `152` — new file is `153_doctor_rx_templates_objective_json.sql`.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [ ] 1.1 `153_doctor_rx_templates_objective_json.sql`: add `objective_json JSONB NOT NULL DEFAULT '{}'::jsonb` with a `jsonb_typeof(objective_json) = 'object'` CHECK (clone migration 119's `subjective_json` block); idempotent (`ADD COLUMN IF NOT EXISTS`, drop+add constraint); header comment + rollback line.
- [ ] 1.2 Extend the `scope` CHECK enum (migrations 141/149) with the objective values: `objective_full`, `vitals`, `exam_systemic`, `exam_general`, `exam_cvs`, `exam_resp`, `exam_abd`, `exam_cns`, `objective_custom_block`. Idempotent drop+add of the CHECK constraint; preserve all existing subjective scopes; existing rows + default unchanged.

### 2. Backend types + validation + service
- [ ] 2.1 Add the objective scope values to the `RxTemplateScope` union + an `RxTemplateObjective` payload interface in `backend/src/types/rx-template.ts` (exam findings array + the `vitals_*` subset + `testResults` text + custom-section array; camelCase keys, mirror `RxTemplateSubjective`).
- [ ] 2.2 `validation.ts`: validate the new scope values; validate `objective_json` shape (drop unknown keys; bound array sizes; reuse the exam/custom-subsection validators where they exist).
- [ ] 2.3 `rx-template-service.ts`: `normalizeObjective(input.objective)` on create/patch (mirror `normalizeSubjective`); persist + read `objective_json`; `listRxTemplates(scope)` already filters — confirm it covers the objective scopes.

### 3. Frontend types + API client
- [ ] 3.1 Mirror the objective scope union + `objectiveJson`/`RxTemplateObjective` field in `frontend/types/rx-template.ts` (`DoctorRxTemplate` + `RxTemplatePayload`).
- [ ] 3.2 `frontend/lib/api.ts`: confirm `listRxTemplates`/`createRxTemplate` carry the optional `scope` + `objective` payload through (no new endpoint — same routes).

### 4. Picker variant wiring
- [ ] 4.1 `TemplatePicker.tsx`: add an `objective` value to `variant`; pass the objective `scope` to `listRxTemplates`; stamp it onto save-current payloads. Keep `full`/`subjective` working byte-unchanged.

### 5. Verification & Testing
- [ ] 5.1 Test: migration enum includes the objective scopes + default unchanged; `objective_json` CHECK rejects non-objects; `listRxTemplates(objective scope)` filters; existing subjective rows read back unchanged.
- [ ] 5.2 `cd backend && npm test` + `cd frontend && npx tsc --noEmit && npm run lint` clean (route pre-existing unrelated noise).

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/153_doctor_rx_templates_objective_json.sql
UPDATE: backend/src/types/rx-template.ts (objective scope union + RxTemplateObjective payload)
UPDATE: backend/src/utils/validation.ts (objective scope enum + objective_json shape)
UPDATE: backend/src/services/rx-template-service.ts (normalizeObjective + persist/read objective_json)
UPDATE: frontend/types/rx-template.ts (objective scope + objectiveJson mirror)
UPDATE: frontend/lib/api.ts (carry scope + objective payload — no new endpoint)
UPDATE: frontend/components/ehr/TemplatePicker.tsx (objective variant → list filter + save payload)
DO NOT TOUCH: the apply/save objective logic (obj-17+), any objective section button (obj-17), specialty packs (obj-18)
```

**When updating existing code:**
- [ ] Audit every `listRxTemplates`/`createRxTemplate` caller before extending — subjective callers must stay byte-unchanged (default scope/payload behaviour preserved).
- [ ] Keep `variant` and `scope` orthogonal (as subjective P6 did) — `variant` styles the picker; `scope` filters the data.
- [ ] `objective_json` mirrors `subjective_json` exactly in shape discipline (object, camelCase, app-validated).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One table, reuse the discriminator (P4-D1).** No per-section tables; add scopes + one payload column only.
- **Backwards-compatible default.** Existing rows + the subjective/full buttons stay exactly as today; no behaviour change until obj-17 adds objective buttons.
- **Per-doctor RLS unchanged (P4-D6).** `objective_json` + the new scopes are config-not-PHI within the doctor's own rows; RLS (template table's existing policy) is untouched.
- **Config, not PHI.** A template payload is *the doctor's reusable starter content*, not a patient's record — document this in the migration comment (mirror 119).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — additive `objective_json` column + scope enum values on `doctor_rx_templates` (per-doctor).
  - [ ] **RLS verified?** **Yes** — doctor-scoped (template table policy); neither change widens access.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

> **STOP/Opus gate:** this task lands a **new migration** — per the agent contract it is Opus-grade. The change is additive + idempotent (one JSONB column + an enum widen); if your migration policy permits Auto for additive columns, downgrade explicitly.

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration runs idempotently; `objective_json` defaults to `{}` with a `jsonb_typeof = 'object'` CHECK; the `scope` enum gains the objective values; existing rows + RLS unchanged.
- [ ] Zod validates the objective scopes + `objective_json` shape (drops unknown keys, bounds arrays); GET/PATCH round-trip; `listRxTemplates(scope)` filters objective scopes server-side.
- [ ] Shipped subjective/full template paths byte-unchanged; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Deliberately logic-free — it only makes the template table + list + picker *objective-scope-aware* so obj-17/18/19 can plug scoped save/apply + packs onto a stable substrate. Direct analog of subjective `subj-15`, plus the `objective_json` column (clone of migration 119).

---

## 🔗 Related Tasks

- [`task-subj-15-template-scope-foundation.md`](../../../../03-06-2026/subjective-tab/p6-section-templates/Tasks/task-subj-15-template-scope-foundation.md) — the subjective substrate this mirrors.
- [`task-obj-17-form-state-scoped-objective-templates.md`](./task-obj-17-form-state-scoped-objective-templates.md) — first consumer of the objective scopes.

---

**Last Updated:** 2026-06-19  
**Pattern:** additive JSONB payload column (clone migration 119) + enum widen + list filter + picker variant on the shipped `doctor_rx_templates`/`TemplatePicker`.  
**Reference:** `process/CODE_CHANGE_RULES.md`
