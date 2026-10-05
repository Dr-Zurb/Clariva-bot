# Task clk-09: Illness chips column and actor comments

## 📋 Task Overview

The four illness chips need a place on the appointment. The sidecar's `actor_id` comment must allow a patient id when the source is the patient.

**Program / Phase:** clinic-link · Phase 2 (visit-prep)
**Batch:** [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./EXECUTION-ORDER-p2-clinic-link-visit-prep.md)
**Estimated Time:** 2 hours
**Status:** ✅ **DONE** (2026-09-24)

**Change Type:**
- [x] **Update existing** — `appointments` and two column comments

**Current State:**
- ✅ **What exists:** `appointments.reason_for_visit`. `patient_history_submissions.actor_id` and `visit_documents.actor_id` are `UUID NOT NULL` with no FK. Both comments say the value is an `auth.users` id. Latest migration in the repo at write-up: `242`.
- ❌ **What's missing:** a nullable place for the four chips. Comments that mention a patient id.
- ⚠️ **Notes:** Do not start until `clk-08` is green. Read migrations in numeric order through `242` before adding the next one. This task does not write a row.

**Scope Guard:**
- Expected files touched: ≤ 3 (one migration, `DB_SCHEMA.md`, one migration test)
- Do not add an upload route
- Do not change desk history or the accept path
- No new RLS policy

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — one nullable column on `appointments`. Comments only on the two `actor_id` columns.
- [x] **RLS verified?** Y — existing appointment policies cover the row. Do not add a patient insert policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — the column goes away with the appointment

---

## ✅ Task Breakdown

### 1. Column
- [x] 1.1 Read migrations in numeric order through `242`
- [x] 1.2 Add nullable `appointments.previsit_context` for the four chips in CLK-DL-9. Reversible. Re-run safe.
- [x] 1.3 Leave `reason_for_visit` alone

### 2. Comments
- [x] 2.1 `patient_history_submissions.actor_id`: staff rows stay an `auth.users` id; `source = 'patient'` stores `patients.id`
- [x] 2.2 Same sentence on `visit_documents.actor_id`. No upload behavior in this task.

### 3. Verification
- [x] 3.1 Migration test: column is nullable, comments mention `patients.id`, no `CREATE POLICY`
- [x] 3.2 Typecheck the touched files

---

## 📁 Files to Create/Update

- ❌ Next migration after `242` — MISSING
- ⚠️ `DB_SCHEMA.md` appointments summary — EXISTS, needs the column
- ❌ Migration content test — MISSING

**When creating a migration:**
- [x] Read previous migrations in numeric order — see [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Additive nullable column. No backfill. No new RLS.
- The four chips are since when, course, already tried, and aim. Aim values are the four in CLK-DL-9.
- `reason_for_visit` is not copied into this column.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [x] An appointment can store the chips, and a null value is valid
- [x] Both `actor_id` comments allow `patients.id` when the source is the patient
- [x] Desk writes and visit-document uploads are unchanged

---

## 📝 Notes

CLK-DL-9, CLK-DL-10. The patient write is `clk-11`. Photos are Phase 3.

---

## 🔗 Related Tasks

- [`task-clk-10-history-form-token.md`](./task-clk-10-history-form-token.md) — parallel
- [`task-clk-11-patient-history-write.md`](./task-clk-11-patient-history-write.md) — next write

**Last Updated:** 2026-09-23
