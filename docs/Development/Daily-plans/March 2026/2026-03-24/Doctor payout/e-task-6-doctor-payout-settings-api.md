# Task 6: Doctor Payout Settings API
## 2026-03-24 — Payout Initiative

---

## 📋 Task Overview

Expose payout schedule and linked account ID via Doctor Settings API. Doctors can GET current settings and PATCH payout_schedule, payout_minor. Linked account onboarding may be separate (Dashboard or future API).

**Estimated Time:** 1–2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-24

**Change Type:**
- [x] **New feature** — Extend doctor settings API

**Current State:**
- ✅ **What exists:** GET /api/v1/settings/doctor, PATCH /api/v1/settings/doctor; payout_schedule, payout_minor, razorpay_linked_account_id in API
- ✅ **What's done:** PATCH accepts payout_schedule, payout_minor; GET returns all three
- ⚠️ **Notes:** razorpay_linked_account_id read-only (admin-set); doctor can only update payout_schedule, payout_minor.

**Scope Guard:**
- Expected files touched: 3–4 (controller, types, validation)

**Reference Documentation:**
- [settings/doctor.ts](../../../../backend/src/routes/api/v1/settings/doctor.ts)
- [doctor-settings types](../../../../backend/src/types/doctor-settings.ts)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Types & Validation
- [x] 1.1 Update DoctorSettings type with payout_schedule?, payout_minor?, razorpay_linked_account_id?
- [x] 1.2 PatchDoctorSettingsInput: allow payout_schedule, payout_minor
- [x] 1.3 Validation: payout_schedule in ('per_appointment','daily','weekly','monthly')
- [x] 1.4 Validation: payout_minor >= 0 or null
- [x] 1.5 razorpay_linked_account_id: optionally allow in PATCH (admin flow) or keep read-only for now

### 2. API
- [x] 2.1 GET /api/v1/settings/doctor: include payout_schedule, payout_minor, razorpay_linked_account_id (masked if needed)
- [x] 2.2 PATCH /api/v1/settings/doctor: accept payout_schedule, payout_minor
- [x] 2.3 Ensure RLS allows doctor to update own row (existing policy)

### 3. Frontend (Optional / Deferred)
- [ ] 3.1 Settings page: payout schedule dropdown; min amount input
- [ ] 3.2 Document in API spec / OpenAPI

### 4. Verification & Testing
- [x] 4.1 Unit test: PATCH updates payout_schedule
- [x] 4.2 Unit test: validation rejects invalid payout_schedule

---

## 📁 Files to Create/Update

```
backend/src/
├── routes/api/v1/settings/
│   └── doctor.ts               (UPDATE)
├── controllers/
│   └── doctor-settings-controller.ts  (UPDATE)
└── types/
    └── doctor-settings.ts      (UPDATE)
```

---

## 🧠 Design Constraints

- Doctor can only update own settings
- razorpay_linked_account_id: for MVP, may be admin-set via DB or separate tool; doctor sees status (linked/not linked) only
- No PHI in response

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — doctor_settings)
  - [x] **RLS verified?** (Y — doctor owns row)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] GET returns payout_schedule, payout_minor
- [x] PATCH updates payout_schedule, payout_minor
- [x] Invalid values rejected with 400

---

## 🔗 Related Tasks

- [e-task-2: Doctor payout settings migration](./e-task-2-doctor-payout-settings.md)

---

**Last Updated:** 2026-03-24
