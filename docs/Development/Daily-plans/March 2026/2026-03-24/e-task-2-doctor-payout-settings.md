# Task 2: Doctor Payout Settings Migration
## 2026-03-24 — Payout Initiative

---

## 📋 Task Overview

Add payout schedule and account details to doctor settings. Doctors choose: per appointment, daily, weekly, or monthly. Store Razorpay linked account ID for Route transfers.

**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-24

**Change Type:**
- [x] **New feature** — Add columns to doctor_settings

**Current State:**
- ✅ **What exists:** doctor_settings (009, 012): appointment_fee_minor, country, timezone, etc.
- ❌ **What's missing:** payout_schedule, payout_minor (min threshold), razorpay_linked_account_id
- ⚠️ **Notes:** Razorpay Route requires Linked Account; doctor onboarded via Dashboard or API.

**Scope Guard:**
- Expected files touched: 2 (migration + doctor-settings types)

**Reference Documentation:**
- [Razorpay Route — Linked Accounts](https://razorpay.com/docs/payments/route/linked-account/)
- [009_doctor_settings.sql](../../../../backend/migrations/009_doctor_settings.sql)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] 1.1 Create `backend/migrations/025_doctor_settings_payout.sql`
  - [x] 1.1.1 Add `payout_schedule` TEXT NULL CHECK (payout_schedule IN ('per_appointment', 'daily', 'weekly', 'monthly'))
  - [x] 1.1.2 Add `payout_minor` BIGINT NULL (min amount before payout; e.g. 10000 = ₹100; NULL = no min)
  - [x] 1.1.3 Add `razorpay_linked_account_id` TEXT NULL (Route Linked Account ID for India doctors)
  - [x] 1.1.4 Add comments
- [x] 1.2 No RLS change (doctor owns row; service role reads for payout job)

### 2. Types
- [x] 2.1 Update doctor-settings or database types
  - [x] 2.1.1 Add PayoutSchedule type
  - [x] 2.1.2 Add payout_schedule?, payout_minor?, razorpay_linked_account_id? to DoctorSettings

### 3. Verification & Testing
- [x] 3.1 Run migration (user runs via Supabase / psql)
- [x] 3.2 Type-check passes

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 025_doctor_settings_payout.sql    (CREATE)
└── src/
    ├── types/
    │   └── doctor-settings.ts            (UPDATE)
    └── services/
        └── doctor-settings-service.ts    (UPDATE - SELECT_COLUMNS, DEFAULT_SETTINGS)
```

---

## 🧠 Design Constraints

- payout_schedule NULL = default to 'weekly' (or env) in payout service
- razorpay_linked_account_id required for India (Razorpay) payouts; skip if null
- payout_minor: avoid tiny transfers; NULL = pay any amount

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — ALTER TABLE doctor_settings)
  - [x] **RLS verified?** (N/A — no policy change)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Migration 025 applies cleanly
- [x] doctor_settings has payout_schedule, payout_minor, razorpay_linked_account_id
- [x] Types updated

---

## 🔗 Related Tasks

- [e-task-4: Payout service](./e-task-4-payout-service-trigger.md)
- [e-task-6: Doctor payout settings API](./e-task-6-doctor-payout-settings-api.md)

---

**Last Updated:** 2026-03-24  
**Completed:** 2026-03-24
