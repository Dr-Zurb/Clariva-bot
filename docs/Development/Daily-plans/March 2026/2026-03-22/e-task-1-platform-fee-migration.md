# Task 1: Platform Fee Migration
## 2026-03-22 — Monetization Initiative

---

## 📋 Task Overview

Add columns to `payments` table for platform fee, GST, and doctor amount. Required for monetization: store per-transaction fee breakdown for payouts and invoicing.

**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-22

**Change Type:**
- [x] **New feature** — Add columns to payments table

**Current State:**
- ✅ **What exists:** `payments` table (008_payments.sql): id, appointment_id, gateway, gateway_order_id, gateway_payment_id, amount_minor, currency, status, created_at
- ❌ **What's missing:** platform_fee_minor, gst_minor, doctor_amount_minor
- ⚠️ **Notes:** amount_minor = gross (patient paid). New columns store our split.

**Scope Guard:**
- Expected files touched: 1–2 (migration + optionally types)

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [008_payments.sql](../../../../backend/migrations/008_payments.sql)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] 1.1 Create `backend/migrations/022_payments_platform_fee.sql` — **Completed: 2026-03-22**
  - [x] 1.1.1 Add `platform_fee_minor` BIGINT NULL (NULL for existing rows; new rows populated by e-task-3)
  - [x] 1.1.2 Add `gst_minor` BIGINT NULL
  - [x] 1.1.3 Add `doctor_amount_minor` BIGINT NULL
  - [x] 1.1.4 Add comment: `-- Clariva platform fee (5% or flat); GST 18% on fee; doctor net`
- [x] 1.2 Verify migration is reversible (document rollback if needed)

### 2. Types / Database
- [x] 2.1 Update `backend/src/types/payment.ts` — **Completed: 2026-03-22**
  - [x] 2.1.1 Add platform_fee_minor?: number | null; gst_minor?: number | null; doctor_amount_minor?: number | null to Payment interface

### 3. Verification & Testing
- [x] 3.1 Run migration against local DB (or verify syntax) — User confirmed migrated
- [x] 3.2 Type-check passes

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 022_payments_platform_fee.sql    (CREATE)
└── src/
    └── types/
        └── database.ts or payment types  (UPDATE - optional)
```

**Existing Code Status:**
- ✅ 008_payments.sql - EXISTS
- ✅ payment.ts - EXISTS (Payment interface)
- ✅ 022 migration - APPLIED (user confirmed)

---

## 🧠 Design Constraints

- All amounts in smallest unit (paise INR, cents USD)
- NULL for new columns on existing rows (backfill optional, future task)
- No RLS change; service role writes, doctor reads via existing policy

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — ALTER TABLE payments)
  - [x] **RLS verified?** (N/A — no policy change)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Migration 022 applies cleanly
- [x] payments has platform_fee_minor, gst_minor, doctor_amount_minor
- [x] Existing rows have NULL for new columns (no data loss)

---

## 🔗 Related Tasks

- [e-task-2: Platform fee config](./e-task-2-platform-fee-config.md)
- [e-task-3: Payment service platform fee](./e-task-3-payment-service-platform-fee.md)

---

**Last Updated:** 2026-03-22  
**Completed:** 2026-03-22
