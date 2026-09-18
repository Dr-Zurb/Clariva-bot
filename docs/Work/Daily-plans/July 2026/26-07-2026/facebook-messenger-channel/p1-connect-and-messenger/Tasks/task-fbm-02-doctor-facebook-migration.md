# Task fbm-02: Migration — `doctor_facebook` (+ RLS)

> **Links:** batch [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md) · exec [`./EXECUTION-ORDER-p1-facebook-connect-messenger.md`](./EXECUTION-ORDER-p1-facebook-connect-messenger.md)

---

## 📋 Task Overview

Additive migration for per-doctor Facebook Page connection storage, separate from `doctor_instagram` IG-login rows.

**Program / Phase:** facebook-messenger-channel · p1 · Wave 1  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ DONE (code 2026-07-26) — **apply `187_doctor_facebook.sql` in Supabase before fbm-03**  
**Change Type:** Migration  
**Model:** Executed on request (normally Opus)  
**Depends on:** FBM-D3

---

## ✅ Task Breakdown

### 1. Schema
- [x] 1.1 Table `doctor_facebook`: `doctor_id` PK/FK, `facebook_page_id` unique, `page_access_token`, `page_name`, `facebook_user_id` nullable, health/expiry columns.
- [x] 1.2 RLS: doctor CRUD own row + service-role SELECT (parity with 011).
- [x] 1.3 Indexes: `facebook_page_id`, partial `facebook_user_id`.

### 2. Types + tests
- [x] 2.1 `database.ts` types (`DoctorFacebook`, Insert/Update).
- [x] 2.2 Migration unit test `187-doctor-facebook-migration.test.ts`.
- [ ] 2.3 **Founder:** run SQL in Supabase SQL editor (or migration runner) on the project used by local `.env`.

---

## 📁 Files

```
CREATE: backend/migrations/187_doctor_facebook.sql   (number = next free at implement time)
UPDATE: backend/src/types/database.ts
CREATE: backend/tests/unit/migrations/187-…-migration.test.ts
DO NOT TOUCH: doctor_instagram IG Login columns meaning
```

---

## ✅ Acceptance Criteria

- [ ] Migration applies clean on empty + existing DBs.
- [ ] One Page per doctor constraint (or documented multi-row policy if OQ-2 changes).
- [ ] No PHI in migration comments beyond necessary.

---

**Created:** 2026-07-26.
