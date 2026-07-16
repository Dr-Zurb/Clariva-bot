# Task asmt-04: Problem-list linkage (reconcile visit Dx ↔ chronic condition)

> **Filename:** `task-asmt-04-problem-list-linkage.md` in `assessment-tab/Tasks/`.
> **Links:** batch plan [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-assessment-tab.md`](./EXECUTION-ORDER-assessment-tab.md). Code paths **repo-relative**.

---

## 🛑 ESCALATION (agent contract)

This task **writes chronic-condition PHI from the visit form (a cross-layer write beyond `prescriptions`)**. Per `.cursor/rules/00-agent-contract.mdc`, cross-layer + PHI is an explicit STOP: do **not** start implementation on Auto/Sonnet. **Flag for Opus, and first confirm whether a migration is truly avoidable (the link should live in `diagnoses_json`); surface the cross-layer write plan for approval before any code.** This file is the plan, not a licence to proceed unattended.

---

## 📋 Task Overview

Today the visit diagnosis and the patient's longitudinal **problem list** are disconnected: the visit Dx lives on `prescriptions`, while chronic problems live in `patient_chronic_conditions` (managed in the chart's `ProblemOrientedMedicalSection`) and surface via `patient_problem_list_v`. This task lets the doctor **reconcile** the two from the Assessment tab — the payoff that makes the tab worth its space.

1. **Link a visit Dx to an existing chronic condition.** Add an optional `conditionId?: string | null` to the `DiagnosisRow` (asmt-03) — the link lives **inside `diagnoses_json`**, so **no new column** is needed. Marks "this visit's Dx *is* their known HTN (ongoing)".
2. **Promote a new Dx to a chronic condition.** An explicit action on a diagnosis row calls the shipped chart API (`createPatientCondition`) to add it to the problem list, then stamps the returned `conditionId` back onto the row. Mirrors the chart's own commit flow.
3. **Reconciliation is always explicit (ASMT-D6).** Saving a prescription NEVER auto-creates or edits a `patient_chronic_conditions` row. Only the doctor's link/promote action writes to the chart.
4. **Surface active problems for context.** Show the patient's active problem list beside the diagnosis rows (read from the existing problems endpoint) so linking is one click.

**Program / Batch:** assessment-tab · Wave 4
**Plan:** [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md)
**Estimated Time:** ~4–6 hours
**Status:** Draft — not implemented. **Model: Opus** (cross-layer write into chronic-condition PHI; surface plan for approval first).

**Change Type:**
- [ ] ✅ **Update existing** (`DiagnosisRow` +`conditionId`; reuse chart API) **+ possibly None-new-column**. Follow `docs/Work/process/CODE_CHANGE_RULES.md`. Confirm no migration is needed before starting.

**Current State:** (check existing code first!)
- ✅ **Exists:** `DiagnosisRow` + `diagnoses_json` (asmt-03); `patient_chronic_conditions` (`backend/migrations/129_patient_chronic_conditions_status.sql`); derived problem list `patient_problem_list_v` (`096_patient_problem_list_view.sql`); chart API `createPatientCondition` / `updatePatientCondition` / `listPatientProblems` in `frontend/lib/api` (+ `patient-chart.ts`); the commit/promote precedent in `frontend/components/ehr/sections/ProblemOrientedMedicalSection.tsx` (optimistic create + reconcile).
- ⚠️ **Invariant:** `patient_chronic_conditions` has its own RLS (`auth.uid() = doctor_id`). Do **not** add/modify RLS. The link field lives in `diagnoses_json` → confirm **no new column / migration** is required.

**Scope Guard:**
- Expected files touched: the two `prescription.ts` type files (`DiagnosisRow` +`conditionId`), `validation.ts` (widen `diagnosisRowSchema`), the diagnosis-rows editor + a small "link / promote to problem list" affordance, and read-only wiring to the existing problems endpoint.
- **DO NOT** edit RLS. **DO NOT** auto-write conditions on prescription save (ASMT-D6). **DO NOT** add a new problem store or a migration unless the escalation review proves one is unavoidable. **DO NOT** add ICD coding (ASMT-D7).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` · chart commit precedent `ProblemOrientedMedicalSection.tsx`.

---

## ✅ Task Breakdown (Hierarchical)

### 0. Escalation gate
- [ ] 0.1 STOP: confirm the link fits in `diagnoses_json` (no migration); surface the cross-layer write plan; approve on Opus before any code.

### 1. Link field
- [ ] 1.1 Add optional `conditionId?: string | null` to `DiagnosisRow` (FE + BE, in sync). Widen `diagnosisRowSchema` tolerantly (bad/unknown id → null; never drops the row).
- [ ] 1.2 Confirm no new `prescriptions` column is required (link rides inside `diagnoses_json`); document the confirmation.

### 2. Link to existing problem
- [ ] 2.1 Read the patient's active problems (`listPatientProblems` / problems endpoint) into the Assessment tab, read-only.
- [ ] 2.2 Add a per-row "link to problem" affordance that sets `conditionId` on the diagnosis row (form state only; persists with the prescription via `diagnoses_json`).

### 3. Promote to chronic condition
- [ ] 3.1 Add an explicit "add to problem list" action on a diagnosis row that calls `createPatientCondition` (reuse the chart flow), then stamps the returned condition id onto the row's `conditionId`.
- [ ] 3.2 Optimistic + reconcile like `ProblemOrientedMedicalSection` (temp id → real id); surface errors; never block the visit on failure.
- [ ] 3.3 Guard against duplicates (don't create a condition that already exists / is already linked).

### 4. No auto-write invariant (ASMT-D6)
- [ ] 4.1 Prove by test that `buildRxPayload` / prescription save does **not** create or edit any `patient_chronic_conditions` row — only the explicit link/promote actions do.

### 5. Verification gate
- [ ] 5.1 `cd backend && npm run type-check` PASS; `npx jest` diagnoses validation + (if touched) chart-condition slices PASS.
- [ ] 5.2 `cd frontend && npx tsc --noEmit` clean on touched symbols; `eslint` clean; `npm test` assessment + problem-link slices PASS.
- [ ] 5.3 Manual/integration check: link an existing problem; promote a new Dx → appears in the chart problem list; reload round-trips `conditionId`.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/types/prescription.ts        (DiagnosisRow +conditionId)
UPDATE: backend/src/types/prescription.ts     (mirror)
UPDATE: backend/src/utils/validation.ts       (widen diagnosisRowSchema for conditionId; tolerant)
UPDATE: frontend/components/cockpit/rx/sections/AssessmentSection.tsx (+ DiagnosisRowsList) (link / promote affordances)
REUSE:  frontend/lib/api (createPatientCondition / listPatientProblems) — no new endpoint expected
DO NOT TOUCH: RLS; auto-write conditions on prescription save (ASMT-D6); new problem store/migration (unless escalation proves needed)
```

**When updating existing code:** (MANDATORY)
- [ ] `conditionId` optional; old diagnosis rows / prescriptions validate unchanged.
- [ ] Prescription save never writes to `patient_chronic_conditions`.
- [ ] Promote reuses the shipped chart create flow; duplicates guarded; failure degrades, never blocks.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reconcile, never auto-write (ASMT-D6).** Only explicit doctor actions touch the problem list.
- **Reuse the chart API.** No new problem store, no parallel condition model.
- **Link lives in `diagnoses_json` (ASMT-D4 substrate).** Prefer no new column.
- **No RLS edits (ASMT-D8); no coding (ASMT-D7).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] 🛑 **Data touched?** **YES** — writes `patient_chronic_conditions` (chart PHI) via the shipped API, on explicit action only; adds `conditionId` inside `diagnoses_json` (no new column expected). Flag → approve on Opus before code.
- [ ] ✅ **Any PHI in logs?** **No** — never log condition/diagnosis labels.
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No new store**; existing `patient_chronic_conditions` retention/cascade applies. RLS unchanged.

---

## ✅ Acceptance & Verification Criteria

- [ ] A diagnosis row can be linked to an existing chronic condition (`conditionId` persists via `diagnoses_json`, round-trips on reload).
- [ ] A new Dx can be promoted to a chronic condition via an explicit action; it appears in the chart problem list; the row is stamped with the new id.
- [ ] Prescription save never auto-creates/edits a condition (ASMT-D6, proven by test).
- [ ] No RLS edits; no new column/migration (or escalation-approved if unavoidable); BE + FE slice gates green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-asmt-03-structured-diagnoses.md`](./task-asmt-03-structured-diagnoses.md) (the diagnosis row holds `conditionId`). Final phase of the program.

---

**Last Updated:** 2026-07-09
**Pattern:** reconcile the visit diagnosis with the longitudinal problem list via an explicit, reuse-the-chart-API link/promote — link stored inside `diagnoses_json`, never an auto-write on save.
