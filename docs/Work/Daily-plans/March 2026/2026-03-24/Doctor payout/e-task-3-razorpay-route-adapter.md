# Task 3: Razorpay Route Adapter
## 2026-03-24 — Payout Initiative

---

## 📋 Task Overview

Create adapter for Razorpay Route — Create Transfer from Payment API. Transfers `doctor_amount_minor` from a captured payment to doctor's Linked Account. India (INR) only.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-24

**Change Type:**
- [x] **New feature** — Razorpay Route adapter + config

**Current State:**
- ✅ **What exists:** razorpay-adapter.ts (Payment Links, webhook verify); Razorpay SDK
- ❌ **What's missing:** Create Transfer from Payment; Route API integration
- ⚠️ **Notes:** Route must be enabled on Razorpay dashboard; doctors need Linked Accounts.

**Scope Guard:**
- Expected files touched: 3–4 (adapter, config, env example, types)

**Reference Documentation:**
- [Razorpay Route — Create Transfers from Payments](https://razorpay.com/docs/api/payments/route/create-transfers-payments/)
- [razorpay-adapter.ts](../../../../backend/src/adapters/razorpay-adapter.ts)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Config & Env
- [x] 1.1 Reuse RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (Route uses same Basic auth)
- [x] 1.2 Document Route enablement in Razorpay dashboard (.env.example comment)
- [x] 1.3 Update .env.example

### 2. Adapter
- [x] 2.1 Create `backend/src/adapters/razorpay-route-adapter.ts`
  - [x] 2.1.1 `createTransferFromPayment(input, correlationId?): Promise<{ transferId: string }>`
  - [x] 2.1.2 POST /payments/{paymentId}/transfers — amount in paise, currency INR
  - [x] 2.1.3 Handle errors (insufficient balance, invalid linked account, etc.)
- [ ] 2.2 Optional: webhook handler for transfer.processed / transfer.failed (future)

### 3. Types
- [x] 3.1 Add CreateTransferFromPaymentInput, CreateTransferFromPaymentResult types
- [x] 3.2 Export from adapter

### 4. Verification & Testing
- [x] 4.1 Unit test with mocked axios
- [x] 4.2 Type-check passes

---

## 📁 Files to Create/Update

```
backend/
├── src/
│   └── adapters/
│       └── razorpay-route-adapter.ts    (CREATE)
├── tests/
│   └── unit/adapters/
│       └── razorpay-route-adapter.test.ts  (CREATE)
└── .env.example                          (UPDATE)
```

---

## 🧠 Design Constraints

- INR only; non-INR payouts deferred (PayPal later)
- Idempotency: use payment_id + linked_account_id as idempotency key if supported
- No PHI in logs

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (Y — Razorpay Route API)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] createTransferFromPayment calls Razorpay Route API correctly
- [x] Returns transferId on success
- [x] Errors propagated for retry/failure handling

---

## 🔗 Related Tasks

- [e-task-4: Payout service](./e-task-4-payout-service-trigger.md)

---

**Last Updated:** 2026-03-24  
**Completed:** 2026-03-24
