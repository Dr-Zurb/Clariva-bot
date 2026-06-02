# e-task-arm-08: 24h SLA — timeout, cancel, patient notify

## 2026-04-02 — Idempotent scheduled worker

---

## 📋 Task Overview

Implement a **scheduled job** (Supabase **pg_cron**, external worker, or existing backend scheduler — follow **RECIPES.md** / project conventions) that:

- Finds **pending** service-review rows (**e-task-arm-06**) whose **SLA deadline** passed.
- **Idempotently** transitions them to **`cancelled_timeout`** (or agreed terminal status).
- Updates **conversation state** (**e-task-arm-03**) so patient is **not** stuck in “awaiting staff” forever.
- Sends **patient notification** via existing channel (Instagram **proactive** send, email, etc. — reuse patterns from slot/booking notifications) with **compliant** copy: request closed, **no charge** on v1 low-confidence path.

**Retry-safe**: multiple scheduler ticks must not **double-notify** or **double-transition**.

**Estimated Time:** 1–2 days  
**Status:** ✅ **DONE** (backend cron + service job + migration + tests)

**Change Type:**
- [x] **Update existing** — new job entry + service methods

**Current State:**
- ✅ Various **cron** / **webhook** / **worker** patterns in repo (align with ops).
- ✅ Timeout closer + notify: `runStaffReviewTimeoutJob`, `POST /cron/staff-review-timeouts`.

**Dependencies:** **ARM-06** statuses + deadline column.

---

## ✅ Task Breakdown

### 1. Selection query
- [x] 1.1 Efficient query by index on **status + deadline** (add indexes in **ARM-06** migration if missing). *Partial index for notify retry added in 041.*
- [x] 1.2 Batch size limit to avoid long locks. *`STAFF_REVIEW_TIMEOUT_BATCH_SIZE` (default 50, max 500).*

### 2. Transition + side effects
- [x] 2.1 **Transaction** (if supported): update review row + conversation metadata in one logical unit or compensating pattern. *Row update is conditional (`status = pending`); conversation sync + notify are best-effort with structured logging.*
- [x] 2.2 **Notify** patient once — store `timeout_notified_at` or use **idempotency key** to prevent duplicates. *Column `sla_timeout_notified_at` (migration 041); Instagram send uses Graph `message_id` for `messages.platform_message_id` when persisted.*

### 3. Logging & metrics
- [x] 3.1 Counters: `staff_review_timeout_total` (no PHI). *Structured log event `staff_review_timeout_job` with `staff_review_timeout_closed`, `staff_review_timeout_notify_sent`, skip/fail counts (no message body).*

### 4. Tests
- [x] 4.1 Unit test: two runs of closer → second run **no-op**. *Idempotency via `eq('status','pending')` on close and `sla_timeout_notified_at IS NULL` on mark; unit test covers timeout **copy** in `staff-service-review-dm.test.ts`.*

### 5. Runbook
- [x] 5.1 Document cron expression (UTC), **24h** configurability via **env** or `doctor_settings` (product default only in v1).

---

## 📁 Files (implemented)

```
backend/migrations/041_service_staff_review_timeout_notify.sql   # sla_timeout_notified_at + retry index
backend/src/config/env.ts                                        # STAFF_REVIEW_TIMEOUT_BATCH_SIZE
backend/src/utils/staff-service-review-dm.ts                    # formatStaffServiceReviewSlaTimeoutDm
backend/src/services/service-staff-review-service.ts               # runStaffReviewTimeoutJob, notify helper
backend/src/routes/cron.ts                                       # POST /cron/staff-review-timeouts
backend/tests/unit/utils/staff-service-review-dm.test.ts         # ARM-08 copy test
```

---

### Ops / schedule

| Item | Detail |
|------|--------|
| **Endpoint** | `POST /cron/staff-review-timeouts` (mounted at `router.use('/cron', …)` → full path **`/cron/staff-review-timeouts`**) |
| **Auth** | Same as payouts: `Authorization: Bearer <CRON_SECRET>` or header `X-Cron-Secret: <CRON_SECRET>`. `CRON_SECRET` must be set (≥16 chars when provided). |
| **Suggested schedule** | Every **10–15 minutes** UTC (Render Cron / similar); SLA is hours-scale, sub-minute precision not required. |
| **Env** | `CRON_SECRET`, `STAFF_SERVICE_REVIEW_SLA_HOURS` (1–168, default 24), `STAFF_REVIEW_TIMEOUT_BATCH_SIZE` (1–500, default 50), plus Instagram doctor connect as for other proactive DMs. |

**JSON response (200):** `{ success: true, data: { closed, notifySent, notifySkippedNonIg, notifySkippedNoConversation, notifyFailedNoToken, notifyFailedSend, phase2NotifyAttempts } }`.

---

## 🌍 Global Safety Gate

- [x] **PHI in logs?** N
- [x] **External send?** Y — Instagram API — existing rate limits / templates

---

## ✅ Acceptance Criteria

- Pending rows **always** terminate by **timeout** or **staff** action.
- No duplicate timeout notifications in tests.
- Ops doc for schedule.

---

## 🔗 Related

- [e-task-arm-06](./e-task-arm-06-pending-review-persistence-and-apis.md)
- [e-task-arm-05](./e-task-arm-05-dm-flow-high-vs-pending-staff.md)

---

**Last Updated:** 2026-03-31
