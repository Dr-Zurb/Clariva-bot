# Task vit-02: Migration — additive `prescriptions.vitals_json` + `doctor_settings.vitals_hidden`

> **Filename:** `task-vit-02-migration-vitals-json.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 🛑 STOP — Migration / Opus gate

> This task introduces a **new `prescriptions` column** + a new `doctor_settings` column. Per the always-applied agent contract + [`.cursor/rules/migrations.mdc`], **do not silently proceed**: surface the migration approach to the user and run this task on **Opus (max-thinking)**. Follow [`../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md`](../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) exactly; keep the change **additive + reversible**.

---

## 📋 Task Overview

One **additive, reversible** migration that gives the catalog a home and the visibility engine a store:
1. `prescriptions.vitals_json JSONB NOT NULL DEFAULT '{}'::jsonb` (+ `jsonb_typeof = 'object'` CHECK) — holds all `storage: "json"` vitals from vit-01. Per-field bounds are enforced in **Zod** (vit-03), **not** SQL CHECK (V3-D1), matching the `objective_json` / `test_results_json` precedent (migrations 153/154).
2. `doctor_settings.vitals_hidden JSONB NOT NULL DEFAULT '[]'::jsonb` (+ `jsonb_typeof = 'array'` CHECK) — the per-doctor hidden-vital delta set, a **verbatim clone** of `objective_section_hidden` (migration 152).

The 7 shipped vitals columns stay **unchanged** (back-compat). No backfill (defaults cover existing rows). No RLS change — `prescriptions` and `doctor_settings` policies already cover all columns.

**Program / Phase:** vitals-section · VP1 (catalog + storage foundation)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~1–2 hours (after approval)  
**Status:** ✅ **Done** (2026-06-20 — approach confirmed on Opus turn; migration **156** shipped).

**Change Type:**
- [x] **Migration (additive)** — two new JSONB columns; reversible; no backfill; no RLS change.

**Current State:** (check existing code first!)
- ✅ **What exists:** migration `152_doctor_settings_objective_layout.sql` (the `*_hidden` array-column pattern to clone); `153/154` (the additive `*_json` object-column + CHECK pattern); existing `vitals_*` columns (103/151).
- ✅ **What's missing:** ~~a home for json-backed vitals + the per-doctor hidden-vital set.~~ **Shipped: `prescriptions.vitals_json` + `doctor_settings.vitals_hidden` (migration 156).**

**Scope Guard:**
- Expected files touched: ≤ 2 (one new migration SQL file + its migration test, mirroring `tests/unit/migrations/*`). **2 files touched.**
- **Additive only** — no column drop/alter on existing vitals; no data backfill; no RLS policy edit.
- Next free migration number (currently 155 is the latest — use **156**); confirm at write time. **Confirmed: 155 was latest; shipped as 156.**

**Reference Documentation:**
- [`../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md`](../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. `prescriptions.vitals_json`
- [x] ✅ 1.1 `ADD COLUMN IF NOT EXISTS vitals_json JSONB NOT NULL DEFAULT '{}'::jsonb`; `CHECK (jsonb_typeof(vitals_json) = 'object')` (drop+add by name, idempotent). - **Completed: 2026-06-20**
- [x] ✅ 1.2 `COMMENT ON COLUMN` documenting: additive extended-vitals store; Zod-validated; canonical units; view-parity (does not change `examination_findings` for shipped-column rows). - **Completed: 2026-06-20**

### 2. `doctor_settings.vitals_hidden`
- [x] ✅ 2.1 `ADD COLUMN IF NOT EXISTS vitals_hidden JSONB NOT NULL DEFAULT '[]'::jsonb`; `CHECK (jsonb_typeof(vitals_hidden) = 'array')` — clone of `objective_section_hidden`. - **Completed: 2026-06-20**
- [x] ✅ 2.2 `COMMENT ON COLUMN` documenting: per-doctor hidden-vital delta set; UI-only; never affects PDF/examination_findings/test_results/vitals. - **Completed: 2026-06-20**

### 3. Reversibility + tests
- [x] ✅ 3.1 Document the rollback (DROP CONSTRAINT + DROP COLUMN for both) in the migration header (documented-only, mirror 152). - **Completed: 2026-06-20**
- [x] ✅ 3.2 Migration test (mirror `tests/unit/migrations/153/154/155`): both columns exist, defaults + CHECK constraints hold, idempotent re-run is a no-op. - **Completed: 2026-06-20**

### 4. Verification
- [x] ✅ 4.1 Migration runs clean locally; `backend` migration tests green (10/10); no RLS/policy diff. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/156_prescriptions_vitals_json_and_doctor_vitals_hidden.sql (number TBC)
CREATE: backend/tests/unit/migrations/156-*-migration.test.ts
DO NOT TOUCH: existing vitals_* columns; RLS policies; any service/type code (vit-03)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Additive + reversible** — no alter/drop of shipped columns; no backfill (defaults cover existing rows).
- **Validation lives in Zod, not SQL** for `vitals_json` (V3-D1) — SQL enforces only `jsonb_typeof`.
- **`vitals_hidden` is a verbatim clone** of `objective_section_hidden` (152) — config strings only, no PHI.
- **No RLS change** — both tables' existing policies already cover new columns.

**DO NOT include** code or signatures **until the approach is confirmed on the Opus turn.**

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Schema add** — two additive JSONB columns; **STOP/Opus** confirmed (approach signed off before SQL).
  - [x] **RLS verified?** **Yes** — existing `prescriptions` (026) + `doctor_settings` (009) policies cover all columns; no new policy.
  - [x] **New migration?** **Yes** — additive + reversible; no backfill.
- [x] **Any PHI in logs?** **No** — `vitals_json` is a PHI *column* (like `vitals_*`) but is never logged.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** — inherits prescription retention; default `{}`.

> **STOP / Opus:** new `prescriptions` column. Confirm the migration approach (column name, CHECK, number, no-backfill) before writing SQL.

---

## ✅ Acceptance & Verification Criteria

- [x] Both columns added, defaulted, type-checked, idempotent; rollback documented.
- [x] No RLS change; no backfill; shipped columns untouched.
- [x] `backend` migration tests green (10/10 in `156-…-migration.test.ts`).

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The single schema touch of the whole program. Mirrors three shipped precedents exactly (152 hidden-set, 153/154 json columns), so the risk is in *confirming* the approach, not inventing one. Everything after this is frontend + contract work with no further schema.

---

## 🔗 Related Tasks

- [`task-vit-01-storage-agnostic-vitals-registry.md`](./task-vit-01-storage-agnostic-vitals-registry.md) — defines what goes in `vitals_json`.
- [`task-vit-03-vitals-json-contract-and-derived-text.md`](./task-vit-03-vitals-json-contract-and-derived-text.md) — types/Zod/service/derived-text over this column.
- [`task-vit-07-vitals-visibility-persistence.md`](./task-vit-07-vitals-visibility-persistence.md) — consumes `vitals_hidden`.

---

**Last Updated:** 2026-06-20  
**Pattern:** additive reversible JSONB columns — clone of migrations 152 (hidden set) + 153/154 (json store).  
**Reference:** `Reference/engineering/development/MIGRATIONS_AND_CHANGE.md`
