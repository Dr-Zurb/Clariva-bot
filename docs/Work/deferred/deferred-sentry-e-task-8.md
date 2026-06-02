# Deferred: Error Tracking (Sentry)
## e-task-8 §2.1 – Set up error tracking for backend and frontend

**Status:** ⏸️ **DEFERRED**  
**Reason:** Optional until real production traffic; prefer to add when value is highest  
**Defer until:** Production launch / when you start selling (real users and payments)  
**Original Task:** [e-task-8-deployment-and-launch-prep.md](../Daily-plans/2026-02-07/e-task-8-deployment-and-launch-prep.md)  
**Reference:** [compliance-monitoring.md](../../setup/compliance-monitoring.md) §3

---

## What to do when you pick this up

1. **Sentry account**
   - Sign up at [sentry.io](https://sentry.io); create two projects (e.g. “Clariva API”, “Clariva Dashboard”) or one project with two DSNs.

2. **Backend (Render)**
   - Add `@sentry/node`; init early in `backend/src/index.ts` with `SENTRY_DSN` and `release` (e.g. commit or version).
   - Attach request and error handlers so unhandled errors and 5xx are sent to Sentry.
   - Add `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT`) to Render env; document in [deployment-runbook.md](../../setup/deployment-runbook.md).

3. **Frontend (Vercel)**
   - Add `@sentry/nextjs`; run Sentry’s Next.js wizard or follow their docs (config in `next.config.mjs`, client/server Sentry files).
   - Ensure **no PHI** in breadcrumbs or event messages (per [compliance-monitoring.md](../../setup/compliance-monitoring.md)).
   - Add `NEXT_PUBLIC_SENTRY_DSN` (or `SENTRY_DSN`) in Vercel env; document in runbook.

4. **Docs**
   - Update [compliance-monitoring.md](../../setup/compliance-monitoring.md) §3 and the runbook with DSN env var names and “implemented” where done.
   - Mark e-task-8 §2.1 and the compliance “Error tracking” checklist item as done.

---

## 🔗 Related

- [compliance-monitoring.md](../../setup/compliance-monitoring.md) – §3 Error tracking, §6 Go-live checklist
- [e-task-8-deployment-and-launch-prep.md](../Daily-plans/2026-02-07/e-task-8-deployment-and-launch-prep.md) – §2.1

---

**Last Updated:** 2026-02-07
