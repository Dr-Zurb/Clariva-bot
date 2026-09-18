# Task av2-07: Close gate — acceptance, smoke, verification, capture

> **Filename:** `task-av2-07-close-gate.md`
> **Links:** batch [`../plan-auth-v2-batch.md`](../plan-auth-v2-batch.md) · exec [`./EXECUTION-ORDER-auth-v2.md`](./EXECUTION-ORDER-auth-v2.md)

---

## 📋 Task Overview

Verify the whole auth-v2 flow end-to-end, run the verification gate across both packages, confirm the demolition left nothing dangling, and capture the deferred phone-OTP follow-up.

**Program / Batch:** auth-v2 · Wave 6
**Estimated Time:** ~1h
**Status:** ⏳ Not started. **Model: Sonnet/Composer.**
**Change Type:** ✅ QA + gate (no feature code).
**Depends on:** `av2-01`…`av2-06`.

---

## ✅ Task Breakdown

### 1. Manual smoke matrix (with av2-01 live)
- [ ] 1.1 **New Google user:** picker → Google → callback → `/complete-profile` (name prefilled) → getting-started.
- [ ] 1.2 **New email user:** picker → email → 6-digit code → `/complete-profile` (blank name) → fills → getting-started.
- [ ] 1.3 **Returning complete user:** either method → straight to `/dashboard` (no complete-profile).
- [ ] 1.4 **Existing email/password account:** signs in via Email OTP → same user; verification/settings intact.
- [ ] 1.5 **Same-email linking:** Google on an email that already exists → **one** user (no duplicate).
- [ ] 1.6 **Middleware:** incomplete user forced to complete-profile; **no redirect loop**; unauth → `/login`; admin reaches `/admin`.
- [ ] 1.7 **Verification unchanged:** get-verified submit → admin review (approve / request-changes / reject) still works; verified doctor can go patient-facing.

### 2. Demolition audit
- [ ] 2.1 `rg -n "inviteDoctor|inviteRedirectTo|set-password|password_set|/doctors/invite|InviteDoctorClient|'invited'"` → only intended residue (e.g. vestigial metadata note), no live code paths.
- [ ] 2.2 No dead links/imports; `/set-password` + `/admin/doctors/invite` 404.

### 3. Verification gate (DEFINITION_OF_DONE)
- [ ] 3.1 `cd backend && npm run type-check && npm run lint && npm test` green.
- [ ] 3.2 `cd frontend && npm run lint && npx tsc --noEmit` — no new errors in touched files (note known pre-existing `* 2.*` duplicate-file noise).
- [ ] 3.3 Confirm **no migration** landed; no RLS/policy change.

### 4. Docs + capture
- [ ] 4.1 Flip statuses: batch plan + exec order → ✅ Complete (date); each task → Closed.
- [ ] 4.2 Append to `docs/Work/capture/inbox.md`: `- [ ] auth-v2 follow-up: phone OTP as an OTP-verified attribute inside doctor verification (needs SMS provider + India DLT) — AV2-D5`.
- [ ] 4.3 Note in the plan that existing `password_set` metadata is now vestigial (harmless; optional future cleanup — OQ-3).

---

## 📁 Files to Create/Update

```
UPDATE: docs/Work/Daily-plans/July 2026/23-07-2026/auth-v2/plan-auth-v2-batch.md   (status)
UPDATE: .../Tasks/EXECUTION-ORDER-auth-v2.md + each task file                       (Closed)
UPDATE: docs/Work/capture/inbox.md                                                  (phone-OTP follow-up)
```

---

## ✅ Acceptance Criteria

- [ ] Full smoke matrix passes (Google + email, new + returning, existing account, linking, middleware, verification).
- [ ] Demolition audit clean; retired routes 404.
- [ ] Backend + frontend verification gate green; no migration; no RLS change.
- [ ] Statuses flipped; phone-OTP follow-up captured.

---

**Created:** 2026-07-23. **Closed:** —
