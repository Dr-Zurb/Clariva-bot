# Task ilr-04: Token lifecycle — health sweep + reconnect alerts

> **Links:** batch [`../plan-p1-instagram-launch-critical-batch.md`](../plan-p1-instagram-launch-critical-batch.md) · exec [`./EXECUTION-ORDER-p1-instagram-launch-critical.md`](./EXECUTION-ORDER-p1-instagram-launch-critical.md)

---

## 🛑 Opus — cron + doctor-facing alerts

Touches `doctor_instagram` health + outbound email/dashboard events. Run on **Opus**.

---

## 📋 Task Overview

Stop silent acquisition death at ~60 days: add a **proactive health sweep** that calls Meta `debug_token` (or uses stored expiry), persists health, and notifies the doctor when reconnect is recommended. Prefer Graph refresh if viable for Page tokens; otherwise clear reconnect nudge.

**Program / Phase:** instagram-launch-readiness · p1 · Wave 3  
**Estimated Time:** ~3–5 hours  
**Status:** ✅ Complete (2026-07-25) — email nudge + daily cron; dashboard already surfaces health in Settings (no new event_kind migration).  
**Change Type:** New feature (cron + notify) on existing health model  
**Depends on:** OQ-2 / OQ-3 (defaults: email+dashboard, 7-day warn)

**Current State:**
- ✅ Connect-time long-lived exchange + Page token save — `instagram-connect-service.ts`
- ✅ On-demand `/settings/instagram/status` health via `debug_token` + 5-min cache + DB columns (migration 034)
- ✅ Frontend banner in `InstagramConnect.tsx`
- ❌ No cron/worker sweep; no email/dashboard event for expiry
- ❌ No automatic token refresh outside OAuth connect

**Scope Guard:**
- Reuse existing health summarizer / persist helpers where possible.
- **DO NOT** invent a second health model.
- Rate-limit Meta API calls (batch/cap per tick).
- No PHI in logs.

---

## ✅ Task Breakdown

### 1. Sweep job
- [x] 1.1 `runInstagramTokenHealthJob(correlationId)` — iterate connected doctors (cap 25/tick), force-refresh via `debug_token`, persist.
- [x] 1.2 Mount `POST /cron/instagram-token-health` on `routes/cron.ts` with `CRON_SECRET`.
- [x] 1.3 Document suggested schedule (daily) in route header.

### 2. Refresh vs reconnect
- [x] 2.1 v1 = reconnect-only (documented in worker header); Page-token Graph refresh deferred.
- [x] 2.2 Email on transition into `reconnectRecommended` (dedupe); Settings UI already shows health banner.

### 3. Tests
- [x] 3.1 Sweep: ok→warning nudges; already-warning no nudge; cap respected.
- [x] 3.2 Cron route auth + success totals.

### 4. Verify
- [x] 4.1 type-check + lint + tests green.

---

## 📁 Files to Create/Update

```
CREATE: backend/src/workers/instagram-token-health-cron.ts (or services/)
UPDATE: backend/src/routes/cron.ts
UPDATE: backend/src/services/instagram-connect-service.ts (reuse helpers)
UPDATE: backend/src/services/dashboard-events-service.ts and/or notification-service.ts (alert)
UPDATE: backend/src/config/env.ts (optional warn days / enable flag)
CREATE: backend/tests/unit/workers/... + routes/...
READ: migration 034 health columns; InstagramConnect.tsx (already surfaces health)
DO NOT TOUCH: OAuth connect happy path unless required for refresh
```

---

## ✅ Acceptance Criteria

- [x] Cron exists and is CRON_SECRET-gated.
- [x] Doctors with expiring/expired tokens get a reconnect nudge without opening settings.
- [x] Healthy tokens produce no spam; tests green.

---

**Created:** 2026-07-25. **Closed:** 2026-07-25.  
**Ops:** Schedule `POST /cron/instagram-token-health` daily (same `CRON_SECRET` as other crons).
