# Task ap-01: Password auth helpers + error copy

> **Filename:** `task-ap-01-auth-methods-password.md`
> **Links:** batch [`../plan-auth-password-batch.md`](../plan-auth-password-batch.md) · exec [`./EXECUTION-ORDER-auth-password.md`](./EXECUTION-ORDER-auth-password.md)
> **✅ Landed — partly revised by [`ap-05`](./task-ap-05-signup-otp-verify-and-login-gate.md)** (rev 2026-07-24): `sendEmailOtp` gains a `shouldCreateUser` flag, `authErrorMessage` gains a "No account found" branch, and the email signup path stops using `signUpWithPassword` in favor of OTP-verify-then-`updateUser` (AP-D9/AP-D10).

---

## 📋 Task Overview

Add the two password auth helpers to the browser auth module and extend the shared error mapper.
This is the spine `ap-02` (picker) and `ap-03` (settings) reuse. No UI here.

**Program / Batch:** auth-password · Wave 1
**Estimated Time:** ~1h
**Status:** ⏳ Not started. **Model: Opus** (auth boundary).
**Change Type:** ✅ Frontend lib (no backend, no migration).
**Depends on:** auth-v2 `av2-02` (existing `methods.ts`); `ap-04a` console config for live testing.

**Current State:**
- ✅ `frontend/lib/auth/methods.ts` — `signInWithGoogle`, `sendEmailOtp`, `verifyEmailOtp`, `authErrorMessage`, `AuthResult`.
- ❌ No password helpers (removed in auth-v2).

**Scope Guard:**
- **DO NOT** touch `signInWithGoogle` / `sendEmailOtp` / `verifyEmailOtp` behavior (only add error-copy branches).
- **DO NOT** add `resetPasswordForEmail` or any reset-link flow (AP-D4 — recovery is OTP).
- **DO NOT** change `shouldCreateUser: true` on the OTP path (Model C stays; AP-D8).
- No UI, no settings, no routing.

---

## ✅ Task Breakdown

### 1. `signInWithPassword`
- [ ] 1.1 `export async function signInWithPassword(email, password): Promise<AuthResult>`.
- [ ] 1.2 Trim/lowercase email; guard empty email/password with friendly copy.
- [ ] 1.3 `supabase.auth.signInWithPassword({ email, password })`; on error → `authErrorMessage`; on success → `{ ok: true, user: data.user }`.
- [ ] 1.4 Same `Supabase is not configured` catch pattern as the other helpers.

### 2. `signUpWithPassword`
- [ ] 2.1 `export async function signUpWithPassword(email, password): Promise<AuthResult>`.
- [ ] 2.2 `supabase.auth.signUp({ email, password })`. With Confirm-email OFF the response carries a session → `{ ok: true, user }`.
- [ ] 2.3 Detect "already registered" and return the AP-D-mapped copy (see §3).

### 3. Extend `authErrorMessage` (AP error table)
- [ ] 3.1 `invalid login credentials` / `invalid_credentials` → **"Incorrect email or password — or use a code instead."** (supersedes the OTP-era "email or code" copy; OTP verify uses `otp_*` codes, not this one).
- [ ] 3.2 `user already registered` / `email_exists` → **"An account already exists — sign in instead."**
- [ ] 3.3 weak/short password (`weak_password`, length message) → **"Password is too short (min N characters)."** (N = OQ-1).
- [ ] 3.4 leaked password (`weak_password` w/ HIBP reason / `password ... compromised`) → **"That password has appeared in a data breach. Choose another."**
- [ ] 3.5 Leave existing `otp_*`, rate-limit, provider-disabled branches intact.

### 4. Tests
- [ ] 4.1 `signInWithPassword`: success returns `{ ok, user }`; wrong-creds error maps to friendly copy; empty inputs guarded.
- [ ] 4.2 `signUpWithPassword`: success returns `{ ok, user }`; "already registered" maps to sign-in copy.
- [ ] 4.3 `authErrorMessage`: each new branch → expected string.

### 5. Verification
- [ ] 5.1 `tsc --noEmit` clean for the slice; `npm run lint` clean for touched files.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/auth/methods.ts                       (+ signInWithPassword, signUpWithPassword, error branches)
UPDATE: frontend/lib/auth/__tests__/*.test.ts (or new)     (helper tests)
READ:   frontend/lib/supabase/client.ts
DO NOT TOUCH: OTP/Google helper bodies ; UI ; settings ; backend
```

---

## 🧠 Design Constraints

- Return the session `user` on success so callers route client-side (parity with `verifyEmailOtp`).
- Never log email/password (agent-contract: no PII).
- Password recovery is **out of scope** here (it's the OTP link in the UI — ap-02).

---

## ✅ Acceptance Criteria

- [ ] `signInWithPassword` / `signUpWithPassword` exported, typed `AuthResult`, return `user` on success.
- [ ] `authErrorMessage` covers wrong-password, already-registered, weak, and leaked cases.
- [ ] OTP/Google helpers behaviorally unchanged.
- [ ] Tests green; tsc/lint clean for the slice.

---

**Created:** 2026-07-24. **Closed:** —
