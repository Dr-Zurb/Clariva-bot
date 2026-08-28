# Task acon3-01: Doctors directory endpoint

> **Links:** batch [`../plan-admin-console-v3-batch.md`](../plan-admin-console-v3-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v3.md`](./EXECUTION-ORDER-admin-console-v3.md)

---

## 📋 Task Overview

Add `GET /api/v1/admin/doctors` — a read-only, admin-gated endpoint that returns **every** doctor with a derived funnel status, by aggregating the `auth.users` spine with `doctor_settings` + `doctor_verification`.

**Status:** ✅ DONE (2026-07-22). **Weight: Opus.** **Change Type:** New backend read endpoint (service + controller + route + types + tests). **No migration.**

**Current State:**
- ✅ `requireAdminJwtOrSecret` gates `/api/v1/admin/*` (admin JWT or CRON_SECRET); `req.adminActor` set.
- ✅ `doctor-invite-service.ts` shows the `listUsers` pagination pattern (`findAuthUserByEmail`) and reads `invited_at` + `user_metadata.password_set`.
- ✅ `doctor_verification.status` ∈ `unverified | pending_review | verified | rejected` (`types/doctor-verification.ts`); `doctor_settings` holds `practice_name` / `specialty`.
- ❌ No endpoint returns "all doctors + status". `listVerifications` reads only `doctor_verification` (no email; misses invited-only users).

**Scope Guard:** one read endpoint + its service/controller/route/types/tests. No migration, no write path, no change to invite/verification logic. Never log email/PII.

---

## ✅ Task Breakdown

### 1. Types
- [ ] 1.1 Add `AdminDoctorFunnelStatus = 'invited' | 'onboarding' | 'pending_review' | 'verified' | 'rejected'`.
- [ ] 1.2 Add `AdminDoctorListItem { doctorId; email; fullName: string | null; practiceName: string | null; specialty: string | null; funnelStatus; verificationStatus: VerificationStatus | null; invitedAt: string | null; lastSignInAt: string | null; createdAt: string | null }`.

### 2. Service — `listAdminDoctors(correlationId)`
- [ ] 2.1 Page through `admin.auth.admin.listUsers({ page, perPage: 200 })` (bounded loop like `findAuthUserByEmail`); collect `{ id, email, invited_at, last_sign_in_at, created_at, user_metadata }`.
- [ ] 2.2 Batch-fetch `doctor_settings` (`doctor_id, practice_name, specialty`) and `doctor_verification` (`doctor_id, status`) for the collected ids; index by `doctor_id`.
- [ ] 2.3 Derive `funnelStatus` per **ACON3-D2**: if verification row status ∈ {pending_review, verified, rejected} → that; else if `user_metadata.password_set === true` → `onboarding`; else if `invited_at` (no password) → `invited`; else → `onboarding` (self-signup, not yet submitted).
- [ ] 2.4 Sort newest-first by `created_at`. Return `AdminDoctorListItem[]`.
- [ ] 2.5 **PII:** log only `{ correlationId, count }` (+ `event`). Never log email / full_name.

### 3. Controller + route
- [ ] 3.1 `admin-doctors-controller.ts` (or extend existing): `listDoctorsHandler` (validate optional `?status` filter with Zod against the funnel enum; orchestrate → service → `successResponse({ items })`).
- [ ] 3.2 Wire `router.get('/', listDoctorsHandler)` in `routes/api/v1/admin-doctors.ts` (already behind `requireAdminJwtOrSecret`).

### 4. Tests (`tests/unit/services/…` + controller)
- [ ] 4.1 Service: mixed `listUsers` fixtures → correct `funnelStatus` for each bucket (invited-no-password, password-set-no-verification, pending_review, verified, rejected).
- [ ] 4.2 Service: doctor with a `doctor_verification` row but no `doctor_settings` still returns (LEFT join semantics).
- [ ] 4.3 Controller: invalid `?status` → 400; admin client missing → InternalError.

### 5. Verification
- [ ] 5.1 `npx tsc --noEmit` + eslint clean on `src` files.
- [ ] 5.2 Unit tests green.

---

## 🌍 Global Safety Gate

- **Data touched?** Reads `auth.users` (admin API) + `doctor_settings` + `doctor_verification`. No writes. No migration.
- **PHI/PII in logs?** No — email/full_name never logged; logs carry `doctorId`/`count`/`correlationId` only. Email is returned in the response to the authenticated admin (necessary).
- **RLS / auth.uid()?** N/A — service-role read behind `requireAdminJwtOrSecret`; service-role stays server-side.
- **External API/AI?** Supabase admin `listUsers` (existing pattern).
- **Retention/deletion?** No.

## ✅ Acceptance Criteria

- [ ] Endpoint returns every doctor including invited-but-never-finished accounts, each with a correct `funnelStatus`.
- [ ] Gated by `requireAdminJwtOrSecret`; no service-role/secret leaves the server; no PII in logs.
- [ ] Typecheck + lint + unit tests green.

**Created:** 2026-07-22.
