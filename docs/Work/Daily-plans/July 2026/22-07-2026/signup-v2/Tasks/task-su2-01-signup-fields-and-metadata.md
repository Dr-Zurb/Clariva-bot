# Task su2-01: Signup fields + metadata write

> **Filename:** `task-su2-01-signup-fields-and-metadata.md`
> **Links:** batch [`../plan-signup-v2-batch.md`](../plan-signup-v2-batch.md) · exec [`./EXECUTION-ORDER-signup-v2.md`](./EXECUTION-ORDER-signup-v2.md)

---

## 📋 Task Overview

Add a **Full name** field (required) and optional **Practice name** + **Specialty** to `/signup`. Persist name to Supabase `user_metadata` at `signUp`; persist practice/specialty to `doctor_settings` after the session exists.

**Batch:** signup-v2 · Wave 1
**Status:** ✅ Complete
**Change Type:** Update existing (`/signup` page) — additive fields.

**Current State:**
- ✅ `frontend/app/(auth)/signup/page.tsx` — controlled email/password/confirm; `supabase.auth.signUp({ email, password, options })`.
- ✅ `doctor_settings.practice_name`, `.specialty` exist; PATCH via the doctor-settings API (see `frontend/lib/api` settings calls).
- ❌ No name captured; no post-signup settings write.

**Scope Guard:**
- One file (`signup/page.tsx`) + at most one small helper for the settings PATCH.
- **DO NOT** add license/registration fields (verification batch).
- **DO NOT** add a migration or make practice/specialty required.

---

## ✅ Task Breakdown

### 1. Form fields
- [x] 1.1 Add required **Full name** input (label + `aria-describedby`, matches existing field a11y).
- [x] 1.2 Add optional **Practice name** and **Specialty** inputs (clearly marked optional).
- [x] 1.3 Client-validate: name non-empty; keep existing password rules.

### 2. Persistence
- [x] 2.1 Pass `options.data = { full_name }` to `supabase.auth.signUp` (writes `user_metadata`).
- [x] 2.2 When a session exists immediately (no email-confirm), PATCH `doctor_settings` with provided `practice_name`/`specialty` before redirect.
- [x] 2.3 When email-confirm is required, defer the settings write (either skip — capture again in onboarding — or persist name only). Document the choice inline.

### 3. Verification
- [x] 3.1 `cd frontend && npm run lint` (slice) + `npx tsc --noEmit` clean for touched files.
- [x] 3.2 Manual: sign up with all fields → confirm name in Supabase user; practice/specialty in settings.
- [x] 3.3 Manual: email/password-only still works (optional fields empty).

---

## 📁 Files to Create/Update

```
UPDATE: frontend/app/(auth)/signup/page.tsx
READ:   frontend/lib/api (doctor-settings PATCH helper)
DO NOT TOUCH: any migration; /login; AuthShell; Supabase config
```

## 🧠 Design Constraints

- No PII in logs (COMPLIANCE) — do not log name/email.
- Keep `AuthShell` + email-confirm interstitial unchanged.
- Optional fields must never block account creation.

## 🌍 Global Safety Gate

- **Data touched?** Y (`user_metadata`, `doctor_settings`) — both doctor-owned, RLS-scoped by `auth.uid()`. No new table.
- **PHI in logs?** No.
- **External API / AI?** No (Supabase auth only).
- **Retention/deletion impact?** No (existing account-deletion scrub already covers settings).

## ✅ Acceptance Criteria

- [x] Name required + persisted to `user_metadata`; practice/specialty optional + persisted when given.
- [x] Email-confirm flow intact; optional-empty signup works.
- [x] No migration; slice gate green.

**Created:** 2026-07-22.
