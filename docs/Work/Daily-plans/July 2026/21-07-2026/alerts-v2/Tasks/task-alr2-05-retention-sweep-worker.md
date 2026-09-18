# Task alr2-05: Retention sweep worker (backend)

> **Filename:** `task-alr2-05-retention-sweep-worker.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## 🛑 Opus — delete over a doctor-owned feed table

Deletes rows from `doctor_dashboard_events`. Run on **Opus**; a wrong predicate erases unread alerts.

## 📋 Task Overview

Ship the retention sweep the `066` header parked ("swept by a future retention worker") — now a v2 **prerequisite** (ALR2-D8), because no-show + SLA-breach out-volume replay events and would otherwise grow the hot unread-first index unbounded.

**Program / Batch:** alerts-v2 · Wave 5
**Estimated Time:** ~1 hour
**Status:** ✅ Complete (2026-07-21). **Model: Opus.**
**Change Type:** ✅ New sweep job (service-role delete).
**Depends on:** `alr2-01` (table shape); emitters (`alr2-03`/`04`) motivate the volume.

**Current State:**
- ✅ `runDashboardEventsRetentionJob` in `dashboard-events-retention-cron.ts`.
- ✅ Mounted at `POST /cron/dashboard-events-retention` (daily schedule note).
- ✅ OQ-3 LOCKED: **N = 90 days** via `DASHBOARD_EVENTS_RETENTION_DAYS` (floor 1).
- ✅ Predicate: `acknowledged_at IS NOT NULL AND acknowledged_at < cutoff`; unread never selected.
- ✅ Service-role delete (header confirms no DELETE policy needed; admin bypasses RLS).

**Scope Guard:**
- **DO NOT** delete unread rows — only `acknowledged_at IS NOT NULL AND acknowledged_at < now() - interval 'N days'`.
- **DO NOT** hard-delete based on `created_at` alone (an old-but-unread alert must survive).
- Service-role delete (admin client bypasses RLS; no DELETE policy needed — confirm this in the header comment).
- Resolve **OQ-3** here (retention window N; draft default **90 days**).

---

## ✅ Task Breakdown

### 1. Sweep job
- [x] 1.1 New `runDashboardEventsRetentionJob(correlationId)`: delete `doctor_dashboard_events` where `acknowledged_at IS NOT NULL AND acknowledged_at < now() - interval '<N> days'`, capped per tick (batch delete by id to bound the statement).
- [x] 1.2 Make N configurable via `config/env.ts` (never read `process.env` directly — agent contract) with a default of 90; document it.
- [x] 1.3 Return `{ deleted, ... }` totals; per-tick cap prevents a long lock.

### 2. Mount
- [x] 2.1 Add `POST /cron/dashboard-events-retention` to `routes/cron.ts` (same `verifyCronAuth`); document a daily schedule.

### 3. Tests
- [x] 3.1 Acknowledged + older-than-N → deleted; empty scan (within-N / unread filtered by SQL) → kept; predicate pins `not('acknowledged_at','is',null)`.
- [x] 3.2 Per-tick cap respected; route: bad secret → 401, success → 200 totals.

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check` clean; eslint clean for the slice.
- [x] 4.2 Sweep + route tests **8/8** green.

---

## 📁 Files to Create/Update

```
CREATE: backend/src/workers/dashboard-events-retention-cron.ts        (mirror recording-archival-cron shape)
UPDATE: backend/src/routes/cron.ts                                     (POST /cron/dashboard-events-retention)
UPDATE: backend/src/config/env.ts                                      (DASHBOARD_EVENTS_RETENTION_DAYS, default 90)
CREATE: backend/tests/unit/workers/dashboard-events-retention-cron.test.ts
CREATE: backend/tests/unit/routes/dashboard-events-retention-cron.test.ts
READ:   backend/migrations/066_doctor_dashboard_events.sql            (parked retention intent)
DO NOT TOUCH: migration; RLS; frontend
```

---

## 🧠 Design Constraints

- **Unread is sacred** — never sweep an unacknowledged alert regardless of age.
- **Config, not literals** — window via `config/env.ts` (never `process.env`).
- **Bounded** — cap deletes per tick to avoid long locks on the hot table.

---

## ✅ Acceptance Criteria

- [x] Sweep deletes only acknowledged rows older than N days; unread rows always survive.
- [x] Window is env-configurable (default 90); route CRON_SECRET-gated; per-tick cap enforced.
- [x] Header confirms service-role delete (no DELETE policy needed); tests green.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
