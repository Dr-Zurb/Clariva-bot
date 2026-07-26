# Task ap-04: Supabase config + close gate

> **Filename:** `task-ap-04-config-and-close-gate.md`
> **Links:** batch [`../plan-auth-password-batch.md`](../plan-auth-password-batch.md) · exec [`./EXECUTION-ORDER-auth-password.md`](./EXECUTION-ORDER-auth-password.md)

---

## 📋 Task Overview

Two parts: **(ap-04a)** the out-of-repo Supabase console config (can run in parallel from the start),
and **(ap-04)** the close gate — acceptance + manual smoke + verification that nothing upstream
regressed.

**Program / Batch:** auth-password · Wave A + Wave 4 (**runs last — after `ap-05`**)
**Estimated Time:** ~1h (+ console minutes)
**Status:** 🚧 In-repo close done. **Blocked on Human/Ops `ap-04a` + live dogfood (1.x / 2.x).**
**Change Type:** ✅ Config + QA (no migration).
**Depends on:** `ap-01`, `ap-02`, `ap-03`, **`ap-05`** (signup OTP-verify + login gate — acceptance below assumes it landed).

---

## ✅ Part A — Supabase console config (ap-04a, Human/Ops, parallelizable)

> **You do this in the Supabase dashboard** (no CLI in repo). Inbox reminder already parked.

- [ ] A.1 **Auth → Providers → Email**: keep Email provider enabled; **Confirm email OFF** (AP-D7 — we verify the email ourselves via OTP in `ap-05`/AP-D9; do **not** turn this ON).
- [ ] A.2 Set **minimum password length** = **8**.
- [ ] A.3 Enable **leaked-password protection** (HIBP) if available on the plan.
- [ ] A.4 Confirm the **Email OTP** template still emits `{{ .Token }}` at **6 digits** (auth-v2 `av2-01`) — the "use a code instead" path depends on it.
- [ ] A.5 (Optional) "Secure password change" can stay OFF — Settings forgot path uses **email OTP verify** then `updateUser` (AP-D19), not Supabase's nonce/`reauthenticate` path.

---

## ✅ Part B — Close gate (ap-04)

### 1. Acceptance (from batch plan — incl. AP-D9 / AP-D10) — live dogfood
- [ ] 1.1 `/login` password: correct → in; **wrong OR unknown → generic "incorrect email or password"** (no enumeration).
- [ ] 1.2 `/login` "use a code instead": **known** email → OTP login; **unknown** email → **"No account found — create one."** (AP-D10, `shouldCreateUser:false`).
- [ ] 1.3 `/signup`: email + password → **6-digit code** → verified → `/complete-profile`; a **typo'd/unowned email cannot complete** (no valid code arrives); **no confirm-password field**; **no standalone "use a code" link on signup** (AP-D9).
- [ ] 1.4 `/signup` existing **verified** email → "An account already exists — sign in instead."
- [ ] 1.5 Settings → Account: password user changes password only after correct current; Google/OTP-only user sets one.

### 2. Regression smoke (unchanged surfaces — AP-D8) — live dogfood
- [ ] 2.1 Google one-tap still round-trips via `/auth/callback` and **still creates-on-first-auth** (the documented AP-D10 exception).
- [ ] 2.2 Known-user OTP login still works; `routeAfterAuth` / `/complete-profile` / middleware gates unchanged.
- [x] 2.3 Ghost-account sweep predicate unaffected (password accounts that abandon onboarding are still ghosts) — code review: sweep keys on `profile_completed` / age, not password.
- [x] 2.4 Doctor verification flow untouched — no code paths in this batch.

### 3. Verify + capture
- [x] 3.1 Touched-file lint clean; auth-slice `tsc` clean (pre-existing cockpit/rx debt noted, unrelated).
- [x] 3.2 Affected unit/component tests green (methods, picker incl. ap-05 paths, PasswordPanel, post-auth) — **38 passed**.
- [x] 3.3 MFA (TOTP / passkeys) already captured in `docs/Work/capture/inbox.md`.
- [x] 3.4 `AP-D1` reversal noted on auth-v2 plan (`AV2-D1` ↳ rev row → auth-password).
- [x] 3.5 Static SSR smoke (`localhost:3000`): `/login` shows password + "Forgot password? Use a code instead"; `/signup` shows password + "Create account" and **no** standalone code link; `/dashboard/settings/account` redirects unauth (307).

---

## 📁 Files to Create/Update

```
CONFIG: Supabase dashboard (no repo change) — Human
UPDATE: docs/Work/capture/inbox.md            (MFA + ap-04a — already present)
UPDATE: docs/.../auth-v2/plan-auth-v2-batch.md  (AV2-D1 partial-reversal note)
READ:   all ap-01..05 outputs ; DEFINITION_OF_DONE.md
```

---

## ✅ Acceptance Criteria

- [ ] All acceptance + regression items above pass on a live env. ← **you** (1.x / 2.x after ap-04a)
- [ ] Console: Confirm-email OFF, min length 8, leaked-password protection ON (if available), OTP still 6-digit. ← **you (ap-04a)**
- [x] tsc/lint clean for the batch's touched files; tests green; MFA follow-up captured.

---

**Created:** 2026-07-24. **Closed:** — (in-repo done 2026-07-24; awaiting Human console + dogfood)
