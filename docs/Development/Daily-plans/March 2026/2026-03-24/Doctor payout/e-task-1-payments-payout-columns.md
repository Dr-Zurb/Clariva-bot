# Task 1: Payments Payout Columns
## 2026-03-24 — Payout Initiative

---

## 📋 Task Overview

Add payout tracking columns to `payments` table. Required for payout flow: track status, Razorpay transfer ID, and when payment was sent to doctor.

**Estimated Time:** 0.5 hour  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-24

**Change Type:**
- [x] **New feature** — Add columns to payments table

**Current State:**
- ✅ **What exists:** `payments` has platform_fee_minor, gst_minor, doctor_amount_minor (022)
- ❌ **What's missing:** payout_status, payout_id, paid_at
- ⚠️ **Notes:** Payout only after consultation verified; gateway_payment_id used for Razorpay Route transfer.

**Scope Guard:**
- Expected files touched: 2 (migration + payment types)

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [022_payments_platform_fee.sql](../../../../backend/migrations/022_payments_platform_fee.sql)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] 1.1 Create `backend/migrations/024_payments_payout_columns.sql`
  - [x] 1.1.1 Add `payout_status` TEXT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed'))
  - [x] 1.1.2 Add `payout_id` TEXT NULL (Razorpay Route transfer ID)
  - [x] 1.1.3 Add `payout_failed_reason` TEXT NULL
  - [x] 1.1.4 Add `paid_at` TIMESTAMPTZ NULL
  - [x] 1.1.5 Default payout_status = 'pending' for new rows; existing rows NULL
- [x] 1.2 Add comments for each column

### 2. Types
- [x] 2.1 Update `backend/src/types/payment.ts`
  - [x] 2.1.1 Add PayoutStatus type
  - [x] 2.1.2 Add payout_status?, payout_id?, payout_failed_reason?, paid_at? to Payment interface

### 3. Verification & Testing
- [x] 3.1 Run migration against local DB (user runs via Supabase / psql)
- [x] 3.2 Type-check passes

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 024_payments_payout_columns.sql    (CREATE)
└── src/
    └── types/
        └── payment.ts                     (UPDATE)
```

---

## 🧠 Design Constraints

- NULL for existing rows (no backfill required)
- payout_status: pending → processing → paid | failed
- No RLS change

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — ALTER TABLE payments)
  - [x] **RLS verified?** (N/A — no policy change)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Migration 024 applies cleanly
- [x] payments has payout_status, payout_id, payout_failed_reason, paid_at
- [x] Payment interface updated in types

---

## 🔗 Related Tasks

- [e-task-2: Doctor payout settings](./e-task-2-doctor-payout-settings.md)
- [e-task-4: Payout service + trigger](./e-task-4-payout-service-trigger.md)

---

**Last Updated:** 2026-03-24  
**Completed:** 2026-03-24
