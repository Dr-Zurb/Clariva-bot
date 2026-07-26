# Task ver-03: Doctor "get verified" submit flow

> **Links:** batch [`../plan-doctor-verification-v1-batch.md`](../plan-doctor-verification-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-verification-v1.md`](./EXECUTION-ORDER-doctor-verification-v1.md)

---

## 📋 Task Overview

A post-signup surface where a doctor submits registration details + uploads their certificate, moving status `unverified → pending_review`. Also shows current status (pending / verified / rejected + reason).

**Status:** ⏳ PENDING. **Change Type:** New backend submit endpoint + frontend page.

**Scope Guard:** one submit endpoint (Zod-validated) + one page; consumes ver-01/02.

---

## ✅ Task Breakdown

### 1. Backend
- [ ] 1.1 `POST /api/v1/verification/submit` — `asyncHandler`, `req.user.id`, Zod-validate registration number/state/specialty; attach uploaded doc path (ver-02).
- [ ] 1.2 Set status `pending_review`, `submitted_at`; idempotent re-submit after rejection.
- [ ] 1.3 `GET /api/v1/verification/status` — return the doctor's own status + reason (no other data).

### 2. Frontend
- [ ] 2.1 `/dashboard/get-verified` page: form + upload + live status banner.
- [ ] 2.2 Surface status prominently where it blocks go-live (link from onboarding checklist + IG connect screen).

### 3. Verification
- [ ] 3.1 Slice lint/type-check + backend tests (validation, status transition, own-data-only).
- [ ] 3.2 Manual: submit → pending; simulate approve/reject (ver-04) → status reflects.

---

## 🌍 Global Safety Gate

- **Data touched?** Y (verification row + storage) → RLS via ver-01/02.
- **PHI in logs?** No — never log registration number/name/doc.
- **External API/AI?** No.
- **Retention/deletion?** Inherited from ver-01/02.

## ✅ Acceptance Criteria

- [ ] Doctor submits details + doc → `pending_review`; can view own status/reason.
- [ ] Endpoints doctor-scoped + Zod-validated; no cross-doctor leak.

**Created:** 2026-07-22.
