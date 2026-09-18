# Task hl-01: History-submission sidecar table

> **Model: Opus (max thinking). Auto must not run this task.** New PHI table + RLS.

---

## 📋 Task Overview

One append-only row per appointment: who submitted, which notice they saw, and the four answers. This is the only place patient-authored history lives until a doctor accepts an item onto the chart.

**Program / Phase:** history-link · Phase 1
**Batch:** [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-history-link-form-to-chart.md`](./EXECUTION-ORDER-p1-history-link-form-to-chart.md)
**Estimated Time:** ~5 hours
**Status:** ⏳ **PENDING** (blocked on promote)
**Completed:** —

**Change Type:**
- [x] **New feature** — new table, additive

**Current State:**
- ✅ Chart tables `087` / `128` — doctor-scoped, **not** this table's job to ALTER.
- ✅ House pattern `223` / `224` — deny-all RLS, append-only trigger, `IF NOT EXISTS`, in-file reverse.
- ❌ No patient-authored history store.

**Scope Guard:** ≤ 4 files. No ALTER of `patient_*` chart tables or `prescriptions`. No write path (that is hl-03 / hl-05).

**Reference:** product plan HL-DL-1, 6, 10 · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 Batch is `Committed` and HL-Q2/3/5/6 recorded. Else **STOP**.
- [ ] 1.2 Read `087`, `128`, `223`, `224` in order. Confirm next number is unclaimed (head at spec time: **224** → this is **225** if still free).
- [ ] 1.3 Confirm no existing `patient_history_*` table.

### 2. Migration
- [ ] 2.1 One row per `appointment_id` (UNIQUE). FKs: appointment, patient, doctor.
- [ ] 2.2 Columns: `why_today TEXT NOT NULL`, three JSONB lists (allergies / medicines / conditions) with a documented empty-or-none shape, `notice_version TEXT NOT NULL`, `submitted_at`.
- [ ] 2.3 Append-only: UPDATE/DELETE raise; CASCADE from appointment delete allowed (`pg_trigger_depth()` like `224`).
- [ ] 2.4 RLS enabled, **deny-all / service-role only**. Doctor read is the hl-05 endpoint.
- [ ] 2.5 `COMMENT ON` every non-obvious column. State: this is patient-reported evidence, not the chart.
- [ ] 2.6 Reverse in-file. Re-runnable.

### 3. Types + docs
- [ ] 3.1 `database.ts` row + insert type. No update type.
- [ ] 3.2 `DB_SCHEMA.md` + `RLS_POLICIES.md`. No backfill.

### 4. Verification
- [ ] 4.1 Apply on dev twice (operator — same env limit as `vnt-01`).
- [ ] 4.2 UPDATE/DELETE raise. `tsc` + lint clean.

---

## 📁 Files

```
CREATE: backend/migrations/2NN_patient_history_submissions.sql
UPDATE: backend/src/types/database.ts
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md
UPDATE: docs/Reference/engineering/compliance/RLS_POLICIES.md
```

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Do not store a second copy of answers in a "quote" column. The JSONB lists *are* the answers.
- Do not add `auth.uid()` patient policies — patients have no Supabase identity for this product (T3-D3).
- No PHI in comments that could be logged.

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — new PHI table. RLS deny-all.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? **Yes** — CASCADE from appointment; state that in COMMENT. Account-deletion worker is **out of scope**; flag if it will orphan rows.

---

**Last Updated:** 2026-08-31
**Completed:** —
