# Task alr2-04: Emitter — `booking_review_sla_breach` scan (backend)

> **Filename:** `task-alr2-04-emitter-sla-breach-scan.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## 🛑 Opus — new scan + PHI payload + idempotency

New emitter over a booking (money-adjacent) surface. Run on **Opus**.

## 📋 Task Overview

Emit a `booking_review_sla_breach` (action-needed) dashboard event when a booking-review request passes its `sla_deadline_at` while still `pending`. Because a breach is a *time-passing* condition (no user action fires at the breach instant), this is a **scan** job, not a lifecycle hook.

**Program / Batch:** alerts-v2 · Wave 4
**Estimated Time:** ~2–3 hours
**Status:** ✅ Complete (2026-07-21). **Model: Opus.**
**Change Type:** ✅ New scan job + one `insertDashboardEvent` call.
**Depends on:** `alr2-01` (kind legal), `alr2-02` (payload + `dedupeKey`).

**Current State:**
- ✅ `runBookingReviewSlaAlertJob` in `booking-review-sla-alert-service.ts`.
- ✅ Mounted at `POST /cron/booking-review-sla-alerts` (OQ-2 locked: cron route).
- ✅ Notify-only — does not mutate review rows / timeout logic.

**Scope Guard:**
- **DO NOT** change the SLA timeout/close logic (`runStaffReviewTimeoutJob`) — this only *notifies*, it doesn't resolve.
- **DO NOT** emit for non-breached or already-resolved requests.
- **DO NOT** add new PHI beyond `patient_display_name` + date labels + the opaque `review_request_id` (ALR2-D7).
- Resolve **OQ-2** here (default: mount as a `routes/cron.ts` job next to `staff-review-timeouts`, not an in-process interval).

---

## ✅ Task Breakdown

### 1. Scan job
- [x] 1.1 New `runBookingReviewSlaAlertJob(correlationId)`: select pending + `sla_deadline_at < now()` (cap 50); dedupe via `(doctor_id, dedupe_key)`.
- [x] 1.2 For each, `insertDashboardEvent({ … eventKind:'booking_review_sla_breach', dedupeKey: reviewRequestId })` with action-needed payload.
- [x] 1.3 Cap rows per tick; per-row failures counted, not fatal (return 200 totals).

### 2. Mount (OQ-2)
- [x] 2.1 `POST /cron/booking-review-sla-alerts` on `routes/cron.ts` (`verifyCronAuth`); schedule note: every ~15 min alongside `staff-review-timeouts`.

### 3. Tests
- [x] 3.1 Breached-pending → one event; re-run → deduped.
- [x] 3.2 Empty scan → no event; insert failure counted, batch continues.
- [x] 3.3 Cron route: bad secret → 401; success → 200 totals.

### 4. Verification
- [x] 4.1 type-check + eslint clean for the slice.
- [x] 4.2 Tests **7/7** green (`booking-review-sla-alert` pattern).

---

## 📁 Files to Create/Update

```
CREATE: backend/src/services/booking-review-sla-alert-service.ts
UPDATE: backend/src/routes/cron.ts                                     (POST /cron/booking-review-sla-alerts)
CREATE: backend/tests/unit/services/booking-review-sla-alert-service.test.ts
CREATE: backend/tests/unit/routes/booking-review-sla-alerts-cron.test.ts
READ:   backend/src/services/dashboard-insights-service.ts#getBookingFunnel
READ:   backend/src/services/service-staff-review-service.ts
DO NOT TOUCH: SLA timeout/close logic; migration; frontend
```

---

## 🧠 Design Constraints

- **Notify, don't resolve** — never mutate the review request; the timeout job owns that.
- **Idempotent** — dedupe on `review_request_id`; re-scans are no-ops.
- **Action-needed** severity; deep-link (→ `/dashboard/booking-review`) rendered in `alr2-06`.

---

## ✅ Acceptance Criteria

- [x] Breached-pending review requests emit exactly one `booking_review_sla_breach` event each; re-scans don't duplicate.
- [x] No event for empty/non-breached scans; SLA timeout logic untouched.
- [x] Cron route CRON_SECRET-gated; payload carries no new PHI; tests green.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
