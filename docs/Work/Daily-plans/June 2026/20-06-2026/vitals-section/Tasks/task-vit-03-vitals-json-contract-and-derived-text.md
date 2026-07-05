# Task vit-03: `vitals_json` contract — types, Zod validation, service read/write, derived-text parity

> **Filename:** `task-vit-03-vitals-json-contract-and-derived-text.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Plumb the `vitals_json` contract end-to-end and **prove the derived-text mirror is byte-stable**. Add BE + FE
types for `vitals_json` (+ `vitals_hidden`), a **Zod schema** that validates the json payload against the
registry's per-vital bounds (V3-D1 — bounds live in code, not SQL), service read/write, and the **derived-text
mirror** so that for rows that use only the shipped columns the `examination_findings` / `vitals` text and the
PDF/SMS/snapshot are **byte-identical to today**, while json-backed vitals are **additive**. Mirrors the P5
`test_results_json` derive/validate path.

**Program / Phase:** vitals-section · VP1 (catalog + storage foundation)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~3–5 hours  
**Status:** ✅ **Done** (2026-06-20 — Opus-grade contract + parity).

**Change Type:**
- [x] **Update existing** — BE/FE types, Zod, service read/write, derived-text. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** the vit-02 columns; the P5 `test_results_json` validate + derive precedent; `backend/src/utils/validation.ts`, `services/prescription-service.ts`, `types/prescription.ts`; the existing vitals derived-text path.
- ✅ **What's missing:** ~~types + Zod + service + derived-text for `vitals_json`; the byte-parity proof for shipped-column rows.~~ **Shipped (see artifacts below).**

**Scope Guard:**
- Expected files touched: ≤ 6 (BE types, FE types, Zod schema, service read/write, derived-text helper + tests). **No** UI (VP2+), **no** new endpoint, **no** schema (vit-02 owns it), **no** widening of an unrelated read.
- Controllers orchestrate only — validate (Zod) → service → respond; no DB access in controllers; throw typed `AppError` (per agent contract).

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/architecture/CONTRACTS.md`](../../../../../Reference/engineering/architecture/CONTRACTS.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Types (BE + FE)
- [x] ✅ 1.1 Added `VitalsJson` (typed shape keyed by the registry's json vital keys — 13 numeric + 7 categorical, all optional/nullable, canonical units) to `backend/src/types/prescription.ts` + `frontend/types/prescription.ts` (+ `vitals_json` on `Prescription`/`PrescriptionWithRelations` and `vitalsJson` on `StructuredSoapInput`); added `vitals_hidden` to BE + FE doctor-settings types (transport deferred to vit-07). - **Completed: 2026-06-20**
- [x] ✅ 1.2 Existing `vitals_*` typed fields untouched. - **Completed: 2026-06-20**

### 2. Zod validation (registry-driven)
- [x] ✅ 2.1 `vitalsJsonSchema` built programmatically from a single backend bounds table + categorical value-sets that mirror the vit-01 registry (no per-field hand-repeat); **unknown keys stripped** (object default), **out-of-bounds rejected**, empty `{}` valid (documented in-file). - **Completed: 2026-06-20**
- [x] ✅ 2.2 Wired into `structuredSoapFieldsSchema` → validated in the create/update body schemas (global ZodError→ValidationError; no controller try/catch). - **Completed: 2026-06-20**

### 3. Service read/write
- [x] ✅ 3.1 Persist `vitals_json` on create (`{}` default) + update; cockpit reads use `select('*')` so it returns automatically (incl. `listPrescriptionsByPatient`). - **Completed: 2026-06-20**
- [x] ✅ 3.2 No write to the shipped `vitals_*` columns from json (one value, one home). - **Completed: 2026-06-20**

### 4. Derived-text mirror + byte-parity
- [x] ✅ 4.1 New pure helper `frontend/lib/cockpit/vitals-json.ts` (`normalizeVitalsJson` + `deriveVitalsText`) renders json vitals **additively** in registry order; empty/all-invalid → `""` so shipped-column rows append nothing (byte-parity, V3-D5). - **Completed: 2026-06-20**
- [x] ✅ 4.2 Parity test asserts `deriveVitalsText({}|null|undefined) === ""` + additive rendering + purity (no input mutation). - **Completed: 2026-06-20**

### 5. Verification & Testing
- [x] ✅ 5.1 Backend Zod tests (accept valid / reject out-of-bounds / strip unknown / null) + frontend normalize+derive parity tests. - **Completed: 2026-06-20**
- [x] ✅ 5.2 `backend tsc` clean + `backend test` green (prescriptions 53, rx-template suites 90 total); `frontend tsc` introduces no new errors (pre-existing social-history/subjective noise unchanged); frontend vitals suites green (27); lint clean on touched files. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/types/prescription.ts, frontend/types/prescription.ts (vitals_json + vitals_hidden)
UPDATE: backend/src/utils/validation.ts (Zod for vitals_json)
UPDATE: backend/src/services/prescription-service.ts (read/write vitals_json)
UPDATE: the vitals derived-text helper (+ parity test)
DO NOT TOUCH: shipped vitals_* columns/derivation byte-output; any UI (VP2+); new endpoints
```

**When updating existing code:**
- [ ] Shipped-column rows derive **byte-identically** — additive only (the parity contract this task exists to prove).
- [ ] Bounds come from the registry (single source) — do not duplicate limits in Zod.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Byte-parity for shipped-column rows** — json vitals are additive; legacy output never shifts.
- **Validation in Zod against the registry**, not SQL (V3-D1).
- **One value, one home** — the registry `storage` flag decides column vs json; never both.
- Agent-contract hard rules: Zod-validate external input in the controller; no try/catch in controllers; typed `AppError`; never log vital values.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Read + write** of the new `vitals_json` (PHI column, like `vitals_*`).
  - [x] **RLS verified?** **Yes** — reuses existing prescription RLS; reads use `select('*')`, no widened/new read.
- [x] **Any PHI in logs?** **No** — never log vital values or `vitals_json`.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — inherits prescription retention.

> **Opus-grade:** the derived-text byte-parity + cross-layer contract is the parity-risk surface of VP1; runs under the vit-02 migration gate.

---

## ✅ Acceptance & Verification Criteria

- [x] `vitals_json` typed + Zod-validated (registry bounds) + round-trips create→read; `vitals_hidden` typed.
- [x] Shipped-column rows derive byte-identically (empty json → `""`); json vitals additive; PDF/SMS/snapshot unchanged.
- [x] `backend tsc/test` + `frontend tsc` green for the slice (no new FE errors introduced).

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The contract spine. Once `vitals_json` validates + round-trips + mirrors byte-stably, VP2 (render) and VP4 (trends) can rely on a stable shape, and the close-gate (vit-13) only has to re-prove view-only parity end-to-end.

---

## 🔗 Related Tasks

- [`task-vit-02-migration-vitals-json.md`](./task-vit-02-migration-vitals-json.md) — the column this validates/persists.
- [`task-vit-04-form-state-payload-wiring.md`](./task-vit-04-form-state-payload-wiring.md) — the frontend form-state/payload counterpart.

---

**Last Updated:** 2026-06-20  
**Pattern:** additive JSONB contract + derived-text byte-parity — mirror of the P5 `test_results_json` path.  
**Reference:** `Reference/engineering/architecture/CONTRACTS.md`
