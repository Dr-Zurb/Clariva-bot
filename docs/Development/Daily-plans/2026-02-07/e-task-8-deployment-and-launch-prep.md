# Task 8: Deployment & Launch Prep
## February 7–12, 2026 – Week 4: Deployment & Launch Prep (Day 8–12)

---

## 📋 Task Overview

Set up production (or staging) environment, deploy backend and frontend, configure monitoring and compliance checks, secrets management, environment separation, and data retention automation per [COMPLIANCE.md](../../Reference/COMPLIANCE.md) and the [Monthly Plan](../../Monthly-plans/2025-01-09_1month_dev_plan.md) Day 8–12.

**Estimated Time:** 4–8 hours  
**Status:** 🟡 **IN PROGRESS**  
**Completed:** _Docs and deploy config done; actual deploy and Sentry setup by operator._

**Change Type:**
- [x] **New feature** — Deployment pipeline, monitoring, docs
- [x] **Update existing** — Config and env (Dockerfile, .env.example, DEPLOYMENT.md links)

**Current State:**
- ✅ **What exists:** Backend (Node/Express), frontend (Next.js); local dev and build working; Dockerfile, deployment runbook, compliance monitoring doc, secrets/env doc, data retention doc.
- ✅ **Done:** Backend Dockerfile + .dockerignore; LOG_LEVEL in backend .env.example; docs/setup/deployment-runbook.md (env matrix, production checklist, smoke test); docs/setup/compliance-monitoring.md (§J); docs/setup/secrets-and-environments.md (§H, §I); docs/setup/data-retention.md (§F, phased); DEPLOYMENT.md links to new docs.
- ⏳ **Operator:** Deploy backend/frontend to host (Render/Vercel etc.); configure Sentry; run migrations; set production env vars; complete smoke test.

**Scope Guard:**
- Expected: deploy configs, env docs, monitoring setup, compliance checklist; may phase retention automation if out of scope.

**Reference Documentation:**
- [DEPLOYMENT.md](../../Reference/DEPLOYMENT.md) - Deployment approach
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - §J Monitoring, §I Env separation, §F Retention, §H Secrets
- [OBSERVABILITY.md](../../Reference/OBSERVABILITY.md) - Logging, metrics
- [Monthly Plan Day 8–12](../../Monthly-plans/2025-01-09_1month_dev_plan.md#day-8-12-deployment--launch-prep-feb-7-12)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Production / Staging Environment
- [ ] 1.1 Set up production environment (e.g. Render, Railway, or other for backend). **Config ready:** `backend/Dockerfile`; see [deployment-runbook.md](../../../setup/deployment-runbook.md).
- [ ] 1.2 Deploy frontend (e.g. Vercel) with `NEXT_PUBLIC_API_URL` pointing to backend. **Doc:** runbook §4.
- [x] 1.3 Configure production environment variables; document in deployment doc or `.env.example` (no secrets in repo). **Done:** runbook §2 + §6 env matrix; `backend/.env.example` includes `LOG_LEVEL`.
- [ ] 1.4 SSL and domain (if needed); database backups configured. **Doc:** runbook §4 (Vercel/backend SSL); backups via Supabase/provider.

### 2. Monitoring & Error Tracking
- [ ] 2.1 Set up error tracking (e.g. Sentry) for backend and frontend. **Doc:** [compliance-monitoring.md](../../../setup/compliance-monitoring.md) §3; implement when ready.
- [x] 2.2 **Compliance monitoring (COMPLIANCE.md §J):** Configure or document alerts for: auth failures (spike), rate-limit violations, error rate >5%, suspicious access patterns, PHI-in-logs checks, DB health. **Done:** [compliance-monitoring.md](../../../setup/compliance-monitoring.md).
- [x] 2.3 Create or update deployment/runbook documentation. **Done:** [deployment-runbook.md](../../../setup/deployment-runbook.md).

### 3. Secrets & Environment Separation
- [x] 3.1 **Secrets (COMPLIANCE.md §H):** Document secrets rotation schedule (e.g. quarterly for service role); incident response (rotate on breach). **Done:** [secrets-and-environments.md](../../../setup/secrets-and-environments.md).
- [x] 3.2 **Environment separation (COMPLIANCE.md §I):** Staging vs production; different Supabase projects and API keys per env; verify no production data in dev/staging; document env var management. **Done:** [secrets-and-environments.md](../../../setup/secrets-and-environments.md).

### 4. Data Retention (COMPLIANCE.md §F)
- [x] 4.1 Implement or document retention: scheduled job for enforcement, soft delete then hard delete, audit log all deletions; optional quarterly backup restoration test. **Done:** [data-retention.md](../../../setup/data-retention.md) (policy + phased automation).
- [x] 4.2 If phased: document retention policy and target date for automation. **Done:** data-retention.md §4.

### 5. Production Readiness Checklist
- [ ] 5.1 All env vars configured for target env; DB backups automated. **Checklist:** runbook §7.
- [ ] 5.2 Monitoring (including compliance) and error tracking in place. **Checklist:** runbook §7 + compliance-monitoring.md.
- [ ] 5.3 Rate limiting and auth middleware verified in deployed env. **Checklist:** runbook §7.
- [x] 5.4 Security/compliance audit completed; secrets and env separation documented. **Done:** secrets-and-environments.md; compliance-monitoring.md.
- [ ] 5.5 Final smoke test in production (or staging); ready for first test customers. **Steps:** runbook §8.

---

## 📁 Files to Create/Update

```
docs/setup/
  deployment-runbook.md          ✅ Created (backend + frontend deploy, env matrix, prod checklist, smoke test)
  compliance-monitoring.md       ✅ Created (§J alerts, Sentry, incident response)
  secrets-and-environments.md    ✅ Created (§H, §I rotation + env separation)
  data-retention.md              ✅ Created (§F policy + phased automation)
docs/Reference/
  DEPLOYMENT.md                  ✅ Updated (links to new setup docs)
backend/
  Dockerfile                     ✅ Created
  .dockerignore                  ✅ Created
  .env.example                   ✅ Updated (LOG_LEVEL)
frontend/                        (no change; Vercel works with Next.js default)
```

---

## 🧠 Design Constraints

- No production secrets in repo or client bundle.
- COMPLIANCE.md §J, §I, §F, §H must be addressed (implemented or explicitly documented as phased).

---

## ✅ Acceptance Criteria

- [ ] Backend and frontend deployed and reachable. _(Operator: use runbook to deploy.)_
- [x] Monitoring and compliance monitoring configured or documented. **Done:** compliance-monitoring.md.
- [x] Secrets rotation and environment separation documented. **Done:** secrets-and-environments.md.
- [x] Data retention automation or phased plan documented. **Done:** data-retention.md.
- [ ] Production readiness checklist completed; ready for first customers. _(Checklist in runbook §7; operator completes when deploying.)_

---

**Last Updated:** 2026-02-07  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
