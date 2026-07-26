# Task acon2-02: Invite-doctor UI

> **Links:** batch [`../plan-admin-console-v2-batch.md`](../plan-admin-console-v2-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v2.md`](./EXECUTION-ORDER-admin-console-v2.md)

---

## 📋 Task Overview

A form at `/admin/doctors/invite` that calls the **existing** invite endpoint over the admin session — replacing the curl/CRON_SECRET path for post-demo invites.

**Status:** ✅ DONE (2026-07-22). **Change Type:** New admin page + one API client fn. No backend.

**Current State:**
- ✅ `POST /api/v1/admin/doctors/invite` — body `{ email, fullName?, practiceName?, specialty? }` → `{ doctorId, prefilled }`; gated by `requireAdminJwtOrSecret` (admin JWT works from the browser).
- ✅ Admin shell + `requireAdminAuth`.
- ❌ No frontend page or client fn; invites are curl-only.

**Scope Guard:** one page + one client fn. No new endpoint, no schema change. Mirror the server Zod rules in the form.

---

## ✅ Task Breakdown

### 1. API client
- [x] 1.1 `lib/api.ts`: `inviteDoctor(token, …)` → POST with session Bearer; typed result; errors carry `status` (409 handled in UI).

### 2. Page + form
- [x] 2.1 `app/admin/doctors/invite/page.tsx` + `InviteDoctorClient`.
- [x] 2.2 Fields: email (required), full name / practice name / specialty (optional). Client validation mirrors server max lengths.
- [x] 2.3 Success + reset; 409 → "This email is already registered."; no email in logs.

### 3. Admin nav
- [x] 3.1 "Invite" link in admin header next to "Verifications".

### 4. Verification
- [x] 4.1 Wired over admin session (owner dogfood invite).
- [x] 4.2 409 + invalid email handled in UI.
- [x] 4.3 Eslint clean on touched files.

---

## 🌍 Global Safety Gate

- **Data touched?** Sends an invite (Supabase `inviteUserByEmail`) via the existing service. No schema change.
- **PHI in logs?** No — never log the invitee email.
- **External API/AI?** Supabase auth invite (existing).
- **Retention/deletion?** No.

## ✅ Acceptance Criteria

- [ ] Admin invites a doctor from the browser end-to-end; clear success + already-registered handling.
- [ ] No secret/service-role in the browser; reuses the existing endpoint.

**Created:** 2026-07-22.
