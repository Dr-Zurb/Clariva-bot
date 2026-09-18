# Task av2-01: Supabase + Google console config (human/ops — no code)

> **Filename:** `task-av2-01-supabase-google-config.md`
> **Links:** batch [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md) · exec [`./EXECUTION-ORDER-auth-v2.md`](./EXECUTION-ORDER-auth-v2.md)

---

## 🛑 STOP — this is the gate

This task is **out-of-repo console configuration**, not code. **Every other av2 task depends on it.** It's also the exact class of setup that broke the invite flow twice (Site-URL vs Tailscale-funnel mismatch). Get it right once, verify it, then unblock Wave 1.

---

## 📋 Task Overview

Enable Google + Email-OTP auth in Supabase and Google Cloud, wire the redirect/token config for the Tailscale funnel **and** prod, turn on identity-linking, and make sure the admin account survives the cutover.

**Program / Batch:** auth-v2 · Wave 0
**Estimated Time:** ~1–2h (Google) — no DLT needed (phone deferred, AV2-D5)
**Status:** ⏳ Not started. **Owner: Human/Ops.**
**Change Type:** ⚙️ Console config (no repo change).
**Depends on:** `AV2-D*` decision-lock confirmation.

---

## ✅ Task Breakdown

### 1. Google provider (OAuth)
- [ ] 1.1 Google Cloud console → create an OAuth 2.0 Client ID (Web). Configure the OAuth consent screen (app name, support email, scopes: email + profile).
- [ ] 1.2 **Authorized redirect URI** = the Supabase callback: `https://<project-ref>.supabase.co/auth/v1/callback`.
- [ ] 1.3 Supabase → Authentication → Providers → **Google**: paste Client ID + secret, enable.

### 2. App redirect URLs (the funnel gotcha)
- [ ] 2.1 Supabase → Authentication → URL Configuration → **Redirect URLs**: add `https://clariva-dev.tail363099.ts.net/**` **and** the prod origin `/**`. Include `.../auth/callback` explicitly if wildcard isn't honored.
- [ ] 2.2 **Site URL** = the funnel origin for dev (matches what the browser actually uses), prod origin for prod. (This is the value that broke invites when it pointed at `localhost`.)

### 3. Email OTP as a 6-digit code (AV2-D4)
- [ ] 3.1 Supabase → Authentication → Email templates → **Magic Link / OTP**: ensure the template body includes **`{{ .Token }}`** so users get a 6-digit code to type (not only a click-link).
- [ ] 3.2 Confirm "Enable email provider" + "Confirm email" settings are compatible with OTP sign-in (`shouldCreateUser` will create-on-first-OTP).

### 4. Identity linking (AV2-D7)
- [ ] 4.1 Supabase → Authentication → enable **"Link identities with the same email"** (a.k.a. automatic linking), so a Google sign-in on an existing email links instead of creating a duplicate. Verify the current default and flip if needed.

### 5. Admin survival (OQ-4)
- [ ] 5.1 Decide the **Google account** that will be admin (should match your current admin email so linking keeps the account).
- [ ] 5.2 After it exists as a Supabase user, set `app_metadata.role = 'admin'` on it (via SQL/Admin API) — same mechanism `requireAdminAuth` already reads. **Verify you can still reach `/admin` post-cutover before deleting the old path.**

### 6. Verify (before unblocking Wave 1)
- [ ] 6.1 From the funnel origin, a manual Google round-trip returns to `https://<funnel>/auth/v1/callback` without a redirect error.
- [ ] 6.2 A test `signInWithOtp` email arrives containing a **6-digit code**.
- [ ] 6.3 Google + email on the **same address** resolve to **one** user (linking works).

---

## 📁 Files to Create/Update

```
(none — console config only)
DOCUMENT: capture any project-ref / client-id notes in your ops vault, NOT in the repo.
```

---

## 🧠 Design Constraints

- **Dev + prod both** allowlisted — the funnel origin is what the browser uses in dev; a missing entry is exactly the invite-link failure.
- **No secrets in the repo** — Google client secret lives in the Supabase provider config only.
- Phone/Apple **not** configured here (AV2-D5 deferred).

---

## ✅ Acceptance Criteria

- [ ] Google provider live; consent screen configured; Supabase callback URI authorized.
- [ ] Funnel + prod redirect URLs + Site URL set correctly.
- [ ] Email OTP template emits a 6-digit code.
- [ ] Same-email identity linking enabled + verified (one user, not two).
- [ ] Admin Google account has `role='admin'`; `/admin` reachable.
- [ ] Manual Google + email OTP round-trips succeed from the funnel origin.

---

**Created:** 2026-07-23. **Closed:** —
