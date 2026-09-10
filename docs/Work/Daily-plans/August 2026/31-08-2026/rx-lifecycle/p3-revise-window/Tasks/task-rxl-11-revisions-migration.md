# Task rxl-11: Revision store + counter + supersede columns

> **Model: Opus (max thinking). Auto must not run this task.** New PHI table + RLS, plus an ALTER on `prescriptions`.

---

## 📋 Task Overview

Somewhere to keep what was issued. One append-only row per finalized revision holding the clinical payload as attested and a pointer to the PDF bytes that were handed over, plus a revision counter and supersede pointer on the prescription itself.

Values must live here because they cannot live in the audit log — `audit_logs.metadata` is documented no-PHI, and `logDataModification` accepts field **names** only. A dose changing from 500 mg to 50 mg is PHI.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~5 hours
**Status:** ⏳ **PENDING** (blocked on Phase 2 gate + promote)
**Completed:** —

**Change Type:**
- [x] **New feature** — new table, additive
- [x] **Update existing** — additive ALTER on `prescriptions`; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

**Current State:**
- ✅ House pattern `223` / `224` / `225` — deny-all RLS, append-only trigger with `pg_trigger_depth()` for legitimate cascades, `IF NOT EXISTS`, `COMMENT ON`, in-file reverse.
- ✅ `prescriptions` (`026`) — doctor-owned RLS via `doctor_id`, `updated_at` trigger, cascade from `appointments`.
- ✅ Attest stamp from `rxl-05`.
- ✅ `audit_logs` (`001`) — exists, metadata documented no-PHI. Not a home for values.
- ❌ No snapshot store. No revision counter. No supersede pointer.
- ⚠️ Existing prescriptions have no revision history and must not be given a fabricated revision 1.
- ⚠️ Migration head moves as `hl-01` and `rxl-05` land. Re-check, do not assume.

**Scope Guard:** ≤ 5 files. Schema only — no service, no controller, no frontend. No snapshot **writer** (that is `rxl-12`). No storage-path change (`rxl-15`). No backfill.

**Reference:** product plan RXL-DL-9, RXL-DL-10, RXL-DL-12, RXL-Q4 · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 Phase 2 gate green, batch `Committed`, RXL-Q4 recorded. Else **STOP**.
- [ ] 1.2 Read all previous migrations in numeric order. Confirm the next number is unclaimed.
- [ ] 1.3 Confirm no existing table already stores prescription payload snapshots under another name.

### 2. Revision table
- [ ] 2.1 One row per finalized revision of one prescription. Ordered, uniquely identified per prescription.
- [ ] 2.2 Hold the clinical payload as attested, in the same shape the form persists, so a snapshot can be diffed against the live row without a translation layer.
- [ ] 2.3 Hold a pointer to the stored PDF for that revision, plus who finalized it and when. `rxl-15` owns producing the artifact; this column only records where it lives.
- [ ] 2.4 Room for the reason a revision was superseded, for `rxl-17`.
- [ ] 2.5 Append-only: UPDATE and DELETE raise. Allow the legitimate cascade from a prescription delete using the depth check `224` established.
- [ ] 2.6 RLS enabled, **deny-all / service-role only**. Doctor reads go through a service endpoint, not a policy.
- [ ] 2.7 `COMMENT ON` every non-obvious column. State plainly that this is the record of what was issued and is never edited.
- [ ] 2.8 Reverse in-file. Re-runnable.

### 3. Prescription columns
- [ ] 3.1 Revision counter. Document in the comment that it advances on finalize, never per save (RXL-DL-9) — the comment is the defence against a future reader assuming otherwise.
- [ ] 3.2 Supersede pointer to another prescription, plus the required reason (RXL-DL-12).
- [ ] 3.3 Additive, nullable where historical rows have no answer. No backfill.

### 4. Types + docs
- [ ] 4.1 Backend row + insert types for the new table. **No update type** — the table is append-only.
- [ ] 4.2 Backend + frontend prescription type additions.
- [ ] 4.3 `DB_SCHEMA.md` and `RLS_POLICIES.md`.

### 5. Verification
- [ ] 5.1 Apply on dev twice (operator).
- [ ] 5.2 UPDATE and DELETE raise; cascade from prescription delete succeeds.
- [ ] 5.3 anon and authenticated roles cannot read the table.
- [ ] 5.4 `tsc` + lint clean; existing suites green.

---

## 📁 Files

```
CREATE: backend/migrations/2NN_prescription_revisions.sql
UPDATE: backend/src/types/database.ts
UPDATE: backend/src/types/prescription.ts
UPDATE: frontend/types/prescription.ts
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md
UPDATE: docs/Reference/engineering/compliance/RLS_POLICIES.md
```

**Existing Code Status:**
- ✅ `223` / `224` / `225` — EXIST (house pattern to copy, including the cascade depth check)
- ✅ `026_prescriptions.sql` — EXISTS (base table)
- ❌ revision table — MISSING
- ⚠️ type files — EXIST, need additions

**When creating a migration:**
- [ ] Read all previous migrations (numeric order) to understand schema, naming, RLS, triggers, and how the project connects to the database — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) and [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The snapshot is the **record of what was issued**. It is never edited, and the append-only trigger is what makes that true rather than a convention.
- Deny-all RLS. This table holds full clinical payloads; a doctor-scoped policy would be a second read surface to reason about. Service-role only, like `223`–`225`.
- Do not store a second copy of anything the live row already holds authoritatively — the snapshot is a point-in-time copy by design, but do not also mirror it into a summary column.
- Do not backfill historical prescriptions with a synthetic revision 1. There is no snapshot of what those documents said, and inventing one is a false record.
- Nothing in this task writes to the table. If proving it works seems to need a writer, that is `rxl-12`.
- No PHI in comments that could surface in logs (COMPLIANCE.md).
- Deploy before the code that depends on it (`MIGRATIONS_AND_CHANGE.md`).

---

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — new PHI table holding full clinical payloads, plus an ALTER on an existing PHI table. RLS deny-all on the new table; `prescriptions` policies unchanged and re-verified after the ALTER.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? **Yes** — snapshots inherit the 7-year prescription obligation and cascade from the prescription. State that in the header comment. Flag for whoever owns the account-deletion worker whether this table will orphan rows; that worker is **out of scope**.

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration applies, re-applies as a no-op, reverses in-file.
- [ ] Append-only proven; legitimate cascade proven.
- [ ] RLS proven closed to anon and authenticated.
- [ ] Historical rows unbackfilled.
- [ ] Types updated; no update type on the append-only table.
- [ ] `DB_SCHEMA.md` and `RLS_POLICIES.md` updated.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-12-snapshot-and-revision-bump.md`](./task-rxl-12-snapshot-and-revision-bump.md) — the writer
- [`task-rxl-15-pdf-freeze-and-retention.md`](./task-rxl-15-pdf-freeze-and-retention.md) — produces the artifact this table points at
- [`task-rxl-17-supersede-correction.md`](./task-rxl-17-supersede-correction.md) — uses the supersede columns

---

**Last Updated:** 2026-08-31
**Completed:** —
