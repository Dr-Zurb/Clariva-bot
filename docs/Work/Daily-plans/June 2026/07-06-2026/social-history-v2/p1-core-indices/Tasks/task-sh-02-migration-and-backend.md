# Task sh-02: migration 125 + backend (types, validation, service passthrough)

> **Filename:** `task-sh-02-migration-and-backend.md` in `social-history-v2/p1-core-indices/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Persist the structured model from sh-01: add the **`social_history_structured` JSONB** column
(migration `125`), add backend types + a **zod schema** validating the Phase-1 shape, and pass
the field through **insert / update / last-subjective** in [`prescription-service.ts`](../../../../../../../backend/src/services/prescription-service.ts).
`social_history` TEXT stays as the derived display string (written by the frontend in sh-03).

**Program / Phase:** social-history-v2 · Phase 1 (core + indices)  
**Batch:** [`plan-p1-social-history-v2-core-indices-batch.md`](../plan-p1-social-history-v2-core-indices-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-social-history-v2-core-indices.md`](./EXECUTION-ORDER-p1-social-history-v2-core-indices.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — additive column + validation + passthrough.

**Current State:**
- ✅ **What exists:** the derived-field pattern in [`116_prescriptions_subjective_expansion.sql`](../../../../../../../backend/migrations/116_prescriptions_subjective_expansion.sql) (`complaints` JSONB + `social_history` TEXT); passthrough of `social_history` in [`prescription-service.ts`](../../../../../../../backend/src/services/prescription-service.ts) (insert ~L99–102, last-subjective select ~L591 / return ~L628–632); history TEXT validation in [`validation.ts`](../../../../../../../backend/src/utils/validation.ts) (~L1317 create, ~L1522 update).
- ✅ **What's missing (was):** the JSONB column + structured types + zod schema + passthrough — **now shipped in sh-02**.

**Scope Guard:**
- Expected files touched: ≤ 5 (migration; `prescription.ts` types; `validation.ts`; `prescription-service.ts`; one backend test). Migration ceiling is `124` → use **`125`** (re-confirm; unstaged `122–124` exist locally).

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4 · source plan §P1-01 / §P1-06.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 Read all prior migrations (numeric order); confirm `125` is free. - **Completed: 2026-06-07**
- [x] ✅ 1.2 Create `125_prescriptions_social_history_structured.sql`: `ADD COLUMN IF NOT EXISTS social_history_structured JSONB NULL` + PHI comment; RLS unchanged (026 covers it). Document rollback (drop column). - **Completed: 2026-06-07**

### 2. Backend types + validation
- [x] ✅ 2.1 Add `SocialHistoryStructured` to [`prescription.ts`](../../../../../../../backend/src/types/prescription.ts) types + the DTO/row fields. - **Completed: 2026-06-07**
- [x] ✅ 2.2 Zod schema in [`validation.ts`](../../../../../../../backend/src/utils/validation.ts): status enums, bounded numbers (per_day, years, units/week), CAGE booleans, notes ≤ history max — on **create** + **update**; keep `socialHistory` TEXT validation. - **Completed: 2026-06-07**

### 3. Service passthrough
- [x] ✅ 3.1 Insert + update: pass `social_history_structured` (default null). - **Completed: 2026-06-07**
- [x] ✅ 3.2 last-subjective: add to the select + return for carry-forward. - **Completed: 2026-06-07**
- [x] ✅ 3.3 Audit/PHI field list (`validation.ts` ~L2441) — verified: that array is `noteFavoriteFieldKeySchema` (note-favorites field keys), not prescription PHI tracking; no change needed. - **Completed: 2026-06-07**

### 4. Verification & Testing
- [x] ✅ 4.1 Migration idempotent; column NULL-able; RLS unchanged. - **Completed: 2026-06-07**
- [x] ✅ 4.2 Validation accept/reject cases + service passthrough (insert + last-subjective) tests; backend suite + `tsc`/lint green. - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/125_prescriptions_social_history_structured.sql
UPDATE: backend/src/types/prescription.ts
UPDATE: backend/src/utils/validation.ts (create + update schemas; PHI list)
UPDATE: backend/src/services/prescription-service.ts (insert/update/last-subjective)
CREATE/UPDATE: backend test for validation + passthrough
DO NOT TOUCH: cc/hopi derivation; the social_history TEXT column shape
```

**When creating a migration:**
- [x] Read all previous migrations (numeric order) first — [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md), [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Additive only** — `IF NOT EXISTS`, NULL-able, no data backfill, no destructive change (mirror 116).
- **JSONB validated app-side** — zod guards the shape; the column stays flexible.
- **`social_history` TEXT unchanged** — still written (derived) by the frontend; this task does not derive it server-side.
- **PHI** — new column carries PHI; RLS via 026; 7-year retention; no PHI in logs.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — new `social_history_structured` JSONB (PHI).
  - [x] **RLS verified?** **Yes** — covered by migration 026 (`auth.uid() = doctor_id`); no policy change.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **Yes** — inherits `prescriptions` 7-year retention + account-deletion cascade.

---

## ✅ Acceptance & Verification Criteria

- [x] Migration `125` idempotent + RLS unchanged; structured payload validates (accept/reject) and round-trips through insert/update + last-subjective; backend suite + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Frozen JSONB shape comes from sh-01. Frontend writes both JSONB + derived TEXT in sh-03.

---

## 🔗 Related Tasks

- [`task-sh-01-data-model-and-indices.md`](./task-sh-01-data-model-and-indices.md) — defines the shape.
- [`task-sh-03-form-plumbing-and-ui.md`](./task-sh-03-form-plumbing-and-ui.md) — sends the payload.

---

**Last Updated:** 2026-06-07  
**Pattern:** mirrors `116` additive JSONB + `prescription-service` passthrough.  
**Reference:** `process/MIGRATIONS_AND_CHANGE.md` · source plan §P1-01 / §P1-06.
