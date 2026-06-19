# Task subj-21: Per-doctor default custom subsections (settings column + API + seed-on-empty)

> **Filename:** `task-subj-21-doctor-default-subsections.md` in `subjective-tab/p7-custom-subsections/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Make the doctor's custom-subsection **headings reusable** across visits. Store a per-doctor default
subsection structure in `doctor_settings` (a JSONB tree, same shape as subj-19), expose get/set on the
doctor-settings API, and **seed** a fresh visit's `customSubsections` from that default when the visit
has none yet — **never** re-seeding or overwriting an already-saved visit. Add a "Save current as my
default sections" action so the doctor can capture their arrangement.

**Program / Phase:** subjective-tab · Phase 7 (custom subsections)  
**Batch:** [`plan-p7-subjective-custom-subsections-batch.md`](../plan-p7-subjective-custom-subsections-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p7-subjective-custom-subsections.md`](./EXECUTION-ORDER-p7-subjective-custom-subsections.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **New feature** — additive `doctor_settings` column + API + a seed hook. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** per-doctor JSONB config precedent `doctor_settings.cockpit_layout_presets` ([migrations `099`/`112`](../../../../../../../../backend/migrations/)); [`doctor-settings-service.ts`](../../../../../../../../backend/src/services/doctor-settings-service.ts) + [`doctor-settings.ts`](../../../../../../../../backend/src/types/doctor-settings.ts) + the doctor-settings route/controller; subj-19 `customSubsections` shape + seed-on-empty in [`useRxFormProviderSetup.ts`](../../../../../../../../frontend/components/cockpit/rx/useRxFormProviderSetup.ts); "Save current as my default sections" in [`CustomSubsectionsField.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx).
- ❌ **What's missing (was):** any stored default subsection set or seeding of fresh visits — **now implemented**.

**Scope Guard:**
- Expected files touched: ≤ 7 (migration; BE settings type; BE settings service; BE validation; settings controller/route; FE settings type+api; seed hook at hydrate).
- **No** change to the prescription `custom_subsections` storage (subj-19) or PDF (subj-22).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `145_doctor_settings_subjective_custom_subsections.sql`: add `subjective_custom_subsections JSONB NOT NULL DEFAULT '[]'::jsonb` with `jsonb_typeof = 'array'` CHECK; idempotent; comment + rollback line. - **Completed: 2026-06-17**
  - [x] ✅ 1.1.1 Read prior `doctor_settings` migrations (`099`/`112`) for shape/RLS/naming. - **Completed: 2026-06-17**

### 2. Backend settings type + service + API
- [x] ✅ 2.1 Add `subjectiveCustomSubsections` to the doctor-settings type + reuse subj-19's tree Zod schema (depth-2, caps) in `validation.ts`. - **Completed: 2026-06-17**
- [x] ✅ 2.2 `doctor-settings-service.ts`: read + upsert the default (clone the `cockpit_layout_presets` accessor pattern). - **Completed: 2026-06-17**
- [x] ✅ 2.3 Settings controller/route: expose GET (returns default in the settings payload) + PATCH (set/replace the default). - **Completed: 2026-06-17**

### 3. Frontend wiring + seeding
- [x] ✅ 3.1 Mirror the settings field + api client get/set on the frontend. - **Completed: 2026-06-17**
- [x] ✅ 3.2 **Seed-on-empty:** when a fresh visit hydrates (`useRxFormProviderSetup` when no prescription exists) with empty `customSubsections`, populate from the doctor's default (new ids, titles/structure, empty bodies). Saved visits never re-seed. - **Completed: 2026-06-17**
- [x] ✅ 3.3 "Save current as my default sections" action (in the editor): PATCH the default from the current `customSubsections` titles/structure. - **Completed: 2026-06-17**

### 4. Verification & Testing
- [x] ✅ 4.1 Test: migration idempotent; default reads back `[]`; RLS doctor-scoped. - **Completed: 2026-06-17**
- [x] ✅ 4.2 Test: fresh visit seeds from default; saved visit with content is NOT re-seeded; visit explicitly emptied by doctor stays empty. - **Completed: 2026-06-17** (seed only in new-visit bootstrap; `rxFormFieldsFromPrescription` unchanged)
- [x] ✅ 4.3 Test: "save as default" round-trips; setting the default never mutates any patient's prescription row. - **Completed: 2026-06-17**
- [x] ✅ 4.4 `cd backend && npm test` + `cd frontend && npx tsc --noEmit && npm run lint` clean. - **Completed: 2026-06-17** (subj-21 slice tests green)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/145_doctor_settings_subjective_custom_subsections.sql
UPDATE: backend/src/types/doctor-settings.ts (default field)
UPDATE: backend/src/utils/validation.ts (reuse subj-19 tree schema for the default)
UPDATE: backend/src/services/doctor-settings-service.ts (read/upsert default)
UPDATE: backend/src/controllers/settings-controller.ts (GET/PATCH via existing route)
UPDATE: frontend/types/doctor-settings.ts (mirror + PATCH payload)
UPDATE: frontend/components/cockpit/rx/useRxFormProviderSetup.ts (seed-on-empty at new visit)
UPDATE: frontend/lib/cockpit/custom-subsections.ts (template + seed helpers)
UPDATE: frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx (save-as-default action)
CREATE: backend/tests/unit/utils/doctor-settings-subjective-custom-subsections.test.ts
CREATE: frontend/lib/cockpit/__tests__/custom-subsections-default.test.ts
DO NOT TOUCH: prescriptions.custom_subsections storage (subj-19); PDF (subj-22)
```

**When updating existing code:**
- [x] Audit how a new visit initialises form state vs reopening a saved one — the seed must key off "no existing prescription / empty field", not just emptiness.
- [x] Clone the `cockpit_layout_presets` get/upsert + validation path; do not invent a new settings mechanism.

**When creating a migration:**
- [x] Read all previous migrations (numeric order) for `doctor_settings` schema/RLS/naming — MIGRATIONS_AND_CHANGE.md / CODE_CHANGE_RULES.md §4.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Per-doctor default in `doctor_settings` (P7-D4 / T2-D2).** One value per doctor; doctor-scoped RLS; no clinic sharing.
- **Seed-on-empty, never overwrite (P7-D5).** Defaults only populate a brand-new visit's empty field; managing the default must never touch saved patient data.
- **Reuse subj-19 validation (P7-D2).** Same depth-2/caps schema for the default tree.
- **No PHI in the default (P7-D6).** The default is doctor-authored headings/structure (not patient data), but still doctor-scoped + never logged.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — additive `doctor_settings` column (doctor-scoped, doctor-authored config).
  - [x] **RLS verified?** existing `doctor_settings` RLS covers it; no widening.
- [x] **Any PHI in logs?** **No** — default holds doctor headings, not patient data; still never logged.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No new patient surface** — config travels with the doctor account.

---

## ✅ Acceptance & Verification Criteria

- [x] Migration idempotent; per-doctor default JSONB; RLS unchanged.
- [x] Fresh visit seeds from the default; saved visits (incl. doctor-emptied ones) are never re-seeded.
- [x] "Save current as my default" persists; editing the default never mutates a prescription.
- [x] `tsc`/lint/tests green (subj-21 slice).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The trickiest correctness point is distinguishing "new visit, never had custom subsections" from "saved visit the doctor deliberately cleared". Seed only on the former — keyed off no existing prescription in `useRxFormProviderSetup`, not in `rxFormFieldsFromPrescription`.

---

## 🔗 Related Tasks

- [`task-subj-19-data-model-custom-subsections.md`](./task-subj-19-data-model-custom-subsections.md) — shape + hydrate hook this seeds into.
- [`task-subj-20-custom-subsections-editor-ui.md`](./task-subj-20-custom-subsections-editor-ui.md) — surfaces the "save as default" action.

---

**Last Updated:** 2026-06-17  
**Pattern:** per-doctor JSONB default in `doctor_settings` (clone of `cockpit_layout_presets`) + one-way seed-on-empty at visit hydrate.  
**Reference:** `process/CODE_CHANGE_RULES.md`
