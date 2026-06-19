# Task subj-24: Per-doctor subjective section order (settings column + API)

> **Filename:** `task-subj-24-doctor-settings-section-order.md` in `subjective-tab/p8-section-reorder/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Persist the doctor's preferred Subjective-tab section order. Add a `subjective_section_order` JSONB
array on `doctor_settings` (a list of section-id strings), validate it against the known-id set,
expose get/set on the doctor-settings API, and mirror the field on the frontend with an api client.
This is the **storage + transport** slice — no UI and no seeding (subj-25/26). It is a near-verbatim
clone of subj-21's `subjective_custom_subsections` path.

**Program / Phase:** subjective-tab · Phase 8 (section reorder)  
**Batch:** [`plan-p8-subjective-section-reorder-batch.md`](../plan-p8-subjective-section-reorder-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p8-subjective-section-reorder.md`](./EXECUTION-ORDER-p8-subjective-section-reorder.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ⏳ **PENDING**

**Change Type:**
- [ ] **New feature** — additive `doctor_settings` column + API. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** per-doctor JSONB config precedent `doctor_settings.subjective_custom_subsections` (Phase 7, [migration `145`](../../../../../../../../backend/migrations/145_doctor_settings_subjective_custom_subsections.sql)) + `cockpit_layout_presets`; [`doctor-settings-service.ts`](../../../../../../../../backend/src/services/doctor-settings-service.ts) + [`doctor-settings.ts`](../../../../../../../../backend/src/types/doctor-settings.ts) + the settings controller/route; [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts); subj-23's `SubjectiveSectionId` set.
- ❌ **What's missing:** any stored section-order value or its API.

**Scope Guard:**
- Expected files touched: ≤ 7 (migration; BE settings type; BE validation; BE service; settings controller/route; FE settings type; FE api client).
- **No** UI (subj-25), **no** seeding/merge wiring (subj-26), **no** prescription change.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [ ] 1.1 `146_doctor_settings_subjective_section_order.sql`: add `subjective_section_order JSONB NOT NULL DEFAULT '[]'::jsonb` with `jsonb_typeof = 'array'` CHECK; idempotent (`ADD COLUMN IF NOT EXISTS`, drop+add constraint); comment + rollback line.
  - [ ] 1.1.1 Read prior `doctor_settings` migrations (`099`/`112`/`145`) for shape/RLS/naming first.

### 2. Backend type + validation + service + API
- [ ] 2.1 Add `subjectiveSectionOrder: string[]` to the doctor-settings type (`backend/src/types/doctor-settings.ts`).
- [ ] 2.2 `validation.ts`: Zod = array of strings constrained to the known section-id set (dedupe; **drop/ignore unknown** rather than reject, so a renamed/removed id never bricks a save); cap length to the registry size.
- [ ] 2.3 `doctor-settings-service.ts`: read + upsert the order (clone the `subjective_custom_subsections` accessor pattern).
- [ ] 2.4 Settings controller/route: GET (return in the settings payload) + PATCH (set/replace the order).

### 3. Frontend wiring
- [ ] 3.1 Mirror `subjectiveSectionOrder` on the frontend doctor-settings type + PATCH payload.
- [ ] 3.2 Api client get/set (no UI yet).

### 4. Verification & Testing
- [ ] 4.1 Test: migration idempotent; default reads back `[]`; RLS doctor-scoped.
- [ ] 4.2 Test: Zod dedupes, drops unknown ids, preserves valid order; PATCH round-trips.
- [ ] 4.3 `cd backend && npm test` + `cd frontend && npx tsc --noEmit && npm run lint` clean.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/146_doctor_settings_subjective_section_order.sql
UPDATE: backend/src/types/doctor-settings.ts (subjectiveSectionOrder field)
UPDATE: backend/src/utils/validation.ts (known-id array, dedupe, drop unknown)
UPDATE: backend/src/services/doctor-settings-service.ts (read/upsert)
UPDATE: backend/src/controllers/settings-controller.ts (GET/PATCH via existing route)
UPDATE: frontend/types/doctor-settings.ts (mirror + PATCH payload)
UPDATE: frontend/lib/api/... doctor-settings client (get/set)
CREATE: backend/tests/unit/utils/doctor-settings-subjective-section-order.test.ts
DO NOT TOUCH: prescriptions storage; PDF; cc/hopi; UI (subj-25); seed wiring (subj-26)
```

**When updating existing code:**
- [ ] Clone the `subjective_custom_subsections` get/upsert + validation path; do not invent a new settings mechanism.

**When creating a migration:**
- [ ] Read all previous `doctor_settings` migrations (numeric order) for schema/RLS/naming — MIGRATIONS_AND_CHANGE.md / CODE_CHANGE_RULES.md §4.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Per-doctor default only (P8-D2 / T2-D2).** One value per doctor; doctor-scoped RLS; no clinic sharing.
- **Order is config, not PHI (P8-D4).** A list of section-id strings; never logged.
- **Tolerant validation (P8-D5).** Dedupe + drop unknown ids; the merge against the live registry happens client-side in subj-26.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — additive `doctor_settings` column (doctor-scoped config, not PHI).
  - [ ] **RLS verified?** existing `doctor_settings` RLS covers it; no widening.
- [ ] **Any PHI in logs?** **No** — section ids only.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No new patient surface** — config travels with the doctor account.

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration idempotent; per-doctor default JSONB; RLS unchanged.
- [ ] Zod dedupes + drops unknown ids; GET/PATCH round-trip.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The only subtlety vs subj-21 is validation tolerance: store a clean list, but never reject a save because a stored id is no longer in the registry — reconciliation is the client's job (subj-26).

---

## 🔗 Related Tasks

- [`task-subj-23-section-registry-and-ordered-renderer.md`](./task-subj-23-section-registry-and-ordered-renderer.md) — defines the id set this validates against.
- [`task-subj-26-persist-and-seed-order.md`](./task-subj-26-persist-and-seed-order.md) — loads + saves through this API.

---

**Last Updated:** 2026-06-17  
**Pattern:** per-doctor JSONB config in `doctor_settings` (clone of `subjective_custom_subsections`).  
**Reference:** `process/CODE_CHANGE_RULES.md`
