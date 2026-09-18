# admin-console-v3 — execution order

> Sibling of [`../plan-admin-console-v3-batch.md`](../plan-admin-console-v3-batch.md).
> **Weight: Opus** for ACON3-01 (aggregates `auth.users` + tables, returns PII). Rest is Auto (frontend reuse). No migration, no new auth surface.

```
Wave 1:  ACON3-01  GET /api/v1/admin/doctors
                   (listUsers spine ⟕ doctor_settings ⟕ doctor_verification → funnelStatus)   [Opus]
Wave 2:  ACON3-02  /admin/doctors directory page
                   (api client fn + query hook + table + funnel badges + "Doctors" nav link)
Wave 3:  ACON3-03  row actions: Resend invite (reuse inviteDoctor resend:true) + View-verification
                   deep-link; fix stale invite-form "localhost" copy
Wave 4:  ACON3-04  close gate (typecheck + lint + tests; dogfood funnel + resend from list)
```

**Depends on:** `admin-console-v1` (role + `requireAdminJwtOrSecret` + `/admin` shell) — ✅ shipped · `admin-console-v2` (admin nav + invite endpoint/form) — ✅ shipped.
**Ordering:** 01 first (UI needs the endpoint); 02 before 03 (actions attach to the table); 04 last.
**Parallel-safe:** none within the batch — each wave consumes the prior. Safe to run alongside unrelated batches (touches only admin files).

**Created:** 2026-07-22. **Status:** ✅ Complete (eng). Owner dogfood: directory funnel + resend from row.
