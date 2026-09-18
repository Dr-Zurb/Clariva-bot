# Task acon3-03: Row actions — resend + view verification

> **Links:** batch [`../plan-admin-console-v3-batch.md`](../plan-admin-console-v3-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v3.md`](./EXECUTION-ORDER-admin-console-v3.md)

---

## 📋 Task Overview

Add per-row actions to the directory: **Resend invite** (for `invited` doctors, reusing the existing endpoint) and **View verification** (deep-link to the existing detail page for submitted doctors). Also fix the now-stale invite-form copy that says "localhost".

**Status:** ✅ DONE (2026-07-22). **Change Type:** Frontend row actions reusing existing endpoints + one copy fix. No backend.

**Current State:**
- ✅ `inviteDoctor(token, { email, resend: true })` deletes an unfinished stub and re-invites (`doctor-invite-service.ts`); `InviteDoctorClient` already handles it from the invite form.
- ✅ `/admin/verifications/[doctorId]` detail page exists.
- ✅ ACON3-02 directory table (after Wave 2).
- ❌ No actions on directory rows; invite-form helper still says "Open the new email on this computer (localhost)".

**Scope Guard:** wire two actions that reuse existing endpoints/pages + one copy line. No new backend, no revoke/pause (v4).

---

## ✅ Task Breakdown

### 1. Resend invite (row)
- [ ] 1.1 For rows with `funnelStatus === 'invited'`, a "Resend invite" button calls `inviteDoctor(token, { email, resend: true })`.
- [ ] 1.2 Success/error toast or inline message; on success, invalidate the doctors query so the row refreshes. Reuse the 409 handling pattern from `InviteDoctorClient`.
- [ ] 1.3 Never log the email.

### 2. View verification (row)
- [ ] 2.1 For rows whose `verificationStatus` is non-null (a `doctor_verification` row exists), a "View" link → `/admin/verifications/{doctorId}`.
- [ ] 2.2 For `invited` / `onboarding` (no verification yet), no link (or disabled with a hint).

### 3. Copy fix
- [ ] 3.1 `components/admin/doctors/InviteDoctorClient.tsx`: replace "Open the new email on this computer (localhost)." with device-agnostic copy (invites redirect to the public app base, not localhost).

### 4. Verification
- [ ] 4.1 Resend from a row re-invites end-to-end; View deep-links correctly (owner dogfood).
- [ ] 4.2 `npx tsc --noEmit` + eslint clean on touched files.

---

## 🌍 Global Safety Gate

- **Data touched?** Resend re-invites via the existing service (deletes an unfinished stub + re-sends). No schema change.
- **PHI/PII in logs?** No — never log the invitee email.
- **External API/AI?** Supabase auth invite (existing).
- **Retention/deletion?** Resend deletes an *unfinished invite stub* only (guarded server-side by `password_set` + `invited_at`); no doctor data deleted.

## ✅ Acceptance Criteria

- [ ] Resend invite works from an `invited` row; View verification deep-links for submitted doctors.
- [ ] Stale "localhost" invite copy removed; typecheck + lint green.

**Created:** 2026-07-22.
