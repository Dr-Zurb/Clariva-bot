# Task ap-05: OTP-verify email signup + login "no account" gate (rev)

> **Filename:** `task-ap-05-signup-otp-verify-and-login-gate.md`
> **Links:** batch [`../plan-auth-password-batch.md`](../plan-auth-password-batch.md) · exec [`./EXECUTION-ORDER-auth-password.md`](./EXECUTION-ORDER-auth-password.md)

---

## 📋 Task Overview

Revision of the email path shipped in `ap-01`/`ap-02`. Two decisions landed **after** those tasks:

- **AP-D9** — email + password **signup must OTP-verify the email** before the account is usable.
  The email/password signup path is the *only* one that proves nothing about email ownership, and
  our recovery **is** Email OTP — so a typo'd/unowned email = permanent lockout + dead
  notifications. Replace `signUpWithPassword` (email path) with: send 6-digit code → `verifyOtp`
  (email confirmed + session) → `updateUser({ password })` → `/complete-profile`. **No
  confirm-password field** (show/hide + OTP recovery cover typos). Google signup unchanged.
- **AP-D10** — **sign-in refuses unknown accounts** (conventional). `signInWithPassword` already
  rejects (generic anti-enumeration error). Login's **"Use a code instead"** must switch to
  `shouldCreateUser: false` → unknown email surfaces **"No account found — create one."** Google
  stays create-on-first-auth (documented exception).

Net: signup and sign-in behave *differently* again (signup creates + verifies; sign-in gates). The
standalone "use a code instead" link is now **login-only** (on signup, the code *is* the verify step).

**Program / Batch:** auth-password · Wave 5 (revision)
**Estimated Time:** ~2h
**Status:** ✅ Code landed. **Model: Opus** (auth boundary — create/verify + enumeration semantics).
**Change Type:** ✅ Frontend only (no backend, no migration).
**Depends on:** `ap-01` (helpers, landed), `ap-02` (picker, landed), `ap-04a` (console: Confirm-email OFF, OTP `{{ .Token }}` 6-digit — required for live test).

**Current State (post `ap-01`/`ap-02`):**
- ✅ `frontend/lib/auth/methods.ts` — `signInWithPassword`, `signUpWithPassword`, `updatePassword`, `sendEmailOtp`, `verifyEmailOtp`, `authErrorMessage`, `isOAuthOnlyUser`.
- ✅ `frontend/components/auth/AuthMethodPicker.tsx` — password-first main screen; `handlePasswordSubmit` calls `signUpWithPassword` on signup; single "use a code instead" link on both modes; `otp` step reused.

**Scope Guard:**
- **DO NOT** add `resetPasswordForEmail` / reset-link / callback redirect (AP-D4).
- **DO NOT** touch Google (`signInWithGoogle`) or the OTP step internals beyond the `shouldCreateUser` flag + copy.
- **DO NOT** change `/complete-profile`, middleware gates, ghost-sweep, or verification.
- **DO NOT** add a confirm-password field (AP-D9 locked: no).
- **DO NOT** flip Supabase "Confirm email" ON — we verify via code, not link (that's `ap-04a`, stays OFF).
- `signUpWithPassword` stays exported for now (harmless) **or** is removed only if no other caller — verify with a grep first; don't break `ap-03`.

---

## ✅ Task Breakdown

### 1. Helpers — parametrize OTP + add signup-verify path (`lib/auth/methods.ts`)
- [ ] 1.1 `sendEmailOtp(email, { createIfMissing })` — thread `shouldCreateUser` (default keep today's behavior; login passes `false`, signup passes `true`). Update existing callers.
- [ ] 1.2 Add `verifyOtpThenSetPassword(email, token, password)` (or compose in the picker): `verifyEmailOtp` → on session, `supabase.auth.updateUser({ password })`. Enforce `MIN_PASSWORD_LENGTH` before the network call. Return the same `{ error?, user? }` shape as the other helpers.
- [ ] 1.3 `authErrorMessage`: add the **"No account found — create one."** branch for login-OTP-on-unknown-email — map Supabase signals: `otp_disabled` / "Signups not allowed for otp" / user-not-found. Keep existing branches.

### 2. Signup flow → OTP-verify (`AuthMethodPicker.tsx`, `mode === "signup"`)
- [ ] 2.1 Primary "Create account" no longer calls `signUpWithPassword`. Instead: validate email + password (min length) → `sendEmailOtp(email, { createIfMissing: true })` → advance to `otp` step, **carrying the entered password in state**.
- [ ] 2.2 In the `otp` step for signup, on code submit call the verify-then-set-password path (1.2) → `routeAfterAuth` → `/complete-profile`.
- [ ] 2.3 Existing verified email at step 2.1 → surface "An account already exists — sign in instead." (Supabase may still send a code for a known user; that's fine — verifying just logs them in. Copy stays honest either way.)
- [ ] 2.4 Remove the standalone **"Use a code instead"** link on signup (the code is now the verify step). Keep the signup title/subtitle; the OTP screen subtitle should read as "confirm your email".

### 3. Login gate (`AuthMethodPicker.tsx`, `mode === "signin"`)
- [ ] 3.1 "Use a code instead" → `sendEmailOtp(email, { createIfMissing: false })`. Unknown email → render **"No account found — create one."** (with the switch-to-signup footer already present). Known email → existing OTP step unchanged.
- [ ] 3.2 Password sign-in unchanged (already rejects unknowns via generic error).

### 4. Copy + a11y
- [ ] 4.1 Signup OTP step subtitle: "Enter the 6-digit code we sent to confirm your email." Login OTP step subtitle unchanged.
- [ ] 4.2 Errors surface in the existing `role="alert"` region; password field keeps show/hide + min-length hint; no confirm field.

### 5. Tests
- [ ] 5.1 `AuthMethodPicker.test.tsx`: **signup** = enter email+password → code sent → verify → `updateUser({password})` called → routed. Remove/replace the old "signup calls `signUpWithPassword`" assertion.
- [ ] 5.2 signup: no standalone "use a code instead" link rendered in signup mode.
- [ ] 5.3 **login** "use a code" on unknown email → "No account found — create one." rendered; known email → OTP step.
- [ ] 5.4 `methods.test.ts`: `sendEmailOtp` passes `shouldCreateUser` through; `verifyOtpThenSetPassword` enforces min length + calls `updateUser`; new `authErrorMessage` "no account" branch.

### 6. Verification
- [ ] 6.1 `npm run lint` + `tsc --noEmit` clean for the slice.
- [ ] 6.2 Manual round-trips (needs `ap-04a` live): signup typo'd email can't proceed without the real code; signup happy path → `/complete-profile`; login unknown email via code → "no account"; password login + Google unchanged.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/auth/methods.ts
UPDATE: frontend/lib/auth/__tests__/methods.test.ts
UPDATE: frontend/components/auth/AuthMethodPicker.tsx
UPDATE: frontend/components/auth/__tests__/AuthMethodPicker.test.tsx
READ:   frontend/lib/auth/route-after-auth.ts ; components/auth/AuthShell.tsx ; task-ap-02 (context)
DO NOT TOUCH: backend ; complete-profile ; middleware ; callback route ; PasswordPanel (ap-03) ; Google helper
```

---

## 🧠 Design Constraints

- **Verify via code, never a link** — reuse `verifyOtp(type:"email")`; keeps the reset-link bug-class dead (AP-D4) and lets Confirm-email stay OFF.
- **Anti-enumeration** — password sign-in keeps the generic error. The explicit "No account found" copy is only on the **login code** path (Supabase already signals signups-not-allowed there), matching the signup footer nudge.
- **No confirm-password** (AP-D9) — show/hide + OTP recovery are the typo backstop.
- Password is carried in component state across the send→verify step; never logged, never in the URL.

---

## ✅ Acceptance Criteria

- [ ] `/signup`: email + password → **6-digit code** → verified → `/complete-profile`; a wrong/typo email cannot complete (no valid code); no confirm field; no standalone code link.
- [ ] `/signup` existing verified email → "An account already exists — sign in instead."
- [ ] `/login` password: wrong/unknown → generic "incorrect email or password"; correct → in.
- [ ] `/login` "use a code instead": unknown → **"No account found — create one."**; known → OTP login.
- [ ] Google create-on-first + OTP step internals + routing/gates/ghost-sweep/verification unchanged.
- [ ] Component + unit tests green; lint/tsc clean for the slice.

---

**Created:** 2026-07-24. **Closed:** 2026-07-24 (code). Manual smoke still on `ap-04`.
