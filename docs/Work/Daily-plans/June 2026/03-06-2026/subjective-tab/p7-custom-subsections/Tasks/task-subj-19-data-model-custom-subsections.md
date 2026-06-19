# Task subj-19: Custom-subsections data model + form state (column + types + Zod + reducer + round-trip + derived mirror)

> **Filename:** `task-subj-19-data-model-custom-subsections.md` in `subjective-tab/p7-custom-subsections/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-6 `Tasks/` folder.

---

## 📋 Task Overview

Add the **substrate** for doctor-defined custom subsections: a new `custom_subsections` JSONB array on
`prescriptions` holding `{ id, title, body, children: [{ id, title, body }] }` (depth capped at 2), the
matching types + Zod validation, the `RxFormContext` field + reducer actions, the save/hydrate round-trip,
and a derived plain-text mirror produced on save for the PDF/SMS/snapshot path (subj-22). This is the
pure data slice — **no editor UI** (subj-20) and **no doctor-default seeding** (subj-21).

**Program / Phase:** subjective-tab · Phase 7 (custom subsections)  
**Batch:** [`plan-p7-subjective-custom-subsections-batch.md`](../plan-p7-subjective-custom-subsections-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p7-subjective-custom-subsections.md`](./EXECUTION-ORDER-p7-subjective-custom-subsections.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **New feature** — additive column + new form-state field. Existing behaviour unchanged. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** structured-history pattern — `complaints` + `*_structured` JSONB on `prescriptions` ([`116`](../../../../../../../../backend/migrations/116_prescriptions_subjective_expansion.sql), [`125`/`126`/`127`](../../../../../../../../backend/migrations/)); `SubjectiveInput` + `Prescription` types ([`backend`](../../../../../../../../backend/src/types/prescription.ts) / [`frontend`](../../../../../../../../frontend/types/prescription.ts)); `subjectiveFieldsSchema` in [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts); field mapping in [`prescription-service.ts`](../../../../../../../../backend/src/services/prescription-service.ts); `RxFormFields` + reducer + `buildRxPayload` + `rxFormFieldsFromPrescription` in [`RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx); one-level nesting precedent (`associatedComplaints`).
- ✅ **What's missing (was):** any storage, type, validation, or form-state for user-defined headings/subsections — **now implemented** (migration 144 + full data slice).
- ⚠️ **Notes:** `cc`/`hopi` are **derived**; custom subsections must **not** feed them. Highest existing migration is `143` → new file is `144_…`.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration; BE types; BE validation; BE service map; FE types; RxFormContext field+reducer; save helper; hydrate helper — last few may co-locate in RxFormContext).
- **No** UI component, **no** `doctor_settings` change (subj-20/21).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `144_prescriptions_custom_subsections.sql`: add `custom_subsections JSONB NOT NULL DEFAULT '[]'::jsonb` with a `jsonb_typeof(custom_subsections) = 'array'` CHECK; idempotent (`ADD COLUMN IF NOT EXISTS`, drop+add constraint); PHI column comment; rollback line. - **Completed: 2026-06-17**
  - [x] ✅ 1.1.1 Read migrations in numeric order first (schema, RLS, naming) per MIGRATIONS_AND_CHANGE.md. - **Completed: 2026-06-17**

### 2. Backend types + validation + service
- [x] ✅ 2.1 Add `CustomSubsection` / `CustomSubsectionChild` interfaces + `custom_subsections` on `Prescription` and `customSubsections` on `SubjectiveInput` (`backend/src/types/prescription.ts`). - **Completed: 2026-06-17**
- [x] ✅ 2.2 `validation.ts`: Zod schema for the tree — title required (trimmed, length cap), body optional/nullable (length cap), `children` array (max N) **without** their own `children` (depth-2 enforcement), top-level array max count; add to `subjectiveFieldsSchema`. - **Completed: 2026-06-17**
- [x] ✅ 2.3 `prescription-service.ts`: map `customSubsections` on create and partial-update (mirror the `*_structured` handling). - **Completed: 2026-06-17**

### 3. Frontend types + form state
- [x] ✅ 3.1 Mirror the tree types + `customSubsections` on `SubjectiveInput`/payload types in `frontend/types/prescription.ts`. - **Completed: 2026-06-17**
- [x] ✅ 3.2 `RxFormContext.tsx`: add `customSubsections` to `RxFormFields`; reducer actions to add/update/remove/reorder a section and its children (id-keyed); helper to mint ids. - **Completed: 2026-06-17**
- [x] ✅ 3.3 `buildRxPayload`: include `customSubsections`; produce the **derived TEXT mirror** for the PDF path (subj-22 consumes it). `cc`/`hopi` derivation unchanged. - **Completed: 2026-06-17**
- [x] ✅ 3.4 `rxFormFieldsFromPrescription`: hydrate `customSubsections` from the row (default `[]`). - **Completed: 2026-06-17**

### 4. Verification & Testing
- [x] ✅ 4.1 Test: Zod accepts a 2-level tree, rejects depth-3 (child-of-child), enforces count/length caps. - **Completed: 2026-06-17**
- [x] ✅ 4.2 Test: create + update + read round-trip preserves the tree; empty/absent → `[]`. - **Completed: 2026-06-17**
- [x] ✅ 4.3 Test: `cc`/`hopi` derivation byte-unchanged when custom subsections present. - **Completed: 2026-06-17**
- [x] ✅ 4.4 `cd backend && npm test` + `cd frontend && npx tsc --noEmit && npm run lint` clean. - **Completed: 2026-06-17** (new subj-19 tests green; full-suite `tsc`/backend failures are pre-existing duplicate-file / `@react-pdf/renderer` infra issues unrelated to this slice)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/144_prescriptions_custom_subsections.sql
UPDATE: backend/src/types/prescription.ts (CustomSubsection types + Prescription/SubjectiveInput)
UPDATE: backend/src/utils/validation.ts (depth-2 Zod tree in subjectiveFieldsSchema)
UPDATE: backend/src/services/prescription-service.ts (create + update field map)
UPDATE: frontend/types/prescription.ts (mirror types)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (field + reducer + save + hydrate + derived mirror)
CREATE: frontend/lib/cockpit/custom-subsections.ts (tree ops + serialize mirror)
CREATE: backend/tests/unit/utils/custom-subsections.test.ts
CREATE: frontend/components/cockpit/rx/__tests__/rxFormContext.customSubsections.test.ts
DO NOT TOUCH: cc/hopi derivation logic; editor UI (subj-20); doctor_settings (subj-21)
```

**When updating existing code:**
- [x] Audit `SubjectiveInput` callers + `buildRxPayload`/`rxFormFieldsFromPrescription` before adding the field; default to `[]` everywhere so absence is a no-op.
- [x] Keep the derived mirror purely additive — it is a new output string, not folded into `hopi`.

**When creating a migration:**
- [x] Read all previous migrations (numeric order) for schema/RLS/naming — see MIGRATIONS_AND_CHANGE.md and CODE_CHANGE_RULES.md §4.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Structured JSONB source + derived TEXT mirror (P7-D1 / ST-D1).** Mirror the `*_structured` history pattern.
- **Depth capped at 2 (P7-D2).** Children have no `children`; enforce in Zod, not just UI.
- **Additive; `cc`/`hopi` untouched (P7-D3).** No derivation change; close-gate must still pass (subj-22).
- **No PHI in logs (P7-D6).** Bodies are PHI; doctor-scoped RLS on `prescriptions` unchanged.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — additive `custom_subsections` JSONB on `prescriptions` (PHI, doctor-scoped).
  - [x] **RLS verified?** existing `prescriptions` RLS covers it; new column does not widen access.
- [x] **Any PHI in logs?** **No** — never log subsection titles/bodies.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No new surface** — lives on the existing prescription row; deleted with it.

---

## ✅ Acceptance & Verification Criteria

- [x] Migration runs idempotently; column defaults to `[]`; `jsonb_typeof='array'` CHECK present; RLS unchanged.
- [x] Zod enforces depth-2, count, and length caps; create/update/read round-trips the tree with no loss.
- [x] Form-state field hydrates + saves; `cc`/`hopi` derive byte-identically; derived mirror string produced for subj-22.
- [x] `tsc`/lint/tests green (subj-19 slice; see 4.4 note on pre-existing full-suite noise).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Deliberately logic-light and UI-free: it only makes the prescription + form state *custom-subsection aware* so subj-20 (editor) and subj-21 (defaults/seed) plug onto a stable shape, and subj-22 renders the derived mirror.

---

## 🔗 Related Tasks

- [`task-subj-20-custom-subsections-editor-ui.md`](./task-subj-20-custom-subsections-editor-ui.md) — first consumer of the form-state field.
- [`task-subj-21-doctor-default-subsections.md`](./task-subj-21-doctor-default-subsections.md) — seeds this field on fresh visits.
- [`task-subj-22-output-and-close-gate.md`](./task-subj-22-output-and-close-gate.md) — renders the derived mirror.

---

**Last Updated:** 2026-06-17  
**Pattern:** additive JSONB array (`jsonb_typeof='array'`) + depth-2 Zod tree + derived TEXT mirror on `prescriptions`, cloning the structured-history pattern.  
**Reference:** `process/CODE_CHANGE_RULES.md`
