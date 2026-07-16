# Task asmt-02: Clinical-impression note + visit acuity (`assessment_note` + `assessment_acuity`)

> **Filename:** `task-asmt-02-impression-and-acuity.md` in `assessment-tab/Tasks/`.
> **Links:** batch plan [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-assessment-tab.md`](./EXECUTION-ORDER-assessment-tab.md). Code paths **repo-relative**.

---

## 🛑 ESCALATION (agent contract)

This task **adds a new migration and new PHI columns**. Per `.cursor/rules/00-agent-contract.mdc`, that is an explicit STOP: do **not** start implementation on Auto/Sonnet. **Flag for Opus and surface the migration + PHI-column plan for approval before writing any SQL or types.** This file is the plan, not a licence to proceed unattended.

---

## 📋 Task Overview

The Assessment tab has no place to record clinical *reasoning* — the "why I think this, and which way it's trending" that justifies the Plan. This task adds the two highest-value, lowest-complexity fields:

1. **Clinical-impression note** — `assessment_note` (free text): a short reasoning narrative (e.g. "Likely viral URI; low suspicion for bacterial given no focal findings; safety-net for red flags"). **Private by default (ASMT-D5)** — mirrors `clinical_notes`; NOT rendered on the patient PDF/SMS.
2. **Visit acuity / trajectory** — `assessment_acuity` (nullable, small value set: `improving` | `stable` | `worsening`): the overall clinical course this visit. Visit-level (not per-Dx); per-Dx severity/status arrives in asmt-03.

Both stored on `prescriptions` as **nullable** columns (migration **160**), wired hydrate → reducer → payload, and exposed in the Assessment tab editor established by asmt-01.

**Program / Batch:** assessment-tab · Wave 2
**Plan:** [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md)
**Estimated Time:** ~4–6 hours
**Status:** Draft — not implemented. **Model: Opus** (migration + PHI columns; surface plan for approval first).

**Change Type:**
- [ ] ✅ **Update existing** (types + Zod + form wiring) **+ New** (migration 160, `assessment_note` + `assessment_acuity`). Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `Prescription` read shape + `StructuredSoapInput` in `frontend/types/prescription.ts` + `backend/src/types/prescription.ts`; structuredSoap Zod in `backend/src/utils/validation.ts` (see `differentialDiagnosis` ≈ L2523); `RxFormFields` + `rxFormFieldsFromPrescription` + `buildRxPayload` in `frontend/components/cockpit/rx/RxFormContext.tsx`; `clinical_notes` is the privacy precedent (present in form, absent from patient output); migrations run to **159** (next = **160**; confirm at implementation).
- ⚠️ **Invariant:** RLS on `prescriptions` already covers all columns via `auth.uid() = doctor_id` (migration 026). Do **not** add/modify RLS.

**Scope Guard:**
- Expected files touched: the two `prescription.ts` type files, `validation.ts`, `RxFormContext.tsx` (fields + hydrate + payload), the Assessment editor component (`AssessmentSection.tsx`), and a new `backend/migrations/160_*.sql`.
- **DO NOT** edit RLS. **DO NOT** add either field to the patient PDF/SMS/notification output (ASMT-D5). **DO NOT** build the structured-Dx model (asmt-03) or problem linkage (asmt-04) here.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` · migration pattern `backend/migrations/151_prescriptions_vitals_2.sql` (scalar column adds).

---

## ✅ Task Breakdown (Hierarchical)

### 0. Escalation gate
- [ ] 0.1 STOP: migration + PHI-column plan surfaced and approved before any code (agent contract).

### 1. Types
- [ ] 1.1 Add `assessment_note: string | null` + `assessment_acuity: 'improving' | 'stable' | 'worsening' | null` to `Prescription` (FE + BE, kept in sync).
- [ ] 1.2 Add `assessmentNote?` + `assessmentAcuity?` to `StructuredSoapInput` (camelCase API), both optional/nullable.

### 2. Migration 160
- [ ] 2.1 `backend/migrations/160_prescriptions_assessment_note.sql`: `ADD COLUMN IF NOT EXISTS assessment_note TEXT` + `assessment_acuity TEXT` with a CHECK constraint limiting acuity to the three values (nullable). Idempotent.
- [ ] 2.2 Header block documents PHI + 7-year retention + RLS-unchanged + idempotency + documented (not shipped) rollback. Add a content-sanity test mirroring `159-…migration.test.ts`.

### 3. Tolerant Zod (FE + BE)
- [ ] 3.1 Widen the structuredSoap schema: `assessmentNote` = trimmed string, empty → null, capped at the shared SOAP text max; `assessmentAcuity` = enum with `.catch(null)` so an unknown value degrades to null rather than rejecting the save.

### 4. Form wiring
- [ ] 4.1 Add `assessmentNote: string` + `assessmentAcuity: … | null` to `RxFormFields` + `createEmptyRxFormFields`.
- [ ] 4.2 Hydrate from the row in `rxFormFieldsFromPrescription`; emit in `buildRxPayload` (`assessmentNote: trim || null`, `assessmentAcuity`). No `SET_FIELD` special-casing needed (generic field).
- [ ] 4.3 Render the impression note (textarea) + acuity control in the Assessment tab editor (`AssessmentSection.tsx`), under the Dx/DDx blocks.

### 5. Output privacy (ASMT-D5)
- [ ] 5.1 Confirm by inspection that `prescription-pdf-composer.ts` / `PrescriptionDocument.tsx` / `notification-service.ts` do **not** read the new fields — the impression note + acuity are private to the doctor view. Add/adjust a test asserting they are absent from patient output.

### 6. Verification gate
- [ ] 6.1 `cd backend && npm run type-check` PASS; `npx jest` prescriptions + migration 160 + structuredSoap validation slices PASS.
- [ ] 6.2 `cd frontend && npx tsc --noEmit` clean on touched symbols; `eslint` clean; `npm test` assessment slice + payload round-trip PASS.
- [ ] 6.3 Scratch-DB apply/idempotency (or content-sanity test if no live DB) — flag if a live apply is required before merge.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/160_prescriptions_assessment_note.sql   (TEXT + acuity CHECK; pattern = 151)
UPDATE: frontend/types/prescription.ts        (Prescription +assessment_note/acuity; StructuredSoapInput +assessmentNote/acuity)
UPDATE: backend/src/types/prescription.ts     (mirror)
UPDATE: backend/src/utils/validation.ts       (widen structuredSoap schema; acuity enum .catch(null))
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (RxFormFields + hydrate + buildRxPayload)
UPDATE: frontend/components/cockpit/rx/sections/AssessmentSection.tsx (impression textarea + acuity control)
DO NOT TOUCH: RLS policies; patient PDF/SMS/notification derivation (ASMT-D5)
```

**When updating existing code:** (MANDATORY)
- [ ] Both fields optional/nullable; old prescriptions validate + hydrate unchanged.
- [ ] Tolerant Zod: malformed acuity → null; over-long note trimmed/capped, never rejects the save.
- [ ] Neither field appears in patient-facing output.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Additive + optional (ASMT-D3).** No required field breaks a CC-only draft.
- **Private by default (ASMT-D5).** Impression + acuity are doctor-only in v1.
- **No RLS edits; PHI documented (ASMT-D8).** New columns inherit `prescriptions` RLS.
- **Tolerant Zod.** Degrade bad values, don't reject.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] 🛑 **Data touched?** **YES** — new PHI columns `assessment_note` + `assessment_acuity`. Migration 160. Flag → approve on Opus before code.
- [ ] ✅ **Any PHI in logs?** **No** — never log impression text.
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **7-year retention** per COMPLIANCE; account-deletion cascade already covers `prescriptions`. RLS unchanged.

---

## ✅ Acceptance & Verification Criteria

- [ ] `Prescription` + `StructuredSoapInput` carry `assessment_note` + `assessment_acuity` (FE+BE in sync).
- [ ] Migration 160 adds both columns (idempotent, PHI-commented, acuity CHECK, RLS untouched, rollback documented).
- [ ] Impression note + acuity save/reload round-trip via the form; tolerant Zod degrades bad values.
- [ ] Neither field renders on the patient PDF/SMS/notification (ASMT-D5); BE + FE slice gates green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-asmt-01-repurpose-tab.md`](./task-asmt-01-repurpose-tab.md) (the tab editor is the home for these fields). Enables [`task-asmt-03-structured-diagnoses.md`](./task-asmt-03-structured-diagnoses.md).
- **Migration-combine note:** if run back-to-back with asmt-03, the two migrations MAY be merged into one file (still Opus, one STOP/flag) — decide at implementation.

---

**Last Updated:** 2026-07-09
**Pattern:** additive nullable PHI columns (scalar `TEXT` + CHECK-constrained enum) wired hydrate → reducer → payload, kept private to the doctor view.
