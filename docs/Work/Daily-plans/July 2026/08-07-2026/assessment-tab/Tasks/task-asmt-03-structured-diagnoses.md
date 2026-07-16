# Task asmt-03: Structured diagnoses (`diagnoses_json`) + `provisional_diagnosis` derivation parity

> **Filename:** `task-asmt-03-structured-diagnoses.md` in `assessment-tab/Tasks/`.
> **Links:** batch plan [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-assessment-tab.md`](./EXECUTION-ORDER-assessment-tab.md). Code paths **repo-relative**.

---

## 🛑 ESCALATION (agent contract)

This task **adds a new migration and a new PHI column** and changes how a **patient-facing** field (`provisional_diagnosis`) is produced. Per `.cursor/rules/00-agent-contract.mdc`, that is an explicit STOP: do **not** start implementation on Auto/Sonnet. **Flag for Opus and surface the migration + PHI-column + derivation-parity plan for approval before writing any SQL or types.** This file is the plan, not a licence to proceed unattended.

---

## 📋 Task Overview

Today the diagnosis is a single free-text `provisional_diagnosis` string. This task models diagnoses as a **structured list** so a visit can carry a primary + secondary diagnoses, each with certainty, status and severity — while keeping the shipped `provisional_diagnosis` TEXT (and the DDx array) as the **canonical output substrate**, byte-identical to today (ASMT-D4 / OBJ-D2 analog).

1. **Row model (`DiagnosisRow`)** stored in a new `prescriptions.diagnoses_json` JSONB array (migration **161**):
   `{ id, label, kind: 'primary' | 'secondary', certainty: 'provisional' | 'rule_out' | 'confirmed', status: 'new' | 'ongoing' | 'resolved', severity?: 'mild' | 'moderate' | 'severe' | null, note?: string | null }`.
   All fields except `id` + `label` are defaulted/optional.
2. **Tolerant Zod (FE + BE)** mirroring `test_results_json` / `examination_json`: a malformed row drops at the array level, never rejecting the prescription; unknown `kind`/`certainty`/`status` fall back to defaults (`secondary` / `provisional` / `new`).
3. **Derivation parity (the invariant):** on save, the **primary** row's `label` derives into `provisional_diagnosis` so that — for a visit with one diagnosis — the value is **byte-identical** to the legacy free-text behaviour. A legacy single free-text Dx **hydrates** into one primary row on load. `differential_diagnosis` stays exactly as-is (DDx is not folded into `diagnoses_json` in v1).
4. **Editor** in the Assessment tab: add/edit/remove diagnosis rows (primary pinned first), replacing the single Dx input — the strip's glance Dx continues to show the primary label.

**Program / Batch:** assessment-tab · Wave 3
**Plan:** [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md)
**Estimated Time:** ~5–7 hours
**Status:** Draft — not implemented. **Model: Opus** (migration + PHI column + patient-facing derivation parity; surface plan for approval first).

**Change Type:**
- [ ] ✅ **Update existing** (types + Zod + reducer + derivation) **+ New** (migration 161, `diagnoses_json`). Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `provisional_diagnosis` TEXT + `differential_diagnosis` string[] on `Prescription`; `provisionalDiagnosis: string` + `differentialDiagnosis: string[]` in `RxFormFields`; `buildRxPayload` emits `provisionalDiagnosis: fields.provisionalDiagnosis.trim() || null` (≈ L1191) and `differentialDiagnosis` (≈ L1214); the reducer's `ADD_DDX`/`REMOVE_DDX` + the `test_results_json` reducer actions (`ADD/UPDATE/REMOVE_TEST_RESULT`) are the row-CRUD precedent; derive-on-save precedent in `frontend/lib/cockpit/test-results.ts`; migrations run to **160** after asmt-02 (next = **161**; confirm).
- ⚠️ **Invariant:** RLS on `prescriptions` covers all columns via `auth.uid() = doctor_id` (migration 026). Do **not** add/modify RLS. Output readers (`prescription-pdf-composer.ts`, `PrescriptionDocument.tsx`, `notification-service.ts`, `VisitDetailSideSheet.tsx`) read `provisional_diagnosis` / `differential_diagnosis` — they MUST stay untouched.

**Scope Guard:**
- Expected files touched: the two `prescription.ts` type files, `validation.ts`, `RxFormContext.tsx` (fields + hydrate + reducer actions + `buildRxPayload` derivation), the Assessment editor + a diagnosis-rows list component, a new derivation helper (mirror `test-results.ts`), and `backend/migrations/161_*.sql`.
- **DO NOT** edit RLS. **DO NOT** change the `provisional_diagnosis` / `differential_diagnosis` **output shape** — only how `provisional_diagnosis` is *derived*. **DO NOT** add ICD/SNOMED coding (ASMT-D7). **DO NOT** build problem linkage (asmt-04).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` · migration pattern `backend/migrations/154_prescriptions_test_results_json.sql`; derivation pattern `frontend/lib/cockpit/test-results.ts`.

---

## ✅ Task Breakdown (Hierarchical)

### 0. Escalation gate
- [ ] 0.1 STOP: migration + PHI-column + derivation-parity plan surfaced and approved before any code (agent contract).

### 1. Row + types
- [ ] 1.1 Add the `DiagnosisRow` type (fields above) + `diagnoses_json: DiagnosisRow[]` on `Prescription` (FE + BE, in sync). Add `diagnosesJson?: DiagnosisRow[]` to `StructuredSoapInput`.
- [ ] 1.2 Add `diagnoses: DiagnosisRow[]` to `RxFormFields` + `createEmptyRxFormFields` (empty array).

### 2. Migration 161
- [ ] 2.1 `backend/migrations/161_prescriptions_diagnoses_json.sql`: `ADD COLUMN IF NOT EXISTS diagnoses_json JSONB NOT NULL DEFAULT '[]'::jsonb` + drop/add array CHECK, mirroring 154. `COMMENT ON COLUMN` marks it PHI.
- [ ] 2.2 Header block documents PHI + 7-year retention + RLS-unchanged + idempotency + documented rollback. Content-sanity test mirroring `159-…migration.test.ts`.

### 3. Tolerant Zod (FE + BE)
- [ ] 3.1 Add `diagnosisRowSchema` + `diagnosesJsonSchema` in `validation.ts`, mirroring `testResultsJsonSchema`: malformed row (missing id/label) drops at array level; unknown `kind`/`certainty`/`status`/`severity` `.catch(default/null)`; note trimmed → null.

### 4. Hydrate + derivation parity (the invariant)
- [ ] 4.1 Add a `normalizeDiagnoses` + `derivePrimaryDiagnosis` helper (new module, mirror `test-results.ts`). `derivePrimaryDiagnosis(rows)` = the primary row's trimmed label (fallback: first row) or `""`.
- [ ] 4.2 Hydrate in `rxFormFieldsFromPrescription`: prefer `diagnoses_json` when non-empty; else **seed one primary row** from the legacy `provisional_diagnosis` string (so old prescriptions edit as structured without a data migration). Keep `provisionalDiagnosis` field in sync for the strip glance.
- [ ] 4.3 In `buildRxPayload`: when `diagnoses` non-empty, `provisionalDiagnosis = derivePrimaryDiagnosis(diagnoses)`; else keep the legacy `fields.provisionalDiagnosis.trim() || null` passthrough. Emit `diagnosesJson: normalizeDiagnoses(diagnoses)`. `differentialDiagnosis` unchanged.
- [ ] 4.4 **Parity proof:** for a single-diagnosis visit, `provisional_diagnosis` output is byte-identical to the legacy free-text path. Add a parity test (mirror `objectiveResultsParity`).

### 5. Reducer + editor
- [ ] 5.1 Add `SET_DIAGNOSES` / `ADD_DIAGNOSIS` / `UPDATE_DIAGNOSIS` / `REMOVE_DIAGNOSIS` reducer actions (mirror the test-result actions); enforce exactly one `primary` (promoting a row demotes the old primary).
- [ ] 5.2 Build the diagnosis-rows editor in the Assessment tab (primary pinned first; per-row certainty/status/severity controls; note). Replace the single Dx input; strip glance still shows the primary label + DDx.

### 6. Verification gate
- [ ] 6.1 `cd backend && npm run type-check` PASS; `npx jest` prescriptions + migration 161 + diagnoses validation slices PASS.
- [ ] 6.2 `cd frontend && npx tsc --noEmit` clean on touched symbols; `eslint` clean; `npm test` assessment slice + **`provisional_diagnosis` derivation parity** PASS.
- [ ] 6.3 Scratch-DB apply/idempotency (or content-sanity test if no live DB) — flag if a live apply is required before merge.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/161_prescriptions_diagnoses_json.sql    (JSONB column, pattern = 154)
CREATE: frontend/lib/cockpit/diagnoses.ts                          (normalizeDiagnoses + derivePrimaryDiagnosis; mirror test-results.ts)
UPDATE: frontend/types/prescription.ts        (DiagnosisRow; Prescription.diagnoses_json; StructuredSoapInput.diagnosesJson)
UPDATE: backend/src/types/prescription.ts     (mirror)
UPDATE: backend/src/utils/validation.ts       (diagnosisRowSchema + diagnosesJsonSchema; widen structuredSoap)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (fields + hydrate + reducer actions + buildRxPayload derivation)
UPDATE: frontend/components/cockpit/rx/sections/AssessmentSection.tsx (diagnosis-rows editor)
CREATE: frontend/components/cockpit/rx/inputs/DiagnosisRowsList.tsx (rows editor; optional split)
DO NOT TOUCH: RLS; provisional_diagnosis / differential_diagnosis OUTPUT shape; output readers
```

**When updating existing code:** (MANDATORY)
- [ ] All new row fields defaulted/optional; old prescriptions validate + hydrate into one primary row unchanged.
- [ ] Tolerant Zod: malformed row degrades, never rejects the save.
- [ ] `provisional_diagnosis` TEXT byte-identical for a single-diagnosis visit; DDx untouched; output readers unchanged.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Derivation parity is the invariant (ASMT-D4).** Primary label → `provisional_diagnosis`, byte-identical for single-Dx content.
- **Legacy hydrate.** A stored free-text Dx becomes one primary row on load; no data migration.
- **Additive + tolerant (ASMT-D3).** Mirror `test_results_json` discipline.
- **No coding (ASMT-D7); no RLS edits (ASMT-D8).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] 🛑 **Data touched?** **YES** — new PHI column `diagnoses_json`; changed derivation of patient-facing `provisional_diagnosis`. Migration 161. Flag → approve on Opus before code.
- [ ] ✅ **Any PHI in logs?** **No** — never log diagnosis labels/notes.
- [ ] ✅ **External API or AI call?** **No** (AI-assist is a separate program).
- [ ] ✅ **Retention / deletion impact?** **7-year retention** per COMPLIANCE; cascade covers `prescriptions`. RLS unchanged.

---

## ✅ Acceptance & Verification Criteria

- [ ] `DiagnosisRow` + `diagnoses_json` exist FE+BE; `StructuredSoapInput.diagnosesJson` added.
- [ ] Migration 161 adds `diagnoses_json` (idempotent, PHI-commented, RLS untouched, rollback documented).
- [ ] Tolerant Zod drops malformed rows / defaults unknown enums; old prescriptions hydrate into one primary row.
- [ ] `provisional_diagnosis` TEXT byte-identical for a single-diagnosis visit; DDx + output readers unchanged; BE + FE slice gates green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-asmt-01-repurpose-tab.md`](./task-asmt-01-repurpose-tab.md) (editor home) and builds beside [`task-asmt-02-impression-and-acuity.md`](./task-asmt-02-impression-and-acuity.md). Enables [`task-asmt-04-problem-list-linkage.md`](./task-asmt-04-problem-list-linkage.md) (the diagnosis row is where the chronic-condition link lives).
- **Migration-combine note:** MAY share one migration file with asmt-02 if run back-to-back (still Opus, one STOP/flag).

---

**Last Updated:** 2026-07-09
**Pattern:** additive PHI JSONB column + tolerant Zod (mirror migration 154 / `test_results_json`), structured diagnosis rows that derive the primary label into `provisional_diagnosis` byte-identically.
