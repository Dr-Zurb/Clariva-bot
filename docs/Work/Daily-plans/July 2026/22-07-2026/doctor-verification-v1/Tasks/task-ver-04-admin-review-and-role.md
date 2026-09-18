# Task ver-04: Admin role + review (approve/reject)

> **⚠️ OPUS.** Introduces a privileged admin path that does not exist today.
> **Links:** batch [`../plan-doctor-verification-v1-batch.md`](../plan-doctor-verification-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-verification-v1.md`](./EXECUTION-ORDER-doctor-verification-v1.md)

---

## 📋 Task Overview

An admin-only surface to list `pending_review` doctors, view their submitted details + document, and approve/reject with a reason.

**Status:** ⏳ PENDING (Opus). **Change Type:** New admin authz + endpoints + minimal UI.

**Current State:**
- ❌ No roles/admin anywhere; auth middleware only checks a valid token.

**Scope Guard:** admin authz guard + review endpoints + a minimal review UI. Least privilege; service-role never in browser.

---

## ✅ Task Breakdown

### 1. Admin authz
- [ ] 1.1 Define admin role (e.g. Supabase `app_metadata.role='admin'`), checked **server-side** in a guard middleware.
- [ ] 1.2 Deny non-admins with 403; never trust client claims.

### 2. Review endpoints
- [ ] 2.1 `GET /api/v1/admin/verifications?status=pending_review` — list (minimal fields).
- [ ] 2.2 `POST /api/v1/admin/verifications/:doctorId/approve` and `/reject` (reject requires reason); stamp `reviewed_at`/`reviewed_by`.
- [ ] 2.3 Signed-URL fetch of the document for the reviewer only.

### 3. UI
- [ ] 3.1 Minimal `/admin/verifications` review list + detail (behind the admin guard).

### 4. Verification
- [ ] 4.1 Non-admin blocked (401/403) on all admin routes (tested).
- [ ] 4.2 Approve/reject transitions status; audit fields set; no PII in logs.

---

## 🌍 Global Safety Gate

- **Data touched?** Y (verification rows) → RLS + admin guard REQUIRED.
- **PHI in logs?** No.
- **External API/AI?** No.
- **Retention/deletion?** Inherited.

## ✅ Acceptance Criteria

- [ ] Only admins reach review routes; approve/reject works with audit trail.
- [ ] Reviewer can view the doc via short-lived signed URL only.

**Created:** 2026-07-22.
