# Task RBH-01: Webhook & receptionist observability

## 2026-03-28 — Receptionist bot hardening

---

## 📋 Task Overview

Add **operational visibility** for the Instagram webhook pipeline: queue health, worker outcomes, DM send success vs failure, and comment outreach outcomes (DM sent / public reply sent ratios). Enables market-ready alerting and debugging without logging PHI.

**Estimated Time:** 6–10 hours  
**Status:** ✅ **COMPLETED** — **Completed: 2026-03-28** (log-derived metrics v1)  
**Completed:** 2026-03-28  

**Change Type:**
- [x] **Update existing** — Metrics/logging touchpoints in worker, queue, optional dashboard exports — follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** Structured logging in `webhook-controller`, `webhook-worker`, `instagram-service`; some patterns in [OBSERVABILITY.md](../../../Reference/OBSERVABILITY.md) for other domains.
- ❌ **What's missing:** Consolidated counters or log patterns for webhook job duration, send failures after retry, comment lead funnel, throttle skips; optional Prometheus/StatsD if project standard exists.
- ⚠️ **Notes:** Labels must never contain PHI; use `correlationId` / `eventId` / `doctorId` only where policy allows.

**Scope Guard:**
- No change to conversational behavior; observability only.
- Expected files touched: ≤ 6

**Reference Documentation:**
- [OBSERVABILITY.md](../../../Reference/OBSERVABILITY.md)
- [RECEPTIONIST_BOT_ENGINEERING.md](../../../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Inventory & conventions
- [x] ✅ 1.1 Align with existing observability doc: naming, log levels, metric vs log-derived counts. — **Completed: 2026-03-28**
- [x] ✅ 1.2 List critical failure points: signature path, queue add, job start/end, DM send, comment public reply, conflict recovery, dead letter. — **Completed: 2026-03-28**

### 2. Webhook worker & Instagram send
- [x] ✅ 2.1 Emit consistent, parseable log lines (or metrics) for: job received, branch (comment / dm / payment skip), send success, send failure reason class (rate limit, 404, auth), throttle skip, conflict recovery path taken. — **Completed: 2026-03-28** (`webhook-metrics.ts` + worker)
- [x] ✅ 2.2 Comment path: log aggregates-safe fields for `dm_sent` / `public_reply_sent` outcomes (boolean flags only, no comment text). — **Completed: 2026-03-28**

### 3. Queue & worker infrastructure
- [x] ✅ 3.1 If BullMQ supports stalled/failed hooks documentally, ensure failures surface in logs with `eventId` / `correlationId`. — **Completed: 2026-03-28** (job dequeued / worker success|failure / DLQ metric)
- [ ] 3.2 Optional: shallow queue depth check documented for operators (cron or health endpoint extension — only if already consistent with project patterns). — *Deferred* (no health/cron change in this pass)

### 4. Documentation & verification
- [x] ✅ 4.1 Update [OBSERVABILITY.md](../../../Reference/OBSERVABILITY.md) with receptionist/webhook section and example queries. — **Completed: 2026-03-28**
- [x] ✅ 4.2 Run type-check and existing webhook tests; manual smoke on staging if available. — **Completed: 2026-03-28** (tsc + `webhook-worker.test.ts` + `webhook-metrics.test.ts`)

---

## 📁 Files to Create/Update

```
backend/src/workers/webhook-worker.ts
backend/src/services/instagram-service.ts (if send-level counters)
backend/src/config/queue.ts or worker bootstrap (optional)
docs/Reference/OBSERVABILITY.md
```

**Existing Code Status:**
- ✅ Worker and logger exist; extend metadata-only logging.
- ❌ Receptionist-specific observability section in OBSERVABILITY.md — add.

**When updating existing code:**
- [ ] Audit callers and log volume impact.
- [ ] Remove duplicate or overly chatty lines introduced during iteration.
- [ ] Tests: mock logger where assertions needed; no PHI assertion tests.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No patient message content, comment text, or names in logs or metric labels.
- Must not block webhook POST fast return path with synchronous metric backends.
- Follow project’s chosen observability stack (log only vs metrics backend).

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** N (logging metadata only)
- [ ] **Any PHI in logs?** MUST remain No
- [ ] **External API or AI call?** N for this task (instrumentation only)
- [ ] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] Operators can answer: “Are webhooks backing up?” “Are DM sends failing?” from logs/metrics docs alone.
- [ ] OBSERVABILITY.md documents new fields and retention expectations.
- [ ] No regression in webhook tests; type-check clean.

---

## 🔗 Related Tasks

- [RBH-02](./e-task-rbh-02-webhook-characterization-tests.md)
- [RBH-08](./e-task-rbh-08-instagram-webhook-signature-threat-model.md)

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
