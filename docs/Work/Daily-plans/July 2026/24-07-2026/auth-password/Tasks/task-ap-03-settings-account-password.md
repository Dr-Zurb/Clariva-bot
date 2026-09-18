# Task ap-03: Settings → Account — set/change password (re-auth)

> **Filename:** `task-ap-03-settings-account-password.md`
> **Links:** batch [`../plan-auth-password-batch.md`](../plan-auth-password-batch.md) · exec [`./EXECUTION-ORDER-auth-password.md`](./EXECUTION-ORDER-auth-password.md)

---

## 📋 Task Overview

Add an **Account** area to Settings where a doctor can **set** a password (Google/OTP-only users) or
**change** an existing one. Password change is gated by **re-authentication** (AP-D6): verify the
current password before updating, so a hijacked/left-open session can't silently change it.

**Program / Batch:** auth-password · Wave 3
**Estimated Time:** ~1.5h
**Status:** ⏳ Not started. **Model: Opus** (password-change security).
**Change Type:** ✅ Frontend UI + auth call (no backend, no migration).
**Depends on:** `ap-01` (password helpers).

**Current State:**
- ✅ `frontend/app/dashboard/settings/page.tsx` — landing with cards → sub-routes (`PracticeSetupCard`).
- ✅ Sub-routes live under `app/dashboard/settings/**`.
- ❌ No account/security area.

**Scope Guard:**
- **DO NOT** add `resetPasswordForEmail` (AP-D4). Recovery when logged-out is the login "use a code" path.
- **DO NOT** change the practice-setup / integrations cards beyond adding one new card.
- Session is already established (doctor is authed to reach settings).

---

## ✅ Task Breakdown

### 1. Account card + route
- [ ] 1.1 Add an **Account** card to `settings/page.tsx` (icon, label "Account", desc "Password and sign-in") → `/dashboard/settings/account`.
- [ ] 1.2 Create `app/dashboard/settings/account/page.tsx` hosting `PasswordPanel`.

### 2. `PasswordPanel` component
- [ ] 2.1 Detect whether the user already has a password identity (e.g. inspect `user.identities` / an `email` identity, or a "has password" hint) to choose **Set** vs **Change** copy.
- [ ] 2.2 **Change** flow (has password): fields = current password + new password (+ show/hide). On submit:
  - verify current via `signInWithPassword(email, current)`; on failure → "Current password is incorrect."
  - then `supabase.auth.updateUser({ password: next })`; success toast.
- [ ] 2.3 **Set** flow (Google/OTP-only, no password): field = new password only; the live session is the proof (AP-D6) → `updateUser({ password: next })`.
- [ ] 2.4 Enforce min length (OQ-1) client-side; map `updateUser` errors via `authErrorMessage` (weak/leaked).

### 3. Accessibility + states
- [ ] 3.1 Labelled fields; `role="alert"` errors; loading text; success confirmation; no password echoed to logs.

### 4. Tests
- [ ] 4.1 `PasswordPanel`: change path verifies current then updates; wrong current → error, no update; set path (no password) updates directly; weak/leaked → mapped copy.

### 5. Verification
- [ ] 5.1 `npm run lint` + `tsc --noEmit` clean for the slice; manual: set (as a Google user) + change (as a password user).

---

## 📁 Files to Create/Update

```
CREATE: frontend/app/dashboard/settings/account/page.tsx
CREATE: frontend/components/settings/PasswordPanel.tsx
CREATE: frontend/components/settings/__tests__/PasswordPanel.test.tsx
UPDATE: frontend/app/dashboard/settings/page.tsx        (+ Account card)
READ:   frontend/lib/auth/methods.ts (ap-01) ; frontend/lib/supabase/client.ts ; components/settings/PracticeSetupCard.tsx
DO NOT TOUCH: backend ; other settings sub-pages ; middleware
```

---

## 🧠 Design Constraints

- **Re-auth before change** is load-bearing (AP-D6) — do not skip verifying the current password.
- No emailed reset anywhere (AP-D4). Logged-out recovery = the login "use a code" path.
- Match existing settings card/panel styling.

---

## ✅ Acceptance Criteria

- [ ] Settings shows an **Account** card → `/dashboard/settings/account`.
- [ ] Password user: change requires correct current password; wrong current → error, no change.
- [ ] Google/OTP-only user: can set a password (no current required).
- [ ] Weak/leaked password → friendly copy; success confirmed; tests green; lint/tsc clean for the slice.

---

**Created:** 2026-07-24. **Closed:** —
