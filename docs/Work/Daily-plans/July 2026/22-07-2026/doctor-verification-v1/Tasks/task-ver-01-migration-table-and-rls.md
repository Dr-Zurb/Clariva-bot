# Task ver-01: Migration — doctor_verification table + RLS

> **⚠️ OPUS.** New migration + RLS. Read ALL prior migrations first.
> **Links:** batch [`../plan-doctor-verification-v1-batch.md`](../plan-doctor-verification-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-verification-v1.md`](./EXECUTION-ORDER-doctor-verification-v1.md)

---

## 📋 Task Overview

Create a `doctor_verification` record keyed to `auth.users(id)` holding status + registration details + document references, with RLS.

**Status:** ⏳ PENDING (Opus). **Change Type:** New migration + schema.

**Current State:**
- ✅ Every domain table FKs `doctor_id → auth.users(id)`; RLS pattern in `002_rls_policies.sql`.
- ✅ Latest migration is `182_*`; new file continues the numeric sequence.
- ❌ No verification table/columns anywhere.

**Scope Guard:** one migration file + its unit test; no app code in this task.

---

## ✅ Task Breakdown

### 1. Pre-work (MANDATORY for migrations)
- [ ] 1.1 Read all prior migrations in order (schema, naming, RLS, triggers) — `MIGRATIONS_AND_CHANGE.md`.
- [ ] 1.2 Confirm next migration number + file naming convention.

### 2. Table
- [ ] 2.1 `doctor_verification`: `doctor_id` (PK/FK → `auth.users(id)` ON DELETE CASCADE), `status` (CHECK: unverified|pending_review|verified|rejected), `registration_number`, `council_state`, `specialty`, `submitted_at`, `reviewed_at`, `reviewed_by`, `reject_reason`, timestamps.
- [ ] 2.2 Document references stored as storage paths/keys (not blobs); actual files in the bucket (ver-02).
- [ ] 2.3 Sensible defaults (`status='unverified'`); audit-friendly (updated_at trigger if project uses one).

### 3. RLS
- [ ] 3.1 Doctor can read/insert/update **their own** row only (`auth.uid() = doctor_id`).
- [ ] 3.2 Admin (role check) can read/update all rows.
- [ ] 3.3 No public/anon access.

### 4. Tests + verification
- [ ] 4.1 Migration unit test (mirror `tests/unit/migrations/182-*`): columns, constraints, RLS presence.
- [ ] 4.2 Cross-doctor read denied; non-admin cannot update others.

---

## 🌍 Global Safety Gate

- **Data touched?** Y (new table) → **RLS verified?** REQUIRED.
- **PHI in logs?** No — never log registration numbers/names.
- **External API/AI?** No.
- **Retention/deletion?** Y — cascade on user delete; align with `DATA_RETENTION.md` + account-deletion scrub.

## ✅ Acceptance Criteria

- [ ] Table + constraints + RLS created; migration test green.
- [ ] Cross-doctor and non-admin access denied in tests.
- [ ] Prior migrations read + numbering correct.

**Created:** 2026-07-22.
