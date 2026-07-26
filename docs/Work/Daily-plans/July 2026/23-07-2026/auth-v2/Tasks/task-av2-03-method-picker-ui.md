# Task av2-03: Method-picker UI for `/login` + `/signup` (frontend)

> **Filename:** `task-av2-03-method-picker-ui.md`
> **Links:** batch [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md) · exec [`./EXECUTION-ORDER-auth-v2.md`](./EXECUTION-ORDER-auth-v2.md)

---

## 📋 Task Overview

Replace the email/password forms on `/login` and `/signup` with an **Eka-style method picker**: stacked cards for **Continue with Google** and **Continue with Email**; the email card expands to an email field → send code → **6-digit OTP entry**. Both routes render one shared component (AV2-D8). Reuse `AuthShell`.

**Program / Batch:** auth-v2 · Wave 2
**Estimated Time:** ~2–3h
**Status:** ⏳ Not started. **Model: Sonnet.**
**Change Type:** ✅ Frontend UI (no backend, no migration).
**Depends on:** `av2-02` (auth helpers + routing), `av2-01` (providers live for real testing).

**Current State:**
- ✅ `frontend/app/(auth)/login/page.tsx` — `signInWithPassword` form.
- ✅ `frontend/app/(auth)/signup/page.tsx` — signup-v2 form (name + practice/specialty + password + confirm-email).
- ✅ `frontend/components/auth/AuthShell.tsx` chrome (title/subtitle/footer slots).
- ✅ `(auth)/layout.tsx` bounces authed users → `/dashboard` (fine; picker is for unauth).

**Scope Guard:**
- **DO NOT** collect name/practice/specialty here — that moves to `/complete-profile` (av2-04). The picker is auth-only.
- **DO NOT** add password fields anywhere.
- **DO NOT** implement the callback/helpers (av2-02) — only call them.
- Keep `AuthShell` + brand copy ("Halo Aid").

---

## ✅ Task Breakdown

### 1. Shared picker component (AV2-D8)
- [ ] 1.1 Create `frontend/components/auth/AuthMethodPicker.tsx` with a `mode: "signin" | "signup"` prop (drives copy only).
- [ ] 1.2 Card 1 — **Continue with Google** (Google glyph) → `signInWithGoogle()`; disable + spinner while redirecting; show `?error=oauth` message if present.
- [ ] 1.3 Card 2 — **Continue with Email** → expands inline to an email input + "Send code" → `sendEmailOtp(email)`; on success advance to the OTP step.

### 2. OTP code step
- [ ] 2.1 6-digit code input (numeric, `inputMode="numeric"`, autocomplete `one-time-code`); "Verify & continue" → `verifyEmailOtp(email, token)` → `routeAfterAuth`.
- [ ] 2.2 "Resend code" (re-call `sendEmailOtp`, with a short cooldown) + "Use a different email" (back to step 1).
- [ ] 2.3 Friendly errors (expired/invalid code) via the normalized helper result.

### 3. Wire the routes
- [ ] 3.1 `/login/page.tsx` → `<AuthMethodPicker mode="signin" />`; footer "New here? Create account" → `/signup`.
- [ ] 3.2 `/signup/page.tsx` → `<AuthMethodPicker mode="signup" />`; footer "Already have an account? Sign in" → `/login` + keep the "Book a demo" cross-link (`DEMO_HREF`).
- [ ] 3.3 Remove the old password/email/name form bodies from both pages (logic now in the picker + complete-profile).

### 4. Accessibility + states
- [ ] 4.1 Labels/`aria-describedby` for errors; `role="alert"` live region; keyboard focus moves to the OTP field on step change; buttons show loading text.

### 5. Tests
- [ ] 5.1 Component test: Google card calls `signInWithGoogle`; email flow (send → OTP step → verify → route) with mocked helpers; error copy renders; resend cooldown works.

### 6. Verification
- [ ] 6.1 `npm run lint` clean for touched files; `tsc --noEmit` no new errors in touched files.
- [ ] 6.2 Manual: light/dark; Google card redirects; email code round-trip (with av2-01 live).

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/auth/AuthMethodPicker.tsx
UPDATE: frontend/app/(auth)/login/page.tsx        (render picker, signin copy)
UPDATE: frontend/app/(auth)/signup/page.tsx       (render picker, signup copy + demo link)
CREATE: frontend/components/auth/__tests__/AuthMethodPicker.test.tsx
READ:   frontend/components/auth/AuthShell.tsx ; frontend/lib/auth/methods.ts (av2-02)
DO NOT TOUCH: backend ; complete-profile ; middleware ; callback route
```

---

## 🧠 Design Constraints

- **Match the reference** (stacked full-width cards w/ leading glyph + label), themed to Halo Aid tokens (not raw Eka colors).
- **Auth-only** — no profile fields here (AV2-D9 keeps them in complete-profile).
- **Passwordless** — Google + email OTP only.

---

## ✅ Acceptance Criteria

- [ ] `/login` + `/signup` render the shared picker (Google + Email); no password anywhere.
- [ ] Email flow: send code → enter 6-digit code → verify → routed by `profile_completed`; resend + change-email work.
- [ ] Google card initiates OAuth and returns via `/auth/callback`.
- [ ] Friendly errors; a11y states; light/dark clean; component tests green; lint/tsc clean for the slice.

---

**Created:** 2026-07-23. **Closed:** —
