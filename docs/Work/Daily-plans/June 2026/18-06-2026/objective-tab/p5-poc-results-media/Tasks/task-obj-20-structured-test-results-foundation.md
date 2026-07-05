# Task obj-20: Structured test-results foundation (`test_results_json` migration + types + Zod + reducer + derived-text contract)

> **Filename:** `task-obj-20-structured-test-results-foundation.md` in `objective-tab/p5-poc-results-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Give Zone C (test results) a structured backbone: add **one** additive `prescriptions.test_results_json` JSONB
array column (a mirror of P1's `examination_json`, migration 150), thread the result-row shape end-to-end
(types both sides, Zod, `RxFormFields` + reducer actions), and — the binding part — make `buildRxPayload`
**derive** the legacy `test_results` text from the structured rows on save, with **legacy/empty rows passing
through byte-identical** (OBJ-D2). This is the pure substrate — **no result-row UI, no media, no templates,
no specialty packs** (those are obj-21/22/23/24).

**Program / Phase:** objective-tab · Phase 5 (point-of-care results + media)  
**Batch:** [`plan-p5-objective-tab-poc-results-media-batch.md`](../plan-p5-objective-tab-poc-results-media-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p5-objective-tab-poc-results-media.md`](./EXECUTION-ORDER-p5-objective-tab-poc-results-media.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **COMPLETE** — **Completed: 2026-06-19** (Opus; new migration on a **PHI** column).

**Change Type:**
- [ ] **Update existing** — extend the `prescriptions` SOAP surface + the form-state/derive path. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** [`150_prescriptions_examination_json.sql`](../../../../../../../../backend/migrations/150_prescriptions_examination_json.sql) (the column + CHECK to clone); `test_results TEXT` (migration 103); the `examination_json` → `examination_findings` derive-on-save + hydrate path in [`RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) (`buildRxPayload` / `rxFormFieldsFromPrescription`); the derive/serialize helpers in [`exam-findings.ts`](../../../../../../../../frontend/lib/cockpit/exam-findings.ts); prescription types both sides; the prescription update Zod schema in [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts).
- ❌ **What's missing:** the `test_results_json` column; the result-row type + Zod shape; the `RxFormFields.testResultsStructured` field + reducer actions; the `test_results` derivation in `buildRxPayload`.

**Scope Guard:**
- Expected files touched: ≤ 7 (migration; BE prescription type; BE validation; FE prescription type; `RxFormContext` field+reducer+derive+hydrate; a derive/serialize helper; unit tests). **No** result-row UI (obj-21), **no** media (obj-22), **no** templates/packs (obj-23).
- Highest existing migration is `153` — new file is `154_prescriptions_test_results_json.sql`.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `154_prescriptions_test_results_json.sql`: add `test_results_json JSONB NOT NULL DEFAULT '[]'::jsonb` with a `jsonb_typeof(test_results_json) = 'array'` CHECK (clone migration 150's `examination_json` block); idempotent (`ADD COLUMN IF NOT EXISTS`, drop+add constraint); header comment + rollback line. - **Completed: 2026-06-19**
- [x] ✅ 1.2 Column comment marks it **PHI** (structured point-of-care / patient-brought results derived into `test_results` text; legacy rows pass through). RLS unchanged — migration 026 `auth.uid() = doctor_id` covers new columns. - **Completed: 2026-06-19**

### 2. Backend types + validation
- [x] ✅ 2.1 Add a `TestResultRow` interface (`{ id, source: "patient_report" | "in_clinic_poc", name, value?, unit?, date?, interpretation?: "normal" | "high" | "low" | "abnormal", notes? }`) + `test_results_json` to the prescription type in `backend/src/types/prescription.ts` (also `testResultsJson` on `StructuredSoapInput`). - **Completed: 2026-06-19**
- [x] ✅ 2.2 `validation.ts`: validate `testResultsJson` in the shared SOAP schema (drop unknown keys via strict object; bound array size + string lengths; `source`/`interpretation` enums; tolerant `.catch(null)` drops bad rows + collapses a bad interpretation to null); trim + null empty strings. - **Completed: 2026-06-19**

### 3. Frontend types + form state + derivation
- [x] ✅ 3.1 Mirror `TestResultRow` + `test_results_json` in `frontend/types/prescription.ts`; add `testResultsStructured: TestResultRow[]` to `RxFormFields`. - **Completed: 2026-06-19**
- [x] ✅ 3.2 Reducer actions (mirror the `examFindings` set): `SET_TEST_RESULTS` / `ADD_TEST_RESULT` / `UPDATE_TEST_RESULT` / `REMOVE_TEST_RESULT`; `createEmptyRxFormFields` seeds `[]`. - **Completed: 2026-06-19**
- [x] ✅ 3.3 `rxFormFieldsFromPrescription` hydrates `testResultsStructured` from `test_results_json` (normalize/drop bad rows); `testResults` text hydration unchanged. - **Completed: 2026-06-19**
- [x] ✅ 3.4 `buildRxPayload`: writes `testResultsJson` (normalized) **and** derives `testResults` text from the structured rows when present; **empty rows → the legacy `testResults` text passes through byte-identical** (OBJ-D2). New `deriveTestResults`/`normalizeTestResults` helper in `frontend/lib/cockpit/test-results.ts` (mirrors the `examination_json` derive path). - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 Migration content test (`154-…migration.test.ts`); Zod test (`prescriptions.test.ts`) accepts a valid row set, drops unknown keys, drops bad `source`/missing `name`, collapses bad `interpretation`. - **Completed: 2026-06-19**
- [x] ✅ 4.2 Parity seed (`rxFormContext.testResults.test.ts` + `test-results.test.ts`): `buildRxPayload` derives `test_results` identically for hand-entry vs an equivalent structured row set; legacy/empty rows byte-identical; hydrate → `buildRxPayload` round-trips. - **Completed: 2026-06-19**
- [x] ✅ 4.3 `backend` jest (47 pass) + `backend tsc` clean; `frontend` targeted vitest (28 pass) + lint clean on touched files. Pre-existing unrelated `tsc`/lint noise (`social-history.ts`, `subjective-section-*.ts`, `resolveInvestigationsField`) routed. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/154_prescriptions_test_results_json.sql
UPDATE: backend/src/types/prescription.ts (TestResultRow + test_results_json)
UPDATE: backend/src/utils/validation.ts (test_results_json shape in the update schema)
UPDATE: frontend/types/prescription.ts (TestResultRow + test_results_json mirror)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (testResultsStructured field + reducer + derive + hydrate)
UPDATE: frontend/lib/cockpit/<test-results helper>.ts (derive/serialize — mirror exam-findings.ts)
DO NOT TOUCH: the result-row UI (obj-21), media (obj-22), templates/packs (obj-23); buildRxPayload's existing exam/vitals derivation
```

**When updating existing code:**
- [ ] Mirror the `examination_json` path exactly (column shape discipline, reducer naming, derive-on-save, legacy passthrough) — do not invent a new pattern.
- [ ] Keep `test_results` text as the escape hatch (OBJ-D7): when there are no structured rows, derive nothing and pass the legacy text through unchanged.
- [ ] Audit `buildRxPayload` callers (PDF/SMS/snapshot) read only `test_results` text — they must stay byte-unchanged.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Structured results = typed JSONB on `prescriptions` (P5-D1 / OBJ-D1).** One additive column; no single `objective_json` blob, no per-test table.
- **Derived-text contract holds (P5-D3 / OBJ-D2).** `test_results` text is derived; legacy/empty rows byte-identical; PDF/SMS/snapshot unchanged.
- **One row model, `source` discriminator (P5-D2).** Patient-brought vs in-clinic POC are the same shape.
- **PHI column.** Document config-vs-PHI in the migration comment; RLS inherits the doctor-scoped prescription policy (verify, don't widen).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — additive **PHI** `test_results_json` column on `prescriptions`.
  - [ ] **RLS verified?** **Yes** — migration 026 `auth.uid() = doctor_id` covers new columns; no widening.
- [ ] **Any PHI in logs?** **No** — never log result values/names.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No** — column rides the prescription's lifecycle.

> **STOP/Opus gate:** lands a **new migration** on a **PHI** column — Opus-grade per the agent contract. Additive + idempotent; do not downgrade without an explicit migration policy.

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration runs idempotently; `test_results_json` defaults to `[]` with a `jsonb_typeof = 'array'` CHECK; existing rows + RLS unchanged; PHI comment present.
- [ ] Zod validates the row shape (drops unknown keys, bounds arrays, enforces `source`/`interpretation`); `buildRxPayload` writes `test_results_json` + derives `test_results`; legacy/empty rows byte-identical; reload round-trips.
- [ ] PDF/SMS/snapshot reads of `test_results` byte-unchanged; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Deliberately UI-free — it only makes the prescription + form state *structured-results-aware* so obj-21/22/23/24 can plug the row UI, media, templates, and the close-gate onto a stable substrate. Direct analog of P1's `obj-01` (`examination_json` foundation), applied to Zone C.

---

## 🔗 Related Tasks

- [`task-obj-01-…`](../../p1-structured-exam/Tasks/) — the `examination_json` structured-JSONB + derived-text foundation this mirrors.
- [`task-obj-21-structured-poc-result-rows.md`](./task-obj-21-structured-poc-result-rows.md) — first consumer of `test_results_json`.

---

**Last Updated:** 2026-06-19  
**Pattern:** additive typed JSONB column (clone migration 150) + reducer + derive-on-save with legacy passthrough on `prescriptions`.  
**Reference:** `process/CODE_CHANGE_RULES.md`
