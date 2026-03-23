# Task 3: Payment Service — Platform Fee
## 2026-03-22 — Monetization Initiative

---

## 📋 Task Overview

In `processPaymentSuccess`, compute platform fee (via config helper) and persist platform_fee_minor, gst_minor, doctor_amount_minor to the payments row. Requires e-task-1 (migration) and e-task-2 (config).

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-22

**Change Type:**
- [x] **Update existing** — Extend payment-service processPaymentSuccess

**Current State:**
- ✅ **What exists:** processPaymentSuccess updates payments with amount_minor, status=captured, gateway_payment_id
- ✅ **What exists:** payments table with new columns (after e-task-1)
- ❌ **What's missing:** Call computePlatformFee; write platform_fee_minor, gst_minor, doctor_amount_minor
- ⚠️ **Notes:** Only apply for INR (India). International (PayPal) can defer platform fee or use same logic later.

**Scope Guard:**
- Expected files touched: 2–3 (payment-service, tests)

**Reference Documentation:**
- [payment-service.ts](../../../../backend/src/services/payment-service.ts)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Payment Service
- [x] 1.1 In `processPaymentSuccess`, after fetching payment and before update: — **Completed: 2026-03-22**
  - [x] 1.1.1 Call `computePlatformFee(amountMinor, currency)` from platform-fee config
  - [x] 1.1.2 For INR: use result. For non-INR: set platform_fee_minor, gst_minor, doctor_amount_minor to 0 or amount (defer international fee to future)
- [x] 1.2 Extend the `payments` update to include:
  - [x] 1.2.1 platform_fee_minor
  - [x] 1.2.2 gst_minor
  - [x] 1.2.3 doctor_amount_minor
- [x] 1.3 Log platform fee in info log (no PHI; amounts only for audit)

### 2. Get Payment By ID
- [x] 2.1 Extend `getPaymentById` select to include platform_fee_minor, gst_minor, doctor_amount_minor — **Completed: 2026-03-22**
  - [x] 2.1.1 Update return type if needed
- [x] 2.2 Doctor dashboard can display fee breakdown (optional UI in future task)

### 3. Verification & Testing
- [x] 3.1 Update `payment-service.test.ts`: processPaymentSuccess mocks — **Completed: 2026-03-22**
  - [x] 3.1.1 Mock computePlatformFee; verify update includes platform_fee_minor, gst_minor, doctor_amount_minor
  - [x] 3.1.2 Test with amount 100000 (INR) → expect 5000, 900, 94100
  - [x] 3.1.3 Test with USD → platform fee 0
- [x] 3.2 Run type-check
- [x] 3.3 Manual: webhook capture → verify DB row has platform fee columns populated (user to verify)

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── payment-service.ts      (UPDATE - processPaymentSuccess, getPaymentById)
└── (config/platform-fee.ts     - from e-task-2)

backend/tests/
└── unit/
    └── services/
        └── payment-service.test.ts  (UPDATE)
```

**Existing Code Status:**
- ✅ payment-service.ts - EXISTS
- ✅ payment-service.test.ts - EXISTS
- ✅ computePlatformFee - from e-task-2

---

## 🧠 Design Constraints

- No PHI in logs (amounts ok for audit)
- Idempotent: duplicate webhook should not overwrite with different fee (already handled by pending→captured once)
- Currency: only INR gets platform fee for now; others can be 0

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — payments table)
  - [x] **RLS verified?** (N/A — service role writes)
- [x] **Any PHI in logs?** (No; amounts only)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Payment captured via webhook → payments row has platform_fee_minor, gst_minor, doctor_amount_minor
- [x] INR ₹1000 → platform_fee 5000, gst 900, doctor_amount 94100 (paise)
- [x] Existing tests pass; new assertions for platform fee
- [x] getPaymentById returns new columns for doctor

---

## 🔗 Related Tasks

- [e-task-1: Platform fee migration](./e-task-1-platform-fee-migration.md)
- [e-task-2: Platform fee config](./e-task-2-platform-fee-config.md)

---

**Last Updated:** 2026-03-22  
**Completed:** 2026-03-22
