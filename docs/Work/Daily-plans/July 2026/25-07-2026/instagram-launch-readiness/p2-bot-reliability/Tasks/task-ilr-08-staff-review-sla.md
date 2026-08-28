# Task ilr-08: Staff service-review stall — SLA / escalation

> **Links:** batch [`../plan-p2-instagram-bot-reliability-batch.md`](../plan-p2-instagram-bot-reliability-batch.md) · exec [`./EXECUTION-ORDER-p2-instagram-bot-reliability.md`](./EXECUTION-ORDER-p2-instagram-bot-reliability.md)

---

## 🛑 Opus — booking funnel + doctor alerts

Patients can share PHI then wait forever on `awaiting_staff_service_confirmation`. Run on **Opus**.

---

## 📋 Task Overview

Add a non-dead-end path for staff service-review: doctor-facing alert when pending too long, and patient DM copy that sets expectation / offers a way out (wait / cancel / message clinic). Reuse existing booking-review / dashboard-events patterns where possible.

**Evidence:** `service-match.ts` ~231–234; `staff-service-review-dm.ts` ("No fixed SLA window").

**Status:** ⏳ PENDING · **Model: Opus** · ~3–4h  
**Depends on:** OQ-1 (default 24h doctor alert)

**Scope Guard:**
- Do not redesign the whole service-match AI.
- Prefer existing `service_staff_review_requests` + dashboard events + cron patterns (see alerts-v2 SLA scan).
- No PHI beyond existing Decision-4 style display names in alerts.

---

## ✅ Task Breakdown

- [ ] 1.1 Define pending-too-long predicate (created_at + N hours).
- [ ] 1.2 Cron or reuse staff-review timeouts path → insert doctor dashboard event (deduped).
- [ ] 1.3 Improve patient "still confirming" copy (expectation + optional cancel/status intent).
- [ ] 2.1 Tests: alert fires once; within-window no alert; patient copy assertions.
- [ ] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: backend/src/workers/dm/.../service-match.ts / staff-service-review-dm.ts
UPDATE/CREATE: cron or extend existing staff-review timeout job
UPDATE: dashboard-events (if new kind — may need CHECK widen → STOP for migration)
READ: booking-review SLA alert pattern (alr2-04)
```

> If a new `event_kind` is required, **surface migration** before writing (migrations hard-rule).

---

## ✅ Acceptance Criteria

- [ ] Pending staff-review cannot sit forever without doctor visibility.
- [ ] Patient copy is not a pure dead-end; tests green.

---

**Created:** 2026-07-25.
