# Task av2-04: `/complete-profile` page + `profile_completed` flag + middleware routing

> **Filename:** `task-av2-04-complete-profile-and-flag.md`
> **Links:** batch [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md) · exec [`./EXECUTION-ORDER-auth-v2.md`](./EXECUTION-ORDER-auth-v2.md)

---

## 🛑 STOP — middleware auth routing

This edits `middleware.ts` (the app's auth gate). Run on **Opus**. A wrong redirect condition can lock every user (including admin) out of `/dashboard` or into a loop. Test the loop cases explicitly.

---

## 📋 Task Overview

Add the post-auth **complete-profile** step: a short form (full name prefilled from Google; optional practice/specialty) that writes to existing stores, stamps `user_metadata.profile_completed`, and sends the doctor to getting-started. Add middleware enforcement so authed-but-incomplete users are routed there.

**Program / Batch:** auth-v2 · Wave 3
**Estimated Time:** ~2h
**Status:** ⏳ Not started. **Model: Opus.**
**Change Type:** ✅ Frontend page + middleware (no backend, no migration).
**Depends on:** `av2-02` (callback routes here), `av2-03` (email path routes here).

**Current State:**
- ✅ `frontend/middleware.ts` — unauth on `/dashboard`|`/admin` → `/login`; matcher = `/dashboard*`, `/admin*`.
- ✅ `frontend/app/(auth)/layout.tsx` — authed → `/dashboard` (so this page must live **outside** `(auth)`, exactly like `set-password` did).
- ✅ `frontend/lib/api.ts#patchDoctorSettings(token, {...})` — writes practice_name/specialty.
- ✅ Getting-started target: `/dashboard/getting-started` (doctor-onboarding-v1).
- ✅ signup-v2 precedent: name→`user_metadata.full_name`; practice/specialty→`doctor_settings` (SU2-D1/D2).

**Scope Guard:**
- **DO NOT** collect license/registration/docs here — that's verification (unchanged).
- **DO NOT** gate anything sensitive on `profile_completed` — routing only (AV2-D3).
- **DO NOT** place the page under `(auth)` (its layout would bounce the authed user away).
- Practice/specialty **optional** (OQ-2 draft); only full name required.

---

## ✅ Task Breakdown

### 1. Complete-profile page
- [ ] 1.1 Create `frontend/app/complete-profile/page.tsx` (client), rendered in `AuthShell`. **Outside** the `(auth)` group.
- [ ] 1.2 On mount, require a session (else → `/login`); prefill full name from `user_metadata.full_name` (Google provides it; email-OTP users start blank).
- [ ] 1.3 Fields: **Full name** (required) + **Practice name** (optional) + **Specialty** (optional) — mirror signup-v2 copy.
- [ ] 1.4 Submit:
  - name → `supabase.auth.updateUser({ data: { full_name } })`;
  - practice/specialty (if any) → `patchDoctorSettings(token, {...})` (session exists now, so immediate — no deferral);
  - stamp `updateUser({ data: { profile_completed: true } })` (can combine with the name update);
  - `router.push("/dashboard/getting-started"); router.refresh();`.
- [ ] 1.5 Friendly errors; disabled/loading states; a11y (labels, `role="alert"`).

### 2. Middleware enforcement
- [ ] 2.1 In `middleware.ts`, after `getUser()`: if `user` && path starts with `/dashboard` && `user.user_metadata?.profile_completed !== true` → redirect `/complete-profile`. (Leave `/admin` alone — admin has a profile; avoid locking yourself out.)
- [ ] 2.2 Guard `/complete-profile` itself: add it to the `matcher`; if **unauth** → `/login`; if authed && already `profile_completed` → `/dashboard` (prevents re-visiting). Ensure **no redirect loop** (complete-profile must not redirect to itself).
- [ ] 2.3 Confirm the callback (av2-02) + email path (av2-03) targets match these rules exactly.

### 3. Tests
- [ ] 3.1 Page: prefill from metadata; submit writes name + settings + stamps flag + routes; missing name blocks submit.
- [ ] 3.2 Middleware branch reasoning covered (incomplete→complete-profile; complete→through; unauth→login; no loop). Unit or a documented manual matrix if middleware isn't unit-tested today.

### 4. Verification
- [ ] 4.1 `npm run lint` + `tsc --noEmit` clean for touched files.
- [ ] 4.2 Manual matrix: new Google user → prefilled → dashboard; new email user → blank → fills → dashboard; returning complete user → straight to dashboard; **no loop**; admin still reaches `/admin`.

---

## 📁 Files to Create/Update

```
CREATE: frontend/app/complete-profile/page.tsx
UPDATE: frontend/middleware.ts                    (enforce + matcher add /complete-profile)
CREATE: frontend/app/__tests__/complete-profile… (page test)
READ:   frontend/app/(auth)/signup/page.tsx (field copy) ; frontend/lib/api.ts#patchDoctorSettings
DO NOT TOUCH: verification ; backend ; (auth) layout
```

---

## 🧠 Design Constraints

- **Outside `(auth)`** — authed users must reach it (set-password precedent).
- **Routing-only flag** — `profile_completed` never authorizes; the real gate is verification.
- **Session already present** — settings PATCH is immediate (no email-confirm deferral like old signup).
- **No loops** — the single most important middleware test.

---

## ✅ Acceptance Criteria

- [ ] First-time users land on `/complete-profile`; Google name prefilled; email users can enter it.
- [ ] Submit persists name (`user_metadata`) + practice/specialty (`doctor_settings`) + stamps `profile_completed`, then → getting-started.
- [ ] Middleware routes incomplete users to complete-profile, lets complete users through, sends unauth to login, **no redirect loop**, admin unaffected.
- [ ] Lint/tsc clean; tests/matrix green.

---

**Created:** 2026-07-23. **Closed:** —
