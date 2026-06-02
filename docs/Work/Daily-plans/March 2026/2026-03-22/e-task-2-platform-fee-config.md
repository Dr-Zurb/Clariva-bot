# Task 2: Platform Fee Config
## 2026-03-22 — Monetization Initiative

---

## 📋 Task Overview

Add env variables and config for platform fee: percent, flat amount, threshold. Enables hybrid logic: < threshold → flat fee; ≥ threshold → percent.

**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-22

**Change Type:**
- [x] **New feature** — Add env vars and config module

**Current State:**
- ✅ **What exists:** env.ts (payment gateways RAZORPAY_*, PAYPAL_*); payment.ts (selectGatewayByCountry)
- ❌ **What's missing:** Platform fee env vars; platform fee computation helper
- ⚠️ **Notes:** Fee logic: < ₹500 → ₹25; ≥ ₹500 → 5%. GST = 18% of platform fee.

**Scope Guard:**
- Expected files touched: 2–3 (env.ts, new or extended config, .env.example)

**Reference Documentation:**
- [env.ts](../../../../backend/src/config/env.ts)
- [.env.example](../../../../backend/.env.example)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Env Schema
- [x] 1.1 Add to `backend/src/config/env.ts` — **Completed: 2026-03-22**
  - [x] 1.1.1 `PLATFORM_FEE_PERCENT` — default '5', transform to number (0–100)
  - [x] 1.1.2 `PLATFORM_FEE_FLAT_MINOR` — default '2500' (₹25 in paise)
  - [x] 1.1.3 `PLATFORM_FEE_THRESHOLD_MINOR` — default '50000' (₹500 in paise); below this use flat
  - [x] 1.1.4 `PLATFORM_FEE_GST_PERCENT` — default '18' (GST rate on platform fee)
- [x] 1.2 Add to `backend/.env.example` with comments

### 2. Config / Helper
- [x] 2.1 Create `backend/src/config/platform-fee.ts` — **Completed: 2026-03-22**
  - [x] 2.1.1 `computePlatformFee(amountMinor: number, currency: string): { platformFeeMinor: number; gstMinor: number; doctorAmountMinor: number }`
  - [x] 2.1.2 Logic: if amountMinor < threshold → platformFee = flat; else platformFee = amountMinor * percent / 100
  - [x] 2.1.3 gstMinor = Math.round(platformFeeMinor * gstPercent / 100)
  - [x] 2.1.4 doctorAmountMinor = amountMinor - platformFeeMinor - gstMinor
  - [x] 2.1.5 Handle INR only for now (threshold/flat in paise); currency check optional
- [x] 2.2 Export from config index if applicable (direct import used)

### 3. Verification & Testing
- [x] 3.1 Unit test: computePlatformFee for amount < 50000, = 50000, > 50000
- [x] 3.2 Run type-check

---

## 📁 Files to Create/Update

```
backend/
├── src/
│   ├── config/
│   │   ├── env.ts              (UPDATE - add platform fee vars)
│   │   └── platform-fee.ts     (CREATE - computePlatformFee)
│   └── (optional) config/index.ts
├── .env.example                (UPDATE - document new vars)
└── tests/
    └── unit/
        └── config/
            └── platform-fee.test.ts  (CREATE)
```

**Existing Code Status:**
- ✅ env.ts - EXISTS (updated)
- ✅ .env.example - EXISTS (updated)
- ✅ platform-fee.ts - CREATED
- ✅ platform-fee.test.ts - CREATED

---

## 🧠 Design Constraints

- Amounts always in smallest unit (paise)
- Round GST to nearest integer (no fractional paise)
- Config must be readonly after startup (from env)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] computePlatformFee(25000) → platformFee 2500, gst 450, doctorAmount 22050
- [x] computePlatformFee(100000) → platformFee 5000, gst 900, doctorAmount 94100
- [x] Env defaults match finalized model (5%, ₹25, ₹500 threshold)

---

## 🔗 Related Tasks

- [e-task-1: Platform fee migration](./e-task-1-platform-fee-migration.md)
- [e-task-3: Payment service platform fee](./e-task-3-payment-service-platform-fee.md)

---

**Last Updated:** 2026-03-22  
**Completed:** 2026-03-22
