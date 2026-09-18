# Task acon3-02: Doctors directory UI

> **Links:** batch [`../plan-admin-console-v3-batch.md`](../plan-admin-console-v3-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v3.md`](./EXECUTION-ORDER-admin-console-v3.md)

---

## 📋 Task Overview

Build `/admin/doctors` — a table of every doctor with a funnel status badge, plus a "Doctors" link in the admin header. Consumes the ACON3-01 endpoint over the admin session.

**Status:** ✅ DONE (2026-07-22). **Change Type:** New admin page + API client fn + query hook + badge extension. No backend.

**Current State:**
- ✅ ACON3-01 endpoint `GET /api/v1/admin/doctors` (after Wave 1).
- ✅ Admin shell (`app/admin/layout.tsx`), `requireAdminAuth`, React Query patterns, `VerificationStatusBadge` (`components/admin/verifications/statusBadge.tsx`).
- ❌ No doctors directory page / client fn / query hook.

**Scope Guard:** one page + one client fn + one query hook + a status-badge for funnel states + nav link. No row actions here (those are ACON3-03). No backend change.

---

## ✅ Task Breakdown

### 1. API client + query
- [ ] 1.1 `lib/api.ts`: `AdminDoctorFunnelStatus`, `AdminDoctorListItem` types + `listAdminDoctors(token, status?)` (GET with session Bearer; typed result; errors carry `status`).
- [ ] 1.2 `lib/query/keys.ts`: `queryKeys.admin.doctors(status)`.
- [ ] 1.3 `hooks/queries/useAdminDoctorsQuery.ts`: mirror `useAdminVerificationsQuery`.

### 2. Page + table
- [ ] 2.1 `app/admin/doctors/page.tsx` (server: `requireAdminAuth` → pass token) + `components/admin/doctors/DoctorsListClient.tsx`.
- [ ] 2.2 Columns: email, name, practice, funnel status badge, invited/created date. Loading / error / empty states (mirror `VerificationsListClient`).
- [ ] 2.3 Optional funnel-status filter (all / invited / onboarding / pending_review / verified / rejected).

### 3. Status badge
- [ ] 3.1 A `DoctorFunnelBadge` (new small component or extend the pattern) mapping the 5 funnel states → variants (`invited`→secondary, `onboarding`→secondary/info, `pending_review`→warning, `verified`→success, `rejected`→destructive). Do **not** break `VerificationStatusBadge`.

### 4. Admin nav
- [ ] 4.1 Add "Doctors" link to the admin header (`app/admin/layout.tsx`) next to Verifications / Invite.

### 5. Verification
- [ ] 5.1 Directory renders over the admin session (owner dogfood); no email in client logs.
- [ ] 5.2 `npx tsc --noEmit` (ignore the pre-existing stray `useShellLayout.test 2.ts`) + eslint clean on touched files.

---

## 🌍 Global Safety Gate

- **Data touched?** None (renders the ACON3-01 read).
- **PHI/PII in logs?** No — don't `console.log` doctor emails.
- **External API/AI?** No.
- **Retention/deletion?** No.

## ✅ Acceptance Criteria

- [ ] `/admin/doctors` shows the full funnel with accurate badges + a working filter; reachable from the admin header.
- [ ] Reads over the admin JWT; typecheck + lint green on touched files.

**Created:** 2026-07-22.
