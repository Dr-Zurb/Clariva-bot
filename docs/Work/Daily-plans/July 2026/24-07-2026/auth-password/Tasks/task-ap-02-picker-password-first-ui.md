# Task ap-02: Password-first picker UI + code fallback

> **Filename:** `task-ap-02-picker-password-first-ui.md`
> **Links:** batch [`../plan-auth-password-batch.md`](../plan-auth-password-batch.md) · exec [`./EXECUTION-ORDER-auth-password.md`](./EXECUTION-ORDER-auth-password.md)
> **✅ Landed — reworked by [`ap-05`](./task-ap-05-signup-otp-verify-and-login-gate.md)** (rev 2026-07-24). The password-first layout stays; two things below are **superseded**: (a) §2.2 keep code link on `/signup` → **removed** (signup's code *is* the OTP-verify step, AP-D9); (b) login "use a code" now runs with `shouldCreateUser:false` → "No account found" (AP-D10). Read `ap-05` for the current signup/login behavior.

---

## 📋 Task Overview

Make the email path **password-first** on `/login` and `/signup`: email + password are the main
inputs (rendered inline under the Google button), with **"Use a code instead"** as the secondary
link that drops into the existing 6-digit OTP step (passwordless + forgot-password). Google is
unchanged.

**Program / Batch:** auth-password · Wave 2
**Estimated Time:** ~2h
**Status:** ⏳ Not started. **Model: Sonnet.**
**Change Type:** ✅ Frontend UI (no backend, no migration).
**Depends on:** `ap-01` (password helpers), `ap-04a` (console config for live testing).

**Current State:**
- ✅ `frontend/components/auth/AuthMethodPicker.tsx` — steps `methods → email → otp`; Google + "Continue with Email" (code); `mode` drives copy.
- ✅ `frontend/app/(auth)/{login,signup}/page.tsx` render the picker via `AuthShell`.

**Scope Guard:**
- **DO NOT** add `resetPasswordForEmail` / reset-link (AP-D4).
- **DO NOT** change the OTP step internals (reuse `sendEmailOtp` / `verifyEmailOtp` as-is).
- **DO NOT** collect profile fields (name/practice) — those stay on `/complete-profile`.
- Keep Google one-tap + `AuthShell` chrome.

---

## ✅ Task Breakdown

### 1. Password-first main screen
- [ ] 1.1 Restructure the `methods` step: Google button on top, divider, then **email + password** fields inline (show/hide toggle on password).
- [ ] 1.2 Primary button by `mode`:
  - signin → **"Sign in"** → `signInWithPassword(email, password)` → `routeAfterAuth(router, user)`.
  - signup → **"Create account"** → `signUpWithPassword(email, password)` → `routeAfterAuth`.
- [ ] 1.3 Client guards: email format, password present; signup enforces min length (OQ-1) before calling.

### 2. "Use a code instead" fallback (AP-D3 / AP-D5)
- [ ] 2.1 Persistent link under the primary button: **"Use a code instead"** → `sendEmailOtp(email)` → advance to the existing `otp` step. On `/login`, label it so it also reads as forgot-password (e.g. "Forgot password? Use a code").
- [ ] 2.2 Keep the link on `/signup` too (AP-D5 — never trap a user).
- [ ] 2.3 The `otp` step + resend/change-email stay exactly as today.

### 3. Error + edge cases
- [ ] 3.1 Surface `authErrorMessage` output in the existing `role="alert"` region.
- [ ] 3.2 Google/OTP-only account tries a password it never set → "invalid credentials" copy nudges to the code link.
- [ ] 3.3 Signup with existing email → "account exists, sign in" copy.

### 4. Accessibility + states
- [ ] 4.1 Labels + `aria-describedby` on both fields; show/hide toggle is a labelled button; loading text on submit; focus moves to OTP field on step change (unchanged).

### 5. Copy
- [ ] 5.1 Titles honest per `mode` (signin: "Sign in" / signup: "Create your Halo Aid account"); keep footers (`/login` ↔ `/signup`, demo link).

### 6. Tests
- [ ] 6.1 Update `AuthMethodPicker.test.tsx`: password submit (both modes) calls the right helper + routes; "use a code instead" → OTP step still works; Google unchanged; error copy renders.

### 7. Verification
- [ ] 7.1 `npm run lint` + `tsc --noEmit` clean for the slice; manual light/dark; full round-trips (password login, password signup, code fallback).

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/auth/AuthMethodPicker.tsx
UPDATE: frontend/components/auth/__tests__/AuthMethodPicker.test.tsx
READ:   frontend/lib/auth/methods.ts (ap-01) ; frontend/lib/auth/route-after-auth.ts ; AuthShell.tsx
UPDATE (copy only, if needed): frontend/app/(auth)/{login,signup}/page.tsx
DO NOT TOUCH: backend ; complete-profile ; middleware ; callback route
```

---

## 🧠 Design Constraints

- **Password-first, not password-only** — the code link is always present (fallback + recovery).
- Reuse the OTP step verbatim; this task only changes the *entry* screen.
- Themed to Halo Aid tokens; match existing card styling.

---

## ✅ Acceptance Criteria

- [ ] `/login`: email + password signs in; wrong password → friendly error; "use a code instead" → OTP login.
- [ ] `/signup`: email + password creates account → `/complete-profile`; existing email → sign-in copy; code escape works.
- [ ] Google one-tap unchanged; a11y + light/dark clean; component tests green; lint/tsc clean for the slice.

---

**Created:** 2026-07-24. **Closed:** —
