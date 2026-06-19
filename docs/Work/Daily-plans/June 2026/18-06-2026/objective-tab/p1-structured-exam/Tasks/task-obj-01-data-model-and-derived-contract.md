# Task obj-01: Examination data model + form state + derived `examination_findings` contract

> **Filename:** `task-obj-01-data-model-and-derived-contract.md` in `objective-tab/p1-structured-exam/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the subjective-tab `Tasks/` folders.

---

## 📋 Task Overview

Introduce the structured-exam keystone: an additive `prescriptions.examination_json` JSONB
array, its backend type/validation/service mapping, the matching `examFindings` shared form
state + reducer actions, and the **derived-text contract** that makes `examination_findings`
a mirror of `examination_json` on save. This is the **schema + shared-state + derivation**
slice — no exam UI (obj-03) and no registry vocabulary (obj-02). It is the Objective analog
of subjective `subj-01` (`complaints` → derived `cc`/`hopi`), and the contract it freezes
(empty json ⇒ legacy free-text passes through byte-identical) is what obj-04 proves.

**Program / Phase:** objective-tab · Phase 1 (structured exam)  
**Batch:** [`plan-p1-objective-tab-structured-exam-batch.md`](../plan-p1-objective-tab-structured-exam-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-objective-tab-structured-exam.md`](./EXECUTION-ORDER-p1-objective-tab-structured-exam.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **COMPLETE** — 2026-06-18

**Change Type:**
- [x] **Update existing** — additive migration + a derivation change to `buildRxPayload`. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `examination_findings TEXT` on `prescriptions` (migration 103); the General/Systemic delimiter helpers [`exam-findings.ts`](../../../../../../../../frontend/lib/cockpit/exam-findings.ts) (`parseExam`/`serializeExam`, `--- SYSTEMIC ---`); `RxFormContext.tsx` with the `complaints`/`medicines` reducer + `buildRxPayload` (L618+) that already derives `cc`/`hopi`; `examinationFindings` field on `RxFormFields` (L158), seeded L283/L555, serialized L706; the prescription BE type, Zod (`complaints` precedent), and service select/insert mappers.
- ❌ **What's missing:** any structured exam column, type, validation, form state, or derivation.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration; BE prescription type; BE Zod/validation; BE service mapping; FE `RxFormContext` type+reducer+derivation; FE prescription type mirror; BE test; FE test).
- **No** exam UI (obj-03), **no** `exam-schema.ts` registry (obj-02), **no** vitals change, **no** PDF structural change (PDF keeps reading the derived text).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `150_prescriptions_examination_json.sql`: `ADD COLUMN IF NOT EXISTS examination_json JSONB NOT NULL DEFAULT '[]'::jsonb`; PHI column comment (structured exam; `examination_findings` derived from it); idempotent (+ array-type CHECK drop/add); rollback line. - **Completed: 2026-06-18**
  - [x] ✅ 1.1.1 Mirrored `116`/`144` for shape/RLS/naming — RLS unchanged (migration 026 `auth.uid() = doctor_id` covers new columns). - **Completed: 2026-06-18**

### 2. Backend type + validation + service
- [x] ✅ 2.1 Added `ExamSystemFinding` + `examinationJson` to the prescription type + `StructuredSoapInput` (flows to create/update inputs); element `{ systemId; status: 'normal'|'abnormal'; findings?; notes? }`. - **Completed: 2026-06-18**
- [x] ✅ 2.2 Zod tolerant schema (mirror rx-template custom-subsection `.nullable().catch(null)`): **drops empty/missing systemId**, **drops bad status**, trims + filters empty findings — never rejects the whole save. - **Completed: 2026-06-18**
- [x] ✅ 2.3 Service insert + update mapping for `examination_json` (get uses `select('*')`). - **Completed: 2026-06-18**

### 3. Frontend shared state + derived contract
- [x] ✅ 3.1 `ExamSystemFinding` type re-exported + `examFindings: ExamSystemFinding[]` on `RxFormFields`; default `[]`; hydrates from `rx.examination_json ?? []` via `normalizeExamFindings`. - **Completed: 2026-06-18**
- [x] ✅ 3.2 Reducer actions: `SET_EXAM_SYSTEM` (upsert status+findings+notes), `CLEAR_EXAM_SYSTEM`, `MARK_ALL_EXAM_NORMAL` (bulk), `SET_EXAM_FINDINGS` (replace/hydrate). - **Completed: 2026-06-18**
- [x] ✅ 3.3 `buildRxPayload`: includes `examinationJson` + derives `examinationFindings`. - **Completed: 2026-06-18**
  - [x] ✅ 3.3.1 Empty `examFindings` ⇒ emits `fields.examinationFindings.trim() || null` unchanged (passthrough, P1-D2). - **Completed: 2026-06-18**
  - [x] ✅ 3.3.2 Non-empty ⇒ deterministic string via `EXAM_CORE_SYSTEM_ORDER` (unknown systems alpha-sorted after core); no object-key reliance. - **Completed: 2026-06-18**

### 4. Verification & Testing
- [x] ✅ 4.1 Migration content-sanity test (idempotent ADD/CHECK, default `[]`, RLS unchanged, PHI comment, rollback). - **Completed: 2026-06-18**
- [x] ✅ 4.2 Zod tests: drops empty/missing systemId, skips bad status, filters findings, preserves valid rows, round-trips. - **Completed: 2026-06-18**
- [x] ✅ 4.3 `buildRxPayload`/derivation/reducer/hydration tests: empty ⇒ byte-identical; non-empty ⇒ deterministic ordered string. - **Completed: 2026-06-18**
- [x] ✅ 4.4 Backend `tsc` clean + targeted jest green (33); frontend exam + sibling vitest green (31); eslint clean on touched files. (Pre-existing repo-wide `tsc`/lint debt unrelated to this task left untouched.) - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/150_prescriptions_examination_json.sql
UPDATE: backend/src/types/prescription.ts (examinationJson + element type)
UPDATE: backend/src/utils/validation.ts (examinationJson Zod — tolerant)
UPDATE: backend/src/services/prescription-service.ts (select + insert/update mapping)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (ExamSystemFinding, examFindings state, reducer, buildRxPayload derivation)
UPDATE: frontend/types/prescription.ts (mirror examination_json on the FE prescription type, if applicable)
CREATE/UPDATE: backend + frontend unit tests
```

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations (numeric order) for schema/naming/RLS/triggers + how the project connects — [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) + [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4.

**When updating existing code:** (MANDATORY)
- [ ] Audit `buildRxPayload` callers (autosave + send) + the `examination_findings` consumers (PDF, notification, snapshot) before changing the derivation.
- [ ] Map the change concretely; remove no existing behaviour (P1-D6 additive-only).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Never read `process.env` directly — `config/env.ts` (agent contract). Validate all external input with Zod before the service (agent contract).
- `examination_json` is **PHI** — doctor-scoped RLS, never logged, no PHI in logs (COMPLIANCE.md).
- Derivation must be **pure + deterministic** (no `Date.now`, stable ordering) so output-parity fixtures are reproducible.
- The legacy passthrough (empty json ⇒ unchanged `examination_findings`) is a **binding contract** (P1-D2 / OBJ-D2) — obj-04 asserts byte-parity.
- Additive only (P1-D6): the general/systemic textareas, `vitalsText`, and the delimiter helper stay.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Y** → [ ] **RLS verified?** (new column on `prescriptions`, covered by migration 026 doctor-scoped policy — confirm)
- [ ] **Any PHI in logs?** MUST be **No** (`examination_json` is PHI).
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N** (additive column on an existing row; soft-delete inherited).

---

## ✅ Acceptance & Verification Criteria

- [ ] `examination_json` column exists, idempotent, PHI-commented, RLS doctor-scoped; default `[]`.
- [ ] `examination_json` round-trips through BE type + Zod (tolerant) + service.
- [ ] `examFindings` state + reducer actions exist and hydrate from a loaded prescription.
- [ ] `buildRxPayload`: empty ⇒ byte-identical `examination_findings`; non-empty ⇒ deterministic ordered string.
- [ ] Response contracts respected ([CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)); tests added ([TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)); no PHI in logs.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-02-exam-system-registry.md`](./task-obj-02-exam-system-registry.md) — freezes the systemId order this task derives in.
- [`task-obj-03-exam-card-and-host.md`](./task-obj-03-exam-card-and-host.md) — consumes the `examFindings` state + reducer actions.
- [`task-obj-04-derivation-close-gate.md`](./task-obj-04-derivation-close-gate.md) — proves the byte-parity contract this task establishes.

---

**Last Updated:** 2026-06-18  
**Pattern:** Subjective `subj-01` (`complaints` → derived `cc`/`hopi`) ported to exam.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
