# Task rxl-21: Revision columns on `prescriptions`

> **Model:** executed on Grok 4.6 at owner override 2026-09-10 (Opus gate waived). Additive PHI columns on `prescriptions`.

---

## 📋 Task Overview

Give an issued prescription a version identity and a place to record that it was handed over — without a snapshot table. A revision is a **new row** (RXL-DL-13); this migration only adds the columns the clone and the write guard read.

**Program / Phase:** rx-lifecycle · Phase 3-B (same-day revise)
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~3 hours
**Status:** ✅ **IMPLEMENTED** (`231` applied on dev 2026-09-10)
**Completed:** 2026-09-10

**Change Type:**
- [x] **Update existing** — additive ALTER on `prescriptions`; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

**Columns (nullable, no backfill):**

| Column | Role |
|---|---|
| `version` | Integer. Advances on re-issue, never on autosave (RXL-DL-9). Historical rows stay null. |
| `supersedes_id` | This row replaces that prescription. |
| `superseded_by_id` | Inverse pointer so a list can mark Version 1 without joining. |
| `revision_reason` | Required on a revision (RXL-Q8 presets). |
| `issued_at` | First time this row left the clinic (send or print of an issued copy). Not the same as `attested_at`. |
| `printed_at` | Delivery event. Print of a requisition may set this without attesting (RXL-DL-16). |

**Current State:**
- ✅ Attest stamp (`attested_at`) from `rxl-05` / migration `226`.
- ✅ Plural notes already legal (`appointment_id` indexed, no unique).
- ✅ Migration `231` adds the six columns. No snapshot table.
- ✅ Apply `231` on dev (operator, 2026-09-10).

**Scope Guard:** Schema + types + `DB_SCHEMA.md` only. No clone writer (`rxl-22`). No write-guard change (`rxl-23`). No backfill that fabricates Version 1.

**Reference:** RXL-DL-9, DL-12, DL-13, DL-16 · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 Head was `230`. Next unclaimed is `231`.
- [x] 1.2 No existing `version` / `supersedes_id` / `superseded_by_id` / `revision_reason` / `issued_at` / `printed_at` on `prescriptions`. Billing `issued_at` is a different table.

### 2. Migration
- [x] 2.1 Additive, nullable, `IF NOT EXISTS`, `COMMENT ON` every column. `version` comment states re-issue only.
- [x] 2.2 Self-FKs `ON DELETE SET NULL` (031 sibling-pointer pattern). Not CASCADE (wipes the other version). Not RESTRICT (blocks appointment CASCADE when two versions exist).
- [x] 2.3 Reverse in-file (document only). Re-runnable.
- [x] 2.4 No RLS change beyond existing doctor-owned `prescriptions` policy.

### 3. Types + docs
- [x] 3.1 Backend required `| null`. Frontend optional (fixtures stay valid).
- [x] 3.2 `DB_SCHEMA.md`. `RLS_POLICIES.md` unchanged.

### 4. Verification
- [ ] 4.1 Apply on dev twice (operator).
- [x] 4.2 Type-check + lint on touched type files.

---

## 📁 Files

```
CREATE: backend/migrations/231_prescriptions_revision_columns.sql
UPDATE: backend/src/types/prescription.ts
UPDATE: frontend/types/prescription.ts
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md
```

---

**Not this task:** clone-on-reissue, write-guard relaxation, cockpit strip, footer, filename.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10 (file + types; apply-on-dev outstanding)
