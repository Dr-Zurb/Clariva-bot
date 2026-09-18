# Task acon3-04: Close gate

> **Links:** batch [`../plan-admin-console-v3-batch.md`](../plan-admin-console-v3-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v3.md`](./EXECUTION-ORDER-admin-console-v3.md)

---

## 📋 Task Overview

Verify the batch and dogfood the directory end-to-end. Record the prod-cutover note surfaced during the invite/set-password work.

**Status:** ✅ DONE eng / ⏳ dogfood (2026-07-22). **Change Type:** Verification + docs. No product code beyond fixes found here.

**Scope Guard:** run the gate, dogfood, and document. Any real defect gets fixed in ACON3-01/02/03, not new scope.

---

## ✅ Task Breakdown

### 1. Verification gate
- [x] 1.1 Backend: `npx tsc --noEmit` + eslint on `src` + affected unit tests green (admin-doctors service/controller 9/9).
- [x] 1.2 Frontend: eslint clean on touched files; `tsc` has only pre-existing stray `* 2.ts` duplicates (untouched).

### 2. Dogfood
- [ ] 2.1 `/admin/doctors` shows the funnel; the previously-invisible invited-only accounts now appear as `invited`.
- [ ] 2.2 Resend invite from an `invited` row → fresh email → set-password → sign-in works.
- [ ] 2.3 View verification deep-links to the correct detail page for a submitted doctor.
- [ ] 2.4 Confirm no doctor email appears in server or client logs.

### 3. Docs / carryover
- [x] 3.1 Flip statuses to ✅ in the plan + tasks; resend pulled forward noted as ACON3-D5.
- [x] 3.2 **Prod-cutover checklist** parked in `docs/Work/capture/inbox.md`: at launch, Supabase **Site URL** + **Redirect URLs** and backend **`APP_BASE_URL`** → production domain (not Tailscale funnel); remove funnel/localhost allow-list entries that shouldn’t ship.
- [x] 3.3 Orphaned-`doctor_settings` after resend noted as v4/backlog in the batch plan.

---

## 🌍 Global Safety Gate

- **Data touched?** None (verification/docs).
- **PHI/PII in logs?** Re-confirm none across new endpoint + UI.
- **External API/AI?** No.
- **Retention/deletion?** No.

## ✅ Acceptance Criteria

- [ ] Typecheck + lint + tests green; dogfood passes.
- [ ] Prod-cutover checklist recorded; statuses updated.

**Created:** 2026-07-22.
