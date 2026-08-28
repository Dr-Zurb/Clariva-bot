# Task acon-03: Close gate

> **Links:** batch [`../plan-admin-console-v1-batch.md`](../plan-admin-console-v1-batch.md) · exec [`./EXECUTION-ORDER-admin-console-v1.md`](./EXECUTION-ORDER-admin-console-v1.md)
> **Status:** ✅ DONE (2026-07-22) — eng gate closed; owner dogfood remaining in inbox.

---

## ✅ Checks

- [x] Backend + frontend gates green (backend typecheck + lint + admin middleware tests; frontend eslint on new admin surface). Pre-existing `lib/api.ts:3705` / cockpit tsc noise unchanged.
- [x] Authz proven in unit tests: non-admin JWT → 403; admin JWT + CRON_SECRET both pass; body role ignored.
- [ ] End-to-end dogfood (owner): flag admin → re-login → `/admin/verifications` → view cert → approve/reject → doctor status updates; `reviewed_by` = admin id. Captured in inbox.
- [x] No service-role/CRON_SECRET in the browser (session Bearer only). Guard/logs carry no tokens/secrets/PII.
- [x] **Runbook:** [`../RUNBOOK-flag-admin.md`](../RUNBOOK-flag-admin.md) — SQL + admin API + re-login note + revoke.
- [x] `doctor-funnel/README.md` sequencing updated; VER-05 unblocked next.
- [x] Batch + tasks marked ✅; inbox dogfood + "flag my admin user" captured.

**Created:** 2026-07-22.
