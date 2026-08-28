# Task av2-06: Simplify funnel status (drop `invited`/`password_set`)

> **Filename:** `task-av2-06-simplify-funnel-status.md`
> **Links:** batch [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md) · exec [`./EXECUTION-ORDER-auth-v2.md`](./EXECUTION-ORDER-auth-v2.md)

---

## 📋 Task Overview

With invite retired, the admin doctors funnel no longer has an `invited` bucket and no longer depends on `password_set`/`invited_at`. Simplify `deriveFunnelStatus`, drop `invited` from the status enum + badge + list filter, and remove the "Resend" row action. Funnel becomes `onboarding → pending_review → verified | rejected | changes_requested`.

**Program / Batch:** auth-v2 · Wave 5
**Estimated Time:** ~1h
**Status:** ⏳ Not started. **Model: Sonnet.**
**Change Type:** ✅ Type/service/UI simplification + tests (no migration).
**Depends on:** `av2-05` (invite removed).

**Current State:**
- `backend/src/services/admin-doctors-service.ts:51` `deriveFunnelStatus({ verificationStatus, passwordSet, invitedAt })` → returns `invited`/`onboarding`.
- `backend/src/types/admin-doctor.ts:11` `ADMIN_DOCTOR_FUNNEL_STATUSES` includes `'invited'`.
- `frontend/components/admin/doctors/DoctorFunnelBadge.tsx` — `invited` label/variant.
- `frontend/components/admin/doctors/DoctorsListClient.tsx` — `invited` filter + "Resend" row action.
- `backend/tests/unit/services/admin-doctors-service.test.ts` — `deriveFunnelStatus` cases incl. invited.

**Scope Guard:**
- **DO NOT** re-add any invite behavior.
- **DO NOT** touch verification statuses (`pending_review`/`verified`/`rejected`/`changes_requested` stay).
- Keep `listAdminDoctors` shape otherwise (still lists all auth users; still shows `onboarding`).

---

## ✅ Task Breakdown

### 1. Backend service + type
- [ ] 1.1 `deriveFunnelStatus` → signature `({ verificationStatus })`; body: return the verification status when it's one of the 4; else `'onboarding'`. Remove `passwordSet`/`invitedAt` params + `invited` branch.
- [ ] 1.2 `admin-doctors-service.ts#listAdminDoctors` — stop reading `password_set`/`invited_at` for funnel derivation (may keep `invitedAt`/`lastSignInAt` in the row for display if still shown; otherwise drop). Keep `AuthUserRow` minimal.
- [ ] 1.3 `types/admin-doctor.ts` — remove `'invited'` from `ADMIN_DOCTOR_FUNNEL_STATUSES`. Decide whether `AdminDoctorListItem.invitedAt` stays (drop if now unused in UI).

### 2. Frontend
- [ ] 2.1 `DoctorFunnelBadge.tsx` — remove `invited` label/variant.
- [ ] 2.2 `DoctorsListClient.tsx` — remove the `invited` filter chip + the "Resend" row action (its handler/import). Keep the rest of the directory.

### 3. Tests
- [ ] 3.1 `admin-doctors-service.test.ts` — update `deriveFunnelStatus` cases (no invited; unverified/no-row → onboarding; each verification status passes through).

### 4. Verification
- [ ] 4.1 `cd backend && npm run type-check && npm run lint && npm test -- --testPathPattern=admin-doctors` green.
- [ ] 4.2 `cd frontend && npm run lint` + `tsc --noEmit` no new errors in touched files.
- [ ] 4.3 `rg -n "'invited'|\"invited\"|passwordSet|password_set|Resend"` in admin funnel scope → zero.

---

## 📁 Files to Create/Update

```
EDIT: backend/src/services/admin-doctors-service.ts        (deriveFunnelStatus + listAdminDoctors)
EDIT: backend/src/types/admin-doctor.ts                    (drop 'invited'; maybe drop invitedAt)
EDIT: frontend/components/admin/doctors/DoctorFunnelBadge.tsx
EDIT: frontend/components/admin/doctors/DoctorsListClient.tsx
EDIT: backend/tests/unit/services/admin-doctors-service.test.ts
DO NOT TOUCH: verification statuses/console
```

---

## 🧠 Design Constraints

- Funnel = `onboarding → pending_review → verified | rejected | changes_requested`.
- No new PHI; no migration; verification untouched.
- `onboarding` now means "authed (self-serve) but not yet submitted for verification" — update the badge tooltip/copy if it referenced invites.

---

## ✅ Acceptance Criteria

- [ ] `deriveFunnelStatus` depends only on `verificationStatus`; no `invited`/`password_set` anywhere.
- [ ] Enum, badge, filter, and "Resend" action all free of `invited`.
- [ ] Backend + frontend checks green; straggler grep clean.

---

**Created:** 2026-07-23. **Closed:** —
