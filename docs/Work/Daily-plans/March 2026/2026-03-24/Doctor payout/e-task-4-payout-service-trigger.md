# Task 4: Payout Service + Trigger on Verified
## 2026-03-24 — Payout Initiative

---

## 📋 Task Overview

Create payout service that processes single-payment payouts. Wire `tryMarkVerified` to trigger per-appointment payout when doctor's schedule is 'per_appointment'. Core logic reused by batch job (e-task-5).

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-24

**Change Type:**
- [x] **New feature** — Payout service; update consultation-verification-service

**Current State:**
- ✅ **What exists:** tryMarkVerified in consultation-verification-service; processPaymentSuccess
- ❌ **What's missing:** Payout service; trigger on verified
- ⚠️ **Notes:** Only for gateway=razorpay, INR; doctor must have razorpay_linked_account_id.

**Scope Guard:**
- Expected files touched: 4–5 (payout-service, consultation-verification, env, types)

**Reference Documentation:**
- [consultation-verification-service.ts](../../../../backend/src/services/consultation-verification-service.ts)
- [payment-service.ts](../../../../backend/src/services/payment-service.ts)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Payout Service
- [x] 1.1 Create `backend/src/services/payout-service.ts`
  - [x] 1.1.1 `processPayoutForPayment(paymentId: string, correlationId: string): Promise<{ success: boolean }>`
  - [x] 1.1.2 Load payment (status=captured, payout_status=pending), appointment (verified_at set), doctor_settings
  - [x] 1.1.3 Guard: gateway=razorpay, currency=INR, doctor_amount_minor > 0
  - [x] 1.1.4 Guard: doctor has razorpay_linked_account_id
  - [x] 1.1.5 Guard: payout_minor threshold if set (skip if doctor_amount < payout_minor)
  - [x] 1.1.6 Set payout_status='processing'; call Razorpay Route createTransferFromPayment
  - [x] 1.1.7 On success: payout_status='paid', payout_id=transferId, paid_at=now
  - [x] 1.1.8 On failure: payout_status='failed', payout_failed_reason
- [x] 1.2 Call processPayoutForPayment directly (sync for MVP)

### 2. Trigger on Verified
- [x] 2.1 In `tryMarkVerified`, after performUpdate succeeds:
  - [x] 2.1.1 Load appointment's payment (captured) and doctor's payout_schedule
  - [x] 2.1.2 If payout_schedule='per_appointment', call processPayoutForPayment
  - [x] 2.1.3 If daily/weekly/monthly: no action (batch job handles)

### 3. Job Queue (Optional for MVP)
- [ ] 3.1 If using existing worker queue: add payout job type (deferred)
- [x] 3.2 Call processPayoutForPayment directly (MVP)

### 4. Verification & Testing
- [x] 4.1 Unit test: processPayoutForPayment skips when no linked account
- [x] 4.2 Unit test: processPayoutForPayment skips when gateway != razorpay, payout_status=paid
- [x] 4.3 tryMarkVerified triggers payout when per_appointment (mocked; payments return null in tests)

---

## 📁 Files to Create/Update

```
backend/
├── src/services/
│   ├── payout-service.ts                    (CREATE)
│   └── consultation-verification-service.ts (UPDATE)
└── tests/unit/services/
    ├── payout-service.test.ts               (CREATE)
    └── consultation-verification-service.test.ts (UPDATE - mock payout)
```

---

## 🧠 Design Constraints

- Idempotent: check payout_status before processing
- No PHI in logs
- Default payout_schedule: 'weekly' if NULL

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — payments, appointments read; payments updated)
  - [x] **RLS verified?** (N/A — service role)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (Y — Razorpay Route)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Verified consultation with per_appointment → payout triggered
- [x] Payment updated with payout_status, payout_id, paid_at on success
- [x] Skips gracefully when no linked account or non-INR

---

## 🔗 Related Tasks

- [e-task-1: Payments payout columns](./e-task-1-payments-payout-columns.md)
- [e-task-2: Doctor payout settings](./e-task-2-doctor-payout-settings.md)
- [e-task-3: Razorpay Route adapter](./e-task-3-razorpay-route-adapter.md)
- [e-task-5: Scheduled batch payouts](./e-task-5-scheduled-batch-payouts.md)

---

**Last Updated:** 2026-03-24  
**Completed:** 2026-03-24
