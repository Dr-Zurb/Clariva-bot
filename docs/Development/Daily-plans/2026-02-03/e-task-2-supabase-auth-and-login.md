# Task 2: Supabase Auth & Login/Signup
## February 3, 2026 – Week 4: Doctor Dashboard Frontend Day 2

---

## 📋 Task Overview

Implement doctor authentication for the dashboard using Supabase Auth: login and signup pages, session handling (cookie-based via `@supabase/ssr`), and protection of dashboard routes. Backend already uses the same Supabase project (service role, RLS); doctors are `auth.users`. Frontend uses Supabase browser and server clients (anon key only); JWT will be sent to backend for API auth in later tasks.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-03

**Change Type:**
- [x] **New feature** — Add auth UI and session handling (client + server)
- [ ] **Update existing** — N/A (backend auth middleware may be added later for API calls)

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Frontend Supabase clients (`lib/supabase/client.ts`, `lib/supabase/server.ts`); login at `app/(auth)/login/page.tsx` and signup at `app/(auth)/signup/page.tsx`; `(auth)` layout redirects authenticated users to `/dashboard`; `app/dashboard/layout.tsx` protects dashboard and redirects to `/login`; **Next.js middleware** (`middleware.ts`) redirects unauthenticated `/dashboard` requests to `/login` and refreshes session (Edge); logout via `LogoutButton` on dashboard; `.env.example` and README document env vars.
- ❌ **What's missing:** Nothing for this task.
- ⚠️ **Notes:** Anon key only; `@supabase/ssr` for cookie-based session; no PHI in logs.

**Scope Guard:**
- Expected files touched: frontend only (lib/supabase/, app routes, components); backend unchanged
- Any expansion requires explicit approval

**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/FRONTEND_ARCHITECTURE.md) - Auth and protection; `@supabase/ssr`; route groups `(auth)` / `(dashboard)`
- [FRONTEND_STANDARDS.md](../../Reference/FRONTEND_STANDARDS.md) - Auth rules; labels; no PII in logs; loading/error states
- [FRONTEND_RECIPES.md](../../Reference/FRONTEND_RECIPES.md) - **F2** Supabase browser client (`lib/supabase/client.ts`); **F3** auth guard (dashboard layout with `createServerClient`)
- [FRONTEND_COMPLIANCE.md](../../Reference/FRONTEND_COMPLIANCE.md) - PII/PHI in UI; secure auth; no PII in logs; httpOnly cookies preferred
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md) - §1 Code/Structure, §3 Accessibility (labels, aria-live), §5 Security/Privacy
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - No PII in logs; auth and access control
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Backend structure; auth users = doctors
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - auth.users; RLS
- [Supabase Auth](https://supabase.com/docs/guides/auth) - Client-side auth
- [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/nextjs) - Cookie-based session, server client

---

## ✅ Task Breakdown (Hierarchical)

### 1. Supabase Clients (Frontend)
- [x] 1.1 Add **`@supabase/ssr`** to frontend dependencies (use for cookie-based session and Next.js server/client split; do not use only `@supabase/supabase-js` for auth in App Router).
- [x] 1.2 Create **browser client**: `lib/supabase/client.ts` using `createBrowserClient` from `@supabase/ssr` and `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (per FRONTEND_RECIPES F2).
- [x] 1.3 Create **server client**: `lib/supabase/server.ts` using `createServerClient` from `@supabase/ssr` with cookie get/set so layout can read session and Supabase can refresh tokens (per Supabase Next.js SSR docs and F3).
- [x] 1.4 Document env vars in frontend README and `.env.example`; ensure no secrets committed.

### 2. Auth Route Group and Login Page
- [x] 2.1 Create login page under **`app/(auth)/login/page.tsx`** (route group per FRONTEND_ARCHITECTURE): email + password form with **associated labels** (or aria-label) per FRONTEND_STANDARDS; use `cn()` for styles.
- [x] 2.2 On submit (Client Component or server action): call `supabase.auth.signInWithPassword`; on success **redirect to `/dashboard`**; on error show **user-friendly message** (e.g. "Invalid email or password") — no stack traces or raw error objects to user; map Supabase error codes if needed.
- [x] 2.3 **Loading and error states**; display errors in a way that is **visible and preferably announced** (e.g. `role="alert"` or `aria-live` per DEFINITION_OF_DONE_FRONTEND §3).
- [x] 2.4 **No PHI in logs**: do not log email or password; log only "Login attempt failed/succeeded" with request/correlation if needed (COMPLIANCE).
- [x] 2.5 **Redirect if already authenticated**: if user has session and visits `/login`, redirect to `/dashboard` (via `app/(auth)/layout.tsx`).
- [x] 2.6 Link to signup: e.g. "Don't have an account? Sign up".

### 3. Signup Page
- [x] 3.1 Create signup page **`app/(auth)/signup/page.tsx`**: email + password + **confirm password**; client-side validation (e.g. min password length, passwords match); **labels** for all inputs.
- [x] 3.2 On submit: call `supabase.auth.signUp`; if Supabase project has **"Confirm email"** enabled, show "Check your email to confirm" and optionally link to login; otherwise redirect to dashboard.
- [x] 3.3 Same UX standards: loading, error states, user-friendly error messages, no PHI in logs.
- [x] 3.4 Redirect if already authenticated to `/dashboard` (via `app/(auth)/layout.tsx`).
- [x] 3.5 Link to login: e.g. "Already have an account? Sign in".

### 4. Session & Route Protection
- [x] 4.1 **Dashboard layout auth check**: in **`app/dashboard/layout.tsx`** (Server Component), use **server Supabase client** (from `lib/supabase/server.ts`) with `getSession()`; if no session, **redirect to `/login`** (per FRONTEND_RECIPES F3). Use cookie get/set as required by `@supabase/ssr` for session refresh.
- [x] 4.2 Optional: add **Next.js middleware** (`middleware.ts` at project root) to redirect unauthenticated requests for `/dashboard` (and nested) to `/login` — can reduce flash; ensure middleware uses server client or cookie check per Supabase Next.js docs. _(Done: `frontend/middleware.ts` uses `createServerClient` with request/response cookies, `getUser()` to refresh session, matcher `/dashboard` and `/dashboard/:path*`.)_
- [x] 4.3 After login/signup success, redirect to `/dashboard`; after logout, redirect to `/login` or home.

### 5. Logout
- [x] 5.1 Logout action: call `supabase.auth.signOut()` (browser client); clear any local state; **redirect to `/login`** (or home). Expose logout from dashboard (e.g. button in layout or header; Task 3 will add full layout).

### 6. Verification
- [x] 6.1 Type-check and lint pass; ensure no `any` for auth-related types.
- [x] 6.2 Manual test: signup → (confirm email if enabled) → login → access `/dashboard` → logout → access `/dashboard` redirects to login; visit `/login` when already signed in redirects to dashboard.

---

## 📁 Files to Create/Update

```
frontend/
├── lib/
│   └── supabase/
│       ├── client.ts         (NEW - createBrowserClient, per F2)
│       └── server.ts         (NEW - createServerClient with cookies, per F3 / Supabase Next.js SSR)
├── app/
│   ├── (auth)/               (route group - URLs stay /login, /signup)
│   │   ├── login/
│   │   │   └── page.tsx     (NEW - email/password form; link to signup)
│   │   └── signup/
│   │       └── page.tsx     (NEW - email/password/confirm; link to login)
│   └── dashboard/
│       ├── layout.tsx       (NEW - auth check via server client, redirect to /login if no session)
│       └── page.tsx         (existing placeholder; protected by layout)
├── middleware.ts             (OPTIONAL - path-based redirect for /dashboard/* to /login)
├── components/
│   ├── LoginForm.tsx        (optional - extract form for reuse/testing)
│   └── SignupForm.tsx       (optional)
└── .env.example             (already has NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
```

**Existing Code Status:**
- ✅ Backend Supabase env vars exist; frontend `.env.example` has NEXT_PUBLIC_SUPABASE_* placeholders (Task 1).
- ✅ `app/dashboard/page.tsx` exists; **`app/dashboard/layout.tsx`** added for auth check and redirect to `/login`.
- ✅ Frontend Supabase clients (`lib/supabase/client.ts`, `lib/supabase/server.ts`) and auth pages (`app/(auth)/login`, `app/(auth)/signup`, `app/(auth)/layout.tsx`) — IMPLEMENTED. Logout via `components/LogoutButton.tsx` on dashboard.

**When updating existing code:** N/A

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Secrets:** Frontend must use only anon key; never service role key (COMPLIANCE, FRONTEND_COMPLIANCE).
- **Logging:** No PHI in logs: do not log email or password; log only "Login attempt failed/succeeded" with request/correlation if needed (COMPLIANCE).
- **Session:** Use **`@supabase/ssr`** for cookie-based session and server-side auth check (FRONTEND_ARCHITECTURE, Supabase Next.js SSR); avoid client-only session that doesn’t persist across refreshes.
- **Protection:** Protected routes must redirect unauthenticated users to login (F3); use Server Component layout for auth check where possible.
- **Accessibility:** Form inputs must have associated labels (or aria-label); error/success messages visible and preferably announced (aria-live or role="alert") per FRONTEND_STANDARDS and DEFINITION_OF_DONE_FRONTEND §3.
- **Business context:** Dashboard is doctor-facing (BUSINESS_PLAN); doctors sign up and sign in to access their practice dashboard; same Supabase project as backend.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – auth state, auth.users via Supabase client)
  - If Yes → [x] **RLS / bypass?** Frontend does not bypass RLS; auth is via Supabase only; backend RLS applies to API when Bearer token is used in later tasks.
- [x] **Any PHI in logs?** (MUST be No — no email, password, or user identifiers in frontend logs)
- [x] **External API or AI call?** (Y – Supabase Auth API) → [x] **Consent + redaction confirmed?** (Y – no PHI in logs; auth calls are to Supabase only.)
- [x] **Retention / deletion impact?** (N – Supabase handles auth data; document in README or COMPLIANCE if user deletion flows are added later)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Doctor can sign up (email, password, confirm password) and sign in via email/password.
- [x] Login and signup pages have labels, loading and error states, and user-friendly error messages (no stack traces); errors visible and preferably announced (accessibility).
- [x] Visiting `/login` or `/signup` when already authenticated redirects to `/dashboard`.
- [x] Dashboard (or protected route) redirects to `/login` when not authenticated (server-side check in layout).
- [x] Logout clears session and redirects to login (or home).
- [x] No PHI in frontend logs; env vars documented in `.env.example` and README.
- [x] Type-check and lint pass; patterns align with F2 (browser client), F3 (auth guard), FRONTEND_STANDARDS (auth, accessibility).

**See also:** [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md) (§1 Code/Structure, §3 Accessibility, §5 Security/Privacy, §6 Documentation).

---

## 📝 Notes

- **Same Supabase project:** Use the same Supabase URL and anon key as the backend (from backend `.env`); frontend only needs `NEXT_PUBLIC_*` so the browser can talk to Supabase Auth.
- **Email confirmation:** If "Confirm email" is enabled in Supabase Dashboard → Authentication → Providers → Email, signup will require the user to click the link before signing in; show "Check your email to confirm" and link to login.
- **Backend API auth:** In later tasks, when the frontend calls `/api/v1/*`, send the Supabase session JWT as `Authorization: Bearer <access_token>`; backend auth middleware can validate it. Not in scope for this task.
- **Route groups:** `(auth)` keeps URLs as `/login` and `/signup`. Protection for this task is via `app/dashboard/layout.tsx` so existing `app/dashboard/page.tsx` stays at `/dashboard`; Task 3 can introduce a shared `(dashboard)` group with nav/sidebar if desired.

---

## 🔗 Related Tasks

- [Task 1: Frontend Project Setup](./e-task-1-frontend-project-setup.md) – Prerequisite
- [Task 3: Dashboard Layout & Navigation](./e-task-3-dashboard-layout-and-navigation.md) – Uses auth-protected layout; add nav and logout button

---

**Last Updated:** 2026-02-03  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
