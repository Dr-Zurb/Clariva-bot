# Task rpt-02: Lab report grouping + reference-range fields + `lab_reports_json` migration

> **Filename:** `task-rpt-02-lab-report-model-and-fields.md` in `objective-reports-section/Tasks/`.
> **Links:** batch plan [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-objective-reports.md`](./EXECUTION-ORDER-objective-reports.md). Code paths **repo-relative**.

---

## 🛑 ESCALATION (agent contract)

This task **adds a new migration and a new PHI column**. Per `.cursor/rules/00-agent-contract.mdc`, that is an explicit STOP: do **not** start implementation on Auto/Sonnet. **Flag for Opus and surface the migration + PHI-column plan for approval before writing any SQL or types.** This file is the plan, not a licence to proceed unattended.

---

## 📋 Task Overview

Model investigations as **verifiable panels**: a lab report header groups structured analyte rows, and each row can carry a reference range so a value can be flagged high/low. This is the structured substrate the library (rpt-03) and extraction (rpt-05) write into.

1. **Widen the row (`TestResultRow`)** with optional `reportId?` (links a row to a report header) and reference-range fields (`refLow?`, `refHigh?`, `refText?`). All optional → existing rows stay valid.
2. **Add a report header model** (`LabReport`): `id`, `kind: 'lab' | 'imaging'`, `title`, `reportDate?`, `labName?`, `attachmentIds[]`, `findings?` (imaging), `entryMethod: 'manual' | 'extracted'`. Stored in a new `prescriptions.lab_reports_json` JSONB array (migration **159**).
3. **Tolerant Zod (FE + BE)** mirroring the `test_results_json` discipline: malformed report headers drop, never reject the whole prescription; unknown row `reportId` collapses to ungrouped ("Other results").
4. **Derivation parity:** `test_results` TEXT stays derived from rows on save; for the same row content the output is **byte-identical** to today (OBJ-D2 / RPT-D8).

**Program / Batch:** objective-reports-section · Wave 2
**Plan:** [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md)
**Estimated Time:** ~4–6 hours
**Status:** ✅ **Done — 2026-07-08** (Opus; migration + PHI-column plan surfaced and approved before code). **Scope as approved:** types + migration 159 + tolerant Zod only; **prescription save-path wiring (service persist + FE form/reducer round-trip) deferred to a later task** (rpt-03/05). `test_results` TEXT derivation confirmed byte-identical (unchanged).

**Change Type:**
- [x] ✅ **Update existing** (row type + Zod) **+ New** (migration 159, `lab_reports_json`). Follow `docs/Work/process/CODE_CHANGE_RULES.md`. **— Completed: 2026-07-08**

**Current State:** (check existing code first!)
- ✅ **Exists:** `TestResultRow` in `frontend/types/prescription.ts` + `backend/src/types/prescription.ts`; tolerant `testResultRowSchema` / `testResultsJsonSchema` in `backend/src/utils/validation.ts`; `test_results` TEXT derivation in `frontend/lib/cockpit/test-results.ts`; migration 154 as the JSONB-column pattern; migrations run to **158** (next = **159**).
- ⚠️ **Invariant:** RLS on `prescriptions` already covers all columns via `auth.uid() = doctor_id` (migration 026). Do **not** add/modify RLS.

**Scope Guard:**
- Expected files touched: the two `prescription.ts` type files, `validation.ts`, `test-results.ts` (derivation stays parity-safe), the reducer/actions that own the rows, and a new `backend/migrations/159_*.sql`.
- **DO NOT** edit RLS policies. **DO NOT** change the `test_results` TEXT output shape. **DO NOT** build the library UI (rpt-03) or extraction (rpt-05) here.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` · migration pattern `backend/migrations/154_prescriptions_test_results_json.sql`.

---

## ✅ Task Breakdown (Hierarchical)

### 0. Escalation gate
- [x] ✅ 0.1 STOP: migration + PHI-column plan surfaced and approved before any code (agent contract). — **Completed: 2026-07-08**

### 1. Row + report types
- [x] ✅ 1.1 Added optional `reportId?`, `refLow?`, `refHigh?`, `refText?` to `TestResultRow` (FE `frontend/types/prescription.ts` + BE `backend/src/types/prescription.ts`, kept in sync; "mirrors backend" note retained). — **Completed: 2026-07-08**
- [x] ✅ 1.2 Added the `LabReport` header type (`kind: 'lab'|'imaging'`, `title`, `reportDate?`, `labName?`, `attachmentIds[]`, `findings?`, `entryMethod: 'manual'|'extracted'`) FE + BE, plus `lab_reports_json` on the `Prescription` read shape. — **Completed: 2026-07-08**

### 2. Migration 159
- [x] ✅ 2.1 `backend/migrations/159_prescriptions_lab_reports_json.sql`: `ADD COLUMN IF NOT EXISTS lab_reports_json JSONB NOT NULL DEFAULT '[]'::jsonb` + drop/add array CHECK, mirroring 154; `COMMENT ON COLUMN` marks it PHI. — **Completed: 2026-07-08**
- [x] ✅ 2.2 Header block documents PHI + 7-year retention + RLS-unchanged + idempotency + documented (not shipped) rollback. Content-sanity test added (`159-...migration.test.ts`). — **Completed: 2026-07-08**

### 3. Tolerant Zod (FE + BE)
- [x] ✅ 3.1 Added `labReportsJsonSchema` (+ `labReportSchema`) in `backend/src/utils/validation.ts`, mirroring `testResultsJsonSchema`: malformed header (missing id/title, bad `kind`) drops at array level; empty strings → null; `entryMethod` defaults to `manual`. Exported for the later save-path/library tasks. — **Completed: 2026-07-08**
- [x] ✅ 3.2 Widened `testResultRowSchema` for `reportId`/`refLow`/`refHigh`/`refText`; a malformed `reportId` collapses to null (ungrouped) via `.catch`, never dropping the row. — **Completed: 2026-07-08**
- [x] ✅ FE tolerance: `normalizeTestResults` (`test-results.ts`) left unchanged so derivation stays byte-identical; new fields are silently ignored (tolerant) until the save-path task wires them.

### 4. Derivation parity
- [x] ✅ 4.1 `test_results` TEXT derivation unchanged (byte-identical) — `test-results.ts` untouched; report headers/ranges do NOT leak into the TEXT (product default). FE parity test green (6/6). — **Completed: 2026-07-08**
- [x] ✅ 4.2 Empty `lab_reports_json` = full passthrough (column default `'[]'`; no derivation reads it). — **Completed: 2026-07-08**

### 5. Verification gate
- [x] ✅ 5.1 `cd backend && npm run type-check` PASS; `npx jest` prescriptions + migration 154/159 + rx-template + chart-results slices PASS (129/129). Full-suite failures observed are pre-existing WIP-branch issues (payment/appointment/webhook logic + `@react-pdf` ESM parse), none importing the touched files. — **Completed: 2026-07-08**
- [x] ✅ 5.2 `cd frontend && npx tsc --noEmit` — zero errors from the touched file/symbols (remaining errors are pre-existing WIP branch); `eslint types/prescription.ts` clean; `vitest` derivation parity PASS (6/6). — **Completed: 2026-07-08**
- [ ] 5.3 Scratch-DB apply/idempotency: verified by content-sanity test (idempotent `ADD COLUMN IF NOT EXISTS` + drop/add CHECK); **live scratch-DB run not executed here** (no DB in this environment) — flag if a live apply is required before merge.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/159_prescriptions_lab_reports_json.sql   (JSONB column, pattern = 154)
UPDATE: frontend/types/prescription.ts        (TestResultRow +reportId/ref*; +LabReport)
UPDATE: backend/src/types/prescription.ts     (mirror)
UPDATE: backend/src/utils/validation.ts       (labReportsJsonSchema; widen testResultRowSchema)
UPDATE: frontend/lib/cockpit/test-results.ts   (derivation stays parity-safe)
UPDATE: reducer/actions owning test-result rows + reports (as needed)
DO NOT TOUCH: RLS policies; test_results TEXT output shape
```

**When updating existing code:** (MANDATORY)
- [x] All new fields optional; old rows/prescriptions validate unchanged.
- [x] Tolerant discipline: malformed report/row degrades, never rejects the save.
- [x] `test_results` TEXT byte-identical for equal row content.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Additive + optional.** No required field breaks old data (RPT-D3).
- **Tolerant Zod.** Mirror `test_results_json` — drop bad, don't reject.
- **No RLS edits; PHI documented.** New column inherits `prescriptions` RLS (RPT-D8).
- **Derivation parity.** OBJ-D2 invariant.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] 🛑 **Data touched?** **YES** — new PHI column `lab_reports_json` (+ widened row). Migration 159. Flagged → approved on Opus before code.
- [x] ✅ **Any PHI in logs?** **No** — never log report/row values.
- [x] ✅ **External API or AI call?** **No** (extraction is rpt-05).
- [x] ✅ **Retention / deletion impact?** **7-year retention** applies per COMPLIANCE; account-deletion cascade already covers `prescriptions`. RLS unchanged.

---

## ✅ Acceptance & Verification Criteria

- [x] `TestResultRow` carries optional `reportId` + range fields; `LabReport` header type exists FE+BE.
- [x] Migration 159 adds `lab_reports_json` (idempotent, PHI-commented, RLS untouched, rollback documented).
- [x] Tolerant Zod drops malformed headers/rows without failing the save; old prescriptions load unchanged.
- [x] `test_results` TEXT derivation byte-identical; BE + FE slice gates green (full-suite pre-existing failures unrelated).

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-rpt-01-merge-reports-section.md`](./task-rpt-01-merge-reports-section.md). Enables [`task-rpt-03-lab-test-library.md`](./task-rpt-03-lab-test-library.md), [`task-rpt-04-photos-and-imaging.md`](./task-rpt-04-photos-and-imaging.md), [`task-rpt-05-extraction-and-verify-dialog.md`](./task-rpt-05-extraction-and-verify-dialog.md).

---

**Last Updated:** 2026-07-08
**Pattern:** additive PHI JSONB column + tolerant Zod (mirror migration 154 / `test_results_json`), grouping rows into verifiable report panels while keeping TEXT derivation byte-identical.
