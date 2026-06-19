# Task subj-01: Data model + state — `complaints` array, owned history columns, `cc`/`hopi` derivation

> **Filename:** `task-subj-01-data-model-complaints-and-histories.md` in `subjective-tab/p1-complaint-cards/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add the **data foundation** for the structured Subjective tab: a `complaints` JSONB array
and three owned history columns (`family_history`, `social_history`,
`past_surgical_history`) on `prescriptions`; the matching `RxFormFields` shape +
`Complaint` type + reducer actions (mirroring the existing `medicines` array pattern); and
the **derivation of `cc` / `hopi` from `complaints`** in `buildRxPayload` so the PDF, SMS
summary, and snapshot are untouched (ST-D2). This is the keystone — every other Phase-1
task reads this state.

**Program / Phase:** subjective-tab · Phase 1 (complaint-cards)  
**Batch:** [`plan-p1-subjective-tab-complaint-cards-batch.md`](../plan-p1-subjective-tab-complaint-cards-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md`](./EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **New feature** — new columns + new form fields + new reducer actions.
- [x] **Update existing** — `cc`/`hopi` move from hand-entered to derived; `buildRxPayload` + the create/update read paths change. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (checked against the codebase)
- ✅ **What exists:**
  - `prescriptions` owns `cc` + `hopi` (and the rest of the SOAP columns) — [`backend/migrations/103_prescription_soap_fields_expansion.sql`](../../../../../../../../backend/migrations/103_prescription_soap_fields_expansion.sql).
  - The `medicines` array + `ADD/UPDATE/REMOVE_MEDICINE` reducer + `buildRxPayload` + `rxFormFieldsFromPrescription` — [`frontend/components/cockpit/rx/RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx).
  - The prescription create/update service + payload types + PDF/notification mappers — `backend/src/services/prescription-service.ts`, `prescription-pdf-service.ts`, `notification-service.ts`.
- ❌ **What's missing:** the `complaints` JSONB column + 3 history columns; the `Complaint` type + `complaints`/`familyHistory`/`socialHistory`/`pastSurgicalHistory` fields; complaint reducer actions; the `cc`/`hopi` derivation.
- ⚠️ **Notes:** highest existing migration is `115_*`; this is **116**. RLS on `prescriptions` (migration 026, `auth.uid() = doctor_id`) already covers new columns — do not add policies.

**Scope Guard:**
- Expected files touched: ≤ 6 (1 migration; `RxFormContext.tsx`; the prescription service + types; PDF/notification mappers if the derivation moves there; 1–2 unit tests). Any expansion (a pane body, the card UI, a new table) requires explicit approval — card UI is subj-02.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4 (migrations: read all prior migrations first) — the `cc`/`hopi` change is "update existing".
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [BACKEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/ARCHITECTURE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration — `prescriptions` subjective expansion
- [ ] 1.1 Read all prior migrations in numeric order (esp. 026 RLS, 103 SOAP expansion) to match naming, RLS, idempotency, and PHI-comment conventions.
- [ ] 1.2 Create `backend/migrations/116_prescriptions_subjective_expansion.sql` adding `complaints` (JSONB, default empty array) + `family_history` / `social_history` / `past_surgical_history` (nullable text), all `ADD COLUMN IF NOT EXISTS`.
  - [ ] 1.2.1 Add PHI column comments (every new column carries PHI; 7-year retention per COMPLIANCE).
  - [ ] 1.2.2 Confirm no RLS change is needed (migration 026 covers all columns); document the rollback in the header comment (103's pattern).

### 2. Backend read/write plumbing
- [ ] 2.1 Extend the create + update prescription payload + row types to carry `complaints` + the 3 history fields.
- [ ] 2.2 Persist + read them back in `prescription-service.ts`; keep `cc`/`hopi` columns populated (from the derivation — see §4).
- [ ] 2.3 Confirm the PDF + SMS summary + snapshot read `cc`/`hopi` exactly as today (no shape change for them).

### 3. Frontend form state
- [ ] 3.1 Add the `Complaint` type + `complaints` / `familyHistory` / `socialHistory` / `pastSurgicalHistory` to `RxFormFields`; extend `createEmptyRxFormFields` + `rxFormFieldsFromPrescription`.
- [ ] 3.2 Add reducer actions `ADD_COMPLAINT` / `UPDATE_COMPLAINT` / `REMOVE_COMPLAINT` / `REORDER_COMPLAINTS`, mirroring the medicine actions (immutable updates, `isDirty` flips).

### 4. Derive `cc` / `hopi`
- [ ] 4.1 In `buildRxPayload`, derive `cc` (joined complaint names, primary first) and `hopi` (formatted multi-complaint OLDCARTS summary) from `complaints`.
- [ ] 4.2 Preserve a manual free-text fallback: if the doctor edited the fallback directly, it is not clobbered by the derivation (subj-02 owns the fallback input; this task defines the precedence rule).

### 5. Verification & Testing
- [ ] 5.1 Migration runs cleanly on a fresh + an already-migrated DB (idempotent); existing rows have `complaints = []`.
- [ ] 5.2 Unit tests: reducer add/update/remove/reorder; `buildRxPayload` derivation produces stable `cc`/`hopi`; round-trip `rxFormFieldsFromPrescription` ↔ payload.
- [ ] 5.3 `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend type-check/tests green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/116_prescriptions_subjective_expansion.sql
UPDATE: backend/src/services/prescription-service.ts (+ payload/row types)
UPDATE: backend/src/services/prescription-pdf-service.ts / notification-service.ts (only if cc/hopi derivation lands server-side)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (fields + Complaint type + reducer + buildRxPayload derivation)
CREATE: frontend/components/cockpit/rx/__tests__/rxFormContext.complaints.test.ts (reducer + derivation)
DO NOT TOUCH: the card UI (subj-02), the schema registry (subj-03), Objective/Assessment/Plan
```

**When updating existing code:**
- [ ] Audit `cc`/`hopi` writers + readers (form, service, PDF, SMS, snapshot, public-prescription) before moving them to derived — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] Map the change: new columns + new fields + reducer + derivation; keep `cc`/`hopi` columns populated for back-compat.
- [ ] Remove no production read of `cc`/`hopi` (they stay); only their *source* changes.

**When creating a migration:**
- [ ] Read all previous migrations (numeric order) first — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Additive only (ST-D1).** No existing column dropped/renamed; `complaints` defaults to an empty array so legacy rows are valid.
- **Derivation, not duplication (ST-D2).** `cc`/`hopi` are computed from `complaints`; downstream readers are untouched. The free-text fallback has a defined precedence (state it; don't implement both writers fighting).
- **Mirror the medicines pattern.** The reducer actions + immutability + `isDirty` semantics match the existing medicine actions (consistency, autosave wiring is free).
- **RLS unchanged.** `prescriptions` doctor-only access (migration 026) covers the new columns; add no policy.
- **No PHI in logs** (COMPLIANCE); the new columns are PHI.

**DO NOT include** code, schemas, or signatures in this file — the SQL/type shapes live in the product plan + the code.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** (new PHI columns on `prescriptions`).
  - [ ] **RLS verified?** **Yes** — migration 026 doctor-only policy covers new columns; no new table.
- [ ] **Any PHI in logs?** **No** (must stay No).
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **Yes (additive)** — new PHI columns inherit the prescription 7-year retention; account-deletion cascade already covers `prescriptions`.

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration 116 idempotent; existing rows get `complaints = []`; RLS unchanged.
- [ ] `complaints` + 3 history fields persist + hydrate via create/update/autosave.
- [ ] `cc`/`hopi` derived from `complaints`; PDF + SMS + snapshot byte-identical for an equivalent note.
- [ ] Reducer + derivation unit-tested; `tsc`/lint/suites green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Keystone of Phase 1: schema + shared form state + the send-payload derivation. The only
sharp edge is the `cc`/`hopi` source change — audit every reader first; they keep reading
the same columns, only the *writer* changes.

---

## 🔗 Related Tasks

- [`task-subj-02-complaint-card-and-list-ui.md`](./task-subj-02-complaint-card-and-list-ui.md) — consumes this state to render the cards.
- [`task-subj-04-owned-history-fields.md`](./task-subj-04-owned-history-fields.md) — binds the 3 history fields.

---

**Last Updated:** 2026-06-03  
**Pattern:** additive migration + medicines-mirrored array state + derived `cc`/`hopi`.  
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
