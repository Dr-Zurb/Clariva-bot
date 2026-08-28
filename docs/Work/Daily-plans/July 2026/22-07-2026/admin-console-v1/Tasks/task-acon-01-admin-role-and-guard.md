# Task acon-01: Admin role + requireAdmin guard

> **⚠️ OPUS.** Privileged auth path. Read `middleware/auth.ts` + `utils/supabase-token-verifier.ts` + `middleware/require-admin-secret.ts` first.
> **Links:** batch [`../plan-admin-console-v1-batch.md`](../plan-admin-console-v1-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v1.md`](./EXECUTION-ORDER-admin-console-v1.md)

---

## 📋 Task Overview

Introduce an **admin role** (Supabase `app_metadata.role='admin'`) and a backend **`requireAdmin`** guard, then let the existing verification review endpoints authenticate via **admin-JWT (browser) OR `CRON_SECRET` (ops)**.

**Status:** ✅ DONE (2026-07-22). **Change Type:** New auth middleware + endpoint wiring. No migration.

**Current State:**
- ✅ `authenticateToken` verifies the Supabase token and sets `req.user`.
- ✅ `supabase-token-verifier.ts` reconstructs `app_metadata` + `role` onto the user (so the flag is readable from the JWT).
- ✅ `requireAdminSecret` (CRON_SECRET) already gates `/admin/verifications/*` + `/admin/doctors/*`.
- ✅ Verification service: list / detail(+signed URLs) / approve / reject.
- ❌ No role concept in application code; no browser-reachable admin auth.

**Scope Guard:** the guard + endpoint wiring + reviewer-id stamping. No new migration, no UI (that's acon-02), no go-live gate.

---

## ✅ Task Breakdown

### 1. Admin flag mechanism
- [x] 1.1 Admin = `app_metadata.role = 'admin'`, set server-side (Supabase admin API / SQL). Exact command → runbook in acon-03.
- [x] 1.2 Confirmed the token verifier reconstructs `app_metadata` + `role` onto `req.user` (`utils/supabase-token-verifier.ts`). A token minted before the flag needs a re-login — noted for the runbook.

### 2. requireAdmin guard
- [x] 2.1 New `middleware/require-admin.ts` → `requireAdmin`: runs after `authenticateToken`; passes iff `req.user?.app_metadata?.role === 'admin'`; else `ForbiddenError` (403). Role read only from the verified JWT.
- [x] 2.2 `requireAdminJwtOrSecret` combinator: valid `CRON_SECRET` (checked first, via shared `matchesAdminSecret`) → ops path; else runs `authenticateToken` then the admin check. Credential checks isolated.

### 3. Wire endpoints + reviewer id
- [x] 3.1 Combined guard applied to `/admin/verifications/*` and `/admin/doctors/*` (replaced `requireAdminSecret`).
- [x] 3.2 `req.adminActor` (admin `user.id` on JWT path, `'ops'` on secret path) stamped as `reviewedBy` in approve/reject; body `reviewedBy` kept as legacy fallback. New `adminActor` field on the Express Request type.

### 4. Tests + verification
- [x] 4.1 Unit (`tests/unit/middleware/require-admin.test.ts`): non-admin JWT → 403; admin JWT → pass; CRON_SECRET (Bearer + header) → pass; none → 401; body role ignored; secret-unset falls through to JWT.
- [x] 4.2 `adminActor` stamped from JWT (`admin-1`) and `'ops'` from secret — asserted.
- [x] 4.3 No token/secret/role internals logged (guard logs nothing). Typecheck + lint (src) + tests green.

---

## 🌍 Global Safety Gate

- **Data touched?** Reads verification rows via service-role (unchanged); no schema change.
- **PHI in logs?** No — never log tokens, emails, registration numbers.
- **External API/AI?** Supabase admin API only (to set the flag, out of band).
- **Retention/deletion?** None.

## ✅ Acceptance Criteria

- [ ] Admin-JWT and CRON_SECRET both reach review endpoints; everyone else is 401/403.
- [ ] `reviewed_by` records the admin's id from the console path.
- [ ] Guard reads the role only from the verified JWT; no client-trust; tests green.

**Created:** 2026-07-22.
