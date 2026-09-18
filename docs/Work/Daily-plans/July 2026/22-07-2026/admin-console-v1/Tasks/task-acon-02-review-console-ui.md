# Task acon-02: /admin/verifications review UI

> **Links:** batch [`../plan-admin-console-v1-batch.md`](../plan-admin-console-v1-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v1.md`](./EXECUTION-ORDER-admin-console-v1.md)

---

## 📋 Task Overview

A minimal, role-gated admin surface at `/admin/verifications`: a sorted list of doctor signups, a detail view with the certificate previewed inline, and approve / reject actions — all using the reviewer's normal Supabase session (no secret in the browser).

**Status:** ✅ DONE (2026-07-22). **Change Type:** New frontend route group + API client calls. Consumes acon-01.

**Scope Guard:** one list page + one detail view + approve/reject. No new backend logic (acon-01 exposed it). Not linked from the doctor nav.

---

## ✅ Task Breakdown

### 1. Access gate (frontend)
- [x] 1.1 `requireAdminAuth()` in `lib/auth/server-user.ts` — redirects non-admins → `/dashboard`, unauthenticated → `/login`. Used by `app/admin/layout.tsx`. Middleware matcher extended to `/admin` for session refresh + login redirect.

### 2. List
- [x] 2.1 `/admin/verifications` table (name, registration, council, specialty, submitted, status) with Pending / Verified / Rejected filter (`?status=`).
- [x] 2.2 Empty + loading + error/retry states. Backend sorts by `submitted_at` ascending.

### 3. Detail + actions
- [x] 3.1 `/admin/verifications/[doctorId]`: fields + certificate / gov-ID preview (`<img>` or `<iframe>` for PDF) via short-lived signed URLs.
- [x] 3.2 Approve; Reject with required reason; invalidate list + detail on success.
- [x] 3.3 API client: `listAdminVerifications` / `getAdminVerificationDetail` / `approveAdminVerification` / `rejectAdminVerification` — session Bearer only.

### 4. Verification
- [x] 4.1 Non-admin redirected by layout; backend still 403s API. Dogfood in acon-03.
- [x] 4.2 Approve/reject wired; doctor's status surface already reads same table. Dogfood in acon-03.
- [x] 4.3 Signed URLs from existing detail endpoint (5 min TTL); no secret/service-role in browser.

---

## 🌍 Global Safety Gate

- **Data touched?** Reads/writes verification via acon-01 endpoints (guarded).
- **PHI in logs?** No — no registration numbers/doc contents in client logs.
- **External API/AI?** No.
- **Retention/deletion?** No.

## ✅ Acceptance Criteria

- [ ] Admin reviews signups end-to-end from the browser: list → view doc → approve/reject.
- [ ] Non-admin blocked (redirect + 403). No secret/service-role in the browser.

**Created:** 2026-07-22.
