# Task av2-02: `/auth/callback` route + browser auth helpers (frontend)

> **Filename:** `task-av2-02-callback-and-auth-helpers.md`
> **Links:** batch [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md) · exec [`./EXECUTION-ORDER-auth-v2.md`](./EXECUTION-ORDER-auth-v2.md)

---

## 🛑 STOP — auth boundary

This task establishes sessions (OAuth code exchange + email OTP). Run on **Opus**. Do not start until `av2-01` console config is done and verified — the callback fails silently without the right redirect URLs.

---

## 📋 Task Overview

Add the server **`/auth/callback`** route handler that exchanges the Google OAuth `code` for a session and routes by `profile_completed`, plus a small **browser auth-helper module** the UI (av2-03) reuses for Google + email-OTP. This is the spine; the picker UI is a thin caller.

**Program / Batch:** auth-v2 · Wave 1
**Estimated Time:** ~1.5h
**Status:** ⏳ Not started. **Model: Opus.**
**Change Type:** ✅ Frontend auth wiring (no backend, no migration).
**Depends on:** `av2-01`.

**Current State:**
- ✅ Browser client `frontend/lib/supabase/client.ts` (`createBrowserClient`, PKCE default).
- ✅ Server client `frontend/lib/supabase/server.ts` (used by route handlers + server components).
- ⚠️ Anti-pattern to avoid: `frontend/app/set-password/page.tsx` hand-parsed hash tokens because it used the *implicit* flow. OAuth here uses the **code** flow → `exchangeCodeForSession` on the server. Email uses **`verifyOtp`** (no redirect at all).

**Scope Guard:**
- **DO NOT** build the picker UI here (that's av2-03) — only the helpers + callback.
- **DO NOT** touch middleware/complete-profile (av2-04) beyond reading `profile_completed` to choose the redirect target.
- **DO NOT** reintroduce any password path.

---

## ✅ Task Breakdown

### 1. Callback route (Google OAuth code flow)
- [ ] 1.1 Create `frontend/app/auth/callback/route.ts` (Route Handler, **not** under `(auth)`).
- [ ] 1.2 Read `code` from the query; use the **server** Supabase client to `exchangeCodeForSession(code)`.
- [ ] 1.3 On success, read the user; redirect to `/complete-profile` when `user.user_metadata.profile_completed !== true`, else `/dashboard`. Honor an optional `next` param if present (safe, same-origin only).
- [ ] 1.4 On error (no code / exchange fails), redirect to `/login?error=oauth` (friendly copy on the picker).

### 2. Browser auth helpers
- [ ] 2.1 Create `frontend/lib/auth/methods.ts` (client) exporting:
  - `signInWithGoogle()` → `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: `${origin}/auth/callback` } })`.
  - `sendEmailOtp(email)` → `supabase.auth.signInWithOtp({ email, options:{ shouldCreateUser: true } })`.
  - `verifyEmailOtp(email, token)` → `supabase.auth.verifyOtp({ email, token, type:'email' })`.
- [ ] 2.2 Each returns a normalized `{ ok } | { ok:false, message }` (user-friendly message mapping, mirroring the existing `getUserFriendlyMessage` style in login/signup).

### 3. Post-OTP routing helper
- [ ] 3.1 A tiny helper `routeAfterAuth(router, user)` the email path calls after `verifyEmailOtp` succeeds: push `/complete-profile` or `/dashboard` by `profile_completed`. (Keeps the picker dumb.)

### 4. Tests
- [ ] 4.1 Unit-test the message mapping + `routeAfterAuth` branch (completed → dashboard; not → complete-profile). Callback handler: light test that missing `code` → error redirect.

### 5. Verification
- [ ] 5.1 `cd frontend && npm run lint` clean for touched files; `tsc --noEmit` no new errors in touched files.
- [ ] 5.2 Manual (with av2-03 stub or curl-ish): Google round-trip lands authenticated; email OTP establishes a session.

---

## 📁 Files to Create/Update

```
CREATE: frontend/app/auth/callback/route.ts            (OAuth code exchange + route by flag)
CREATE: frontend/lib/auth/methods.ts                   (signInWithGoogle / sendEmailOtp / verifyEmailOtp)
CREATE: frontend/lib/auth/route-after-auth.ts          (or co-locate helper)
UPDATE: (tests) frontend/lib/auth/__tests__/…
READ:   frontend/lib/supabase/{client,server}.ts ; frontend/app/set-password/page.tsx (anti-pattern)
DO NOT TOUCH: middleware.ts ; picker UI ; any backend
```

---

## 🧠 Design Constraints

- **Code flow on the server** for OAuth (no client hash parsing — that was the set-password bug).
- **No redirect for email** — `verifyOtp` client-side; picker handles the code-entry UX.
- `profile_completed` read is **routing only** (AV2-D3) — never an authz decision.
- Reuse existing Supabase client factories; don't hand-roll a new client.

---

## ✅ Acceptance Criteria

- [ ] `/auth/callback` exchanges the code server-side and redirects by `profile_completed`; missing/invalid code → friendly `/login?error=oauth`.
- [ ] Helpers cover Google + email OTP with normalized results + friendly messages.
- [ ] Email OTP path requires **no redirect** and no hash-token handling.
- [ ] Lint/tsc clean for the slice; helper/branch tests green.

---

**Created:** 2026-07-23. **Closed:** —
