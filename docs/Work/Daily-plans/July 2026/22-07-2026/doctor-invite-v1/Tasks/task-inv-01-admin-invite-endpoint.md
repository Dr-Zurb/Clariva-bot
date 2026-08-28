# Task inv-01: Admin invite endpoint

> **⚠️ Touches auth (Supabase service-role).** Server-side only.
> **Links:** batch [`../plan-doctor-invite-v1-batch.md`](../plan-doctor-invite-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-invite-v1.md`](./EXECUTION-ORDER-doctor-invite-v1.md)

---

## 📋 Task Overview

An admin-only endpoint that invites a doctor by email via Supabase `inviteUserByEmail`, so they set their own password.

**Status:** ⏳ PENDING. **Change Type:** New backend endpoint (privileged).

**Current State:**
- ✅ Supabase auth; admin role/guard from `doctor-verification-v1` (ver-04) to reuse.
- ✅ `config/env.ts` for the service-role key (never `process.env` directly; never in browser).
- ❌ No invite path.

**Scope Guard:** one admin-guarded endpoint; server-side service-role; email validated.

---

## ✅ Task Breakdown

### 1. Endpoint
- [ ] 1.1 `POST /api/v1/admin/doctors/invite` behind the admin guard (ver-04).
- [ ] 1.2 Zod-validate email; call `inviteUserByEmail` server-side; redirect target = `/dashboard` (or getting-started).
- [ ] 1.3 Handle already-registered / already-invited gracefully (typed errors).

### 2. Verification
- [ ] 2.1 Non-admin → 403; invalid email → 422.
- [ ] 2.2 Manual: invite a test email → link received → password set → normal login.

---

## 🌍 Global Safety Gate

- **Data touched?** Y (creates auth user via invite) → admin-guarded.
- **PHI in logs?** No — do not log the email.
- **External API/AI?** Supabase admin API only.
- **Retention/deletion?** Standard account lifecycle.

## ✅ Acceptance Criteria

- [ ] Admin-only; invite sent; doctor sets own password; service-role stays server-side.

**Created:** 2026-07-22.
