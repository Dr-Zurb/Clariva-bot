# Task 5: Scheduled Batch Payout Jobs
## 2026-03-24 — Payout Initiative

---

## 📋 Task Overview

Implement scheduled jobs for daily, weekly, and monthly batched payouts. For each doctor with schedule=daily|weekly|monthly, sum verified unpaid payments in the period and create one transfer. Uses doctor's timezone for period boundaries.

**Estimated Time:** 2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-24

**Change Type:**
- [x] **New feature** — Cron/scheduled job for batch payouts

**Current State:**
- ✅ **What exists:** processPayoutForPayment (single payment); Razorpay Route adapter; processBatchedPayouts; getPeriodForSchedule; POST /cron/payouts
- ✅ **What's done:** Batch job; period logic (yesterday, last week, last month); Option B (multiple Payment transfers)
- ⚠️ **Notes:** Implemented Option B — batch job loops payments, calls processPayoutForPayment for each.

**Scope Guard:**
- Expected files touched: 2–3 (payout-service, cron/worker)

**Reference Documentation:**
- [Razorpay Route — Direct Transfer](https://razorpay.com/docs/api/payments/route/direct-transfers/)
- [payout-service.ts](../../../../backend/src/services/payout-service.ts) (after e-task-4)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Batch Logic
- [x] 1.1 Add `processBatchedPayouts(schedule: 'daily'|'weekly'|'monthly', correlationId: string)`
  - [x] 1.1.1 Find doctors with payout_schedule = schedule and razorpay_linked_account_id set
  - [x] 1.1.2 For each doctor: compute period (yesterday, last Mon-Sun, last month) in doctor's timezone
  - [x] 1.1.3 Query: payments where appointment.doctor_id, status=captured, payout_status=pending, appointment.verified_at in period
  - [x] 1.1.4 Sum doctor_amount_minor; skip if < payout_minor (or 0)
  - [x] 1.1.5 Create transfer: Razorpay Route Direct Transfer to linked account (or multiple Payment transfers — see Design Note)
  - [x] 1.1.6 Mark all contributing payments as paid (payout_status, payout_id, paid_at)
- [x] 1.2 Design decision: Route Direct Transfer (one transfer, sum amount) vs multiple Payment transfers (one per payment). Implemented Option B — multiple Payment transfers.

### 2. Period Helpers
- [x] 2.1 Add `getPeriodForSchedule(schedule, tz): { start: Date, end: Date }`
  - [x] 2.1.1 daily: yesterday 00:00–23:59 in tz
  - [x] 2.1.2 weekly: last Monday 00:00 – Sunday 23:59 in tz
  - [x] 2.1.3 monthly: last month 1st 00:00 – last day 23:59 in tz

### 3. Cron / Scheduler
- [x] 3.1 Add cron job (Render cron, node-cron, or external): daily 02:00 IST → processBatchedPayouts('daily')
- [x] 3.2 Weekly: Monday 02:00 IST → processBatchedPayouts('weekly')
- [x] 3.3 Monthly: 1st 02:00 IST → processBatchedPayouts('monthly')
- [x] 3.4 Or single job that runs daily and processes all three (check date for weekly/monthly)

### 4. Verification & Testing
- [x] 4.1 Unit test: period calculation for each schedule
- [x] 4.2 Unit test: batch skips doctor with no pending payments

---

## 📁 Files to Create/Update

```
backend/
├── src/
│   ├── services/
│   │   └── payout-service.ts      (UPDATE - add batch logic) ✅
│   ├── routes/
│   │   └── cron.ts               (CREATE - cron entry point) ✅
│   └── config/
│       └── env.ts                (UPDATE - CRON_SECRET) ✅
└── render.yaml or similar        (optional - cron via Render Dashboard)
```

---

## 🧠 Design Constraints

- Use doctor_settings.timezone; default Asia/Kolkata if null
- Idempotent: only process payout_status=pending
- Consider payout_runs table for audit (optional)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — payments)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (Y — Razorpay Route)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Daily job pays doctors with schedule=daily for yesterday's verified payments
- [x] Weekly job pays for last week
- [x] Monthly job pays for last month
- [x] Timezone respected for period boundaries

---

## 🔗 Related Tasks

- [e-task-4: Payout service](./e-task-4-payout-service-trigger.md)
- [e-task-6: Doctor payout settings API](./e-task-6-doctor-payout-settings-api.md)

---

## 📝 Design Note: Direct Transfer vs Multiple Payment Transfers

**Option A — Direct Transfer:** One transfer per doctor per period. Requires Route Direct Transfer (request Razorpay support). Simpler, one credit to doctor.

**Option B — Multiple Payment Transfers:** For each payment in period, call createTransferFromPayment. Multiple credits to doctor (one per consultation). Works with existing Route "Transfer via Payments" API.

Recommendation: Start with **Option B** (multiple transfers) — no extra Razorpay enablement. Batch job loops payments, calls processPayoutForPayment for each (or bulk-create). Doctor receives multiple credits; reconciliation via payout_id per payment.

---

**Last Updated:** 2026-03-24
