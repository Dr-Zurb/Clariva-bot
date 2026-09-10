# Task rxl-05: Attest stamp column + types

> **Model:** executed on Grok 4.6 at owner override 2026-08-31 (Opus gate waived). ALTER on a PHI table.

---

## 📋 Task Overview

Record on the prescription row the moment it was attested — the boundary everything in this program is measured from. Today nothing records finish or print; only `sent_to_patient_at` exists, and it is set by the digital send alone, which is why print-only prescriptions have no boundary at all.

Additive column, no backfill, no behaviour change on deploy. Setting the stamp is `rxl-06`.

**Program / Phase:** rx-lifecycle · Phase 2 (append notes)
**Batch:** [`plan-p2-rx-lifecycle-append-notes-batch.md`](../plan-p2-rx-lifecycle-append-notes-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md`](./EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md)
**Estimated Time:** ~3 hours
**Status:** ✅ **IMPLEMENTED** (migration file + types; apply-on-dev is operator)
**Completed:** 2026-08-31

**Change Type:**
- [x] **Update existing** — additive ALTER on an existing PHI table; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

**Current State:**
- ✅ `prescriptions` (`026`) — has `sent_to_patient_at`, `created_at`, `updated_at` and an `updated_at` trigger. RLS is doctor-owned via `doctor_id` with all four policies.
- ✅ House migration pattern — `223` / `224` / `225`: `IF NOT EXISTS`, `COMMENT ON` for non-obvious columns, in-file reverse block, dated header.
- ✅ Later prescription migrations show the additive-column idiom (`103`, `150`, `151`, `160`, `161`, `167`).
- ❌ No column records finish or print. `sent_to_patient_at` covers the digital send only.
- ⚠️ Migration head was `225` at spec time. `hl-01` also claims "next unclaimed" — whichever lands second must re-check rather than assume.
- ⚠️ Historical rows have no attest time and must not be given a fabricated one.

**Scope Guard:** ≤ 4 files. One column. No revision counter and no supersede columns — those are `rxl-11`. No RLS change. No backfill. No service or frontend change.

**Reference:** product plan RXL-DL-1, RXL-Q1 · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 Founder override + RXL-Q1 **Locked** (first of finish / send / print). Phase 1 mechanical residuals accepted.
- [x] 1.2 Next unclaimed is `226`. `hl-01` has not landed.
- [x] 1.3 No existing column (`attested_at` / `attest_at` / `attestedAt`) — `sent_to_patient_at` is digital-send only.

### 2. Migration
- [x] 2.1 `attested_at TIMESTAMPTZ NULL` via `ADD COLUMN IF NOT EXISTS`.
- [x] 2.2 `COMMENT ON` states lock boundary, first of finish / send / print, not `sent_to_patient_at`.
- [x] 2.3 No index.
- [x] 2.4 No backfill. Header states historical rows stay null.
- [x] 2.5 Reverse in-file. Re-runnable as a no-op.

### 3. Types + docs
- [x] 3.1 Backend `Prescription.attested_at: string | null`.
- [x] 3.2 Frontend `Prescription.attested_at?: string | null` (optional so existing fixtures stay valid).
- [x] 3.3 `DB_SCHEMA.md` updated. `RLS_POLICIES.md` unchanged.

### 4. Verification
- [ ] 4.1 Apply on dev twice (operator).
- [x] 4.2 No service or component reads the column.
- [x] 4.3 Backend `tsc --noEmit` + eslint on the type file clean. Frontend full `tsc` still has pre-existing residuals (none in `types/prescription.ts`).

---

## 📁 Files

```
CREATE: backend/migrations/226_prescriptions_attested_at.sql
UPDATE: backend/src/types/prescription.ts
UPDATE: frontend/types/prescription.ts
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md
```

**Existing Code Status:**
- ✅ `026_prescriptions.sql` — EXISTS (base table; do not ALTER anything else)
- ✅ `223` / `224` / `225` — EXIST (house pattern to copy)
- ⚠️ `backend/src/types/prescription.ts` — EXISTS, needs the new field
- ⚠️ `frontend/types/prescription.ts` — EXISTS, needs the mirror

**When creating a migration:**
- [ ] Read all previous migrations (numeric order) to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Additive only. A deploy of this migration alone must change no observable behaviour.
- Do not reuse or repurpose `sent_to_patient_at`. It means "the digital send happened" and other code depends on that meaning — including the PDF freeze `rxl-15` will re-key.
- Do not fabricate an attest time for historical rows. A null stamp is honest; a guessed one is a false record.
- Nothing in this task may read or write the column. If a service change feels necessary to prove it works, that is `rxl-06`.
- No PHI in comments that could surface in logs (COMPLIANCE.md).
- Deploy the migration **before** the code that depends on it (`MIGRATIONS_AND_CHANGE.md`).

---

## 🌍 Global Safety Gate

- [x] Data touched? **Yes** — ALTER on an existing PHI table. RLS unchanged; doctor-owned `doctor_id` policies from 026 still cover the new column.
- [x] PHI in logs? No.
- [x] External API / AI? No.
- [x] Retention? **No change** — the column adds no new retention obligation; the 7-year prescription policy already covers this row.

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration applies, re-applies as a no-op, and reverses in-file. **Operator:** apply `226` on dev twice.
- [x] Historical rows are null; none were backfilled (no UPDATE).
- [x] Types updated on both sides; no service or component reads the column yet.
- [x] `DB_SCHEMA.md` updated.
- [x] Backend type-check + lint clean. Frontend residuals pre-existing and unrelated.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-06-attest-and-write-guard.md`](./task-rxl-06-attest-and-write-guard.md) — sets and enforces the stamp
- `rxl-11` (Phase 3) — adds the revision counter and supersede columns
- `rxl-15` (Phase 3) — re-keys the PDF freeze from `sent_to_patient_at` to this stamp

---

**Last Updated:** 2026-08-31 (implemented)
**Completed:** 2026-08-31 (file + types; apply-on-dev outstanding)
