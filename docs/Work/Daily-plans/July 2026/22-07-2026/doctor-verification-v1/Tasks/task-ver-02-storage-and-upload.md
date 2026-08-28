# Task ver-02: Storage bucket + secure document upload

> **⚠️ OPUS.** Sensitive-doc storage + RLS.
> **Links:** batch [`../plan-doctor-verification-v1-batch.md`](../plan-doctor-verification-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-verification-v1.md`](./EXECUTION-ORDER-doctor-verification-v1.md)

---

## 📋 Task Overview

A **private** Supabase Storage bucket for the registration certificate (+ optional ID), with upload from the doctor and read restricted to owner + admin.

**Status:** ⏳ PENDING (Opus). **Change Type:** New storage + backend upload path.

**Scope Guard:** bucket + policies + a scoped upload/download path; no public URLs.

---

## ✅ Task Breakdown

### 1. Bucket + policies
- [ ] 1.1 Create a **private** bucket (e.g. `doctor-verification-docs`); path convention `{doctor_id}/...`.
- [ ] 1.2 Storage RLS: owner can write/read own prefix; admin can read all; no anon.

### 2. Upload/download
- [ ] 2.1 Backend-issued signed upload or authenticated upload (never expose service-role in browser).
- [ ] 2.2 Store returned object path on the `doctor_verification` row (ver-01), not the file itself.
- [ ] 2.3 Downloads only via short-lived signed URLs to owner/admin.

### 3. Validation
- [ ] 3.1 Restrict file types (pdf/jpg/png) + max size; reject others.
- [ ] 3.2 Never log file names/paths that reveal identity.

### 4. Verification
- [ ] 4.1 Owner upload + read works; other doctor denied; anon denied.
- [ ] 4.2 Signed URLs expire; no persistent public link exists.

---

## 🌍 Global Safety Gate

- **Data touched?** Y (storage objects) → RLS/policies REQUIRED.
- **PHI in logs?** No.
- **External API/AI?** No.
- **Retention/deletion?** Y — delete docs on account deletion / rejection per retention policy.

## ✅ Acceptance Criteria

- [ ] Private bucket + RLS; owner/admin read only; type/size validated.
- [ ] Object path recorded on the verification row; no public URLs.

**Created:** 2026-07-22.
