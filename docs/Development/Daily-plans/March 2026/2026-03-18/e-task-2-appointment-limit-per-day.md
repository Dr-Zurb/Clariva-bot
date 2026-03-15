# Task 2: Appointment Limit Per Person Per Day
## 2026-03-18

---

## 📋 Task Overview

Enforce a limit of 1 appointment per patient per day (per doctor) to prevent spam, accidental double-booking, and abuse. When a patient already has an appointment on the selected date, reject the booking with a clear message.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-18

**Change Type:**
- [x] **Update existing** — appointment-service or slot-selection-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `bookAppointment`; `checkSlotConflict`; `hasAppointmentOnDate` (same-day same-patient check); `listAppointmentsForPatient`
- ✅ **Implemented:** hasAppointmentOnDate, pre-check in processSlotSelectionAndPay, ValidationError with user-friendly message
- ⚠️ **Notes:** Limit applies per (doctor_id, patient_id) or (doctor_id, patient_name, patient_phone) for guest bookings

**Scope Guard:**
- Expected files touched: ≤ 4 (appointment-service, slot-selection-service, validation/errors, docs)

**Reference Documentation:**
- [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../../../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md) — Design
- [DB_SCHEMA.md](../../../Reference/DB_SCHEMA.md) — appointments table

---

## ✅ Task Breakdown (Hierarchical)

### 1. Appointment Service

- [x] 1.1 Add `hasAppointmentOnDate(doctorId, patientId | { name, phone }, dateStr, correlationId): Promise<boolean>`
  - [x] 1.1.1 When patientId provided: query appointments where doctor_id, patient_id, date part of appointment_date = dateStr, status in (pending, confirmed)
  - [x] 1.1.2 When patientId null (guest): query by doctor_id, patient_name, patient_phone, date part, status
  - [x] 1.1.3 Use date-only comparison (YYYY-MM-DD); ignore time
  - [x] 1.1.4 Return true if any match
- [x] 1.2 Add `ConflictError` or new `LimitExceededError` for "already has appointment on this date"
  - [x] 1.2.1 Message: "You already have an appointment on [date]. Please choose another date or contact us if you need multiple visits."
  - [x] 1.2.2 Or use ValidationError with specific message

### 2. Slot Selection Service

- [x] 2.1 In `processSlotSelectionAndPay`, before calling `bookAppointment`
  - [x] 2.1.1 Extract dateStr from slotStart (YYYY-MM-DD)
  - [x] 2.1.2 Call hasAppointmentOnDate(doctorId, patientId ?? { name, phone }, dateStr, correlationId)
  - [x] 2.1.3 If true: throw ValidationError (or LimitExceededError) with user-friendly message
  - [x] 2.1.4 Format date in message using doctor timezone for readability
- [x] 2.2 Ensure error propagates to API; return 400 or 409 with clear message

### 3. Booking Controller

- [x] 3.1 If slot-selection throws ValidationError for limit, return 400 with message
- [x] 3.2 If using ConflictError, return 409 (consistent with slot-taken)
- [x] 3.3 Document in CONTRACTS if API contract changes

### 4. Documentation

- [x] 4.1 Update [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../../../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md) — mark implementation done
- [ ] 4.2 Add note to DB_SCHEMA or RECIPES if new query pattern

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [x] 5.2 Unit test: hasAppointmentOnDate returns true when appointment exists on date
- [x] 5.3 Unit test: hasAppointmentOnDate returns false when no appointment on date
- [ ] 5.4 Manual test: book one appointment, try to book second on same day → rejected with message

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── appointment-service.ts   (UPDATED - hasAppointmentOnDate)
│   └── slot-selection-service.ts (UPDATED - check before book)
├── utils/
│   └── errors.ts                (UPDATED - optional LimitExceededError)
└── controllers/
    └── booking-controller.ts   (UPDATED - handle limit error if needed)

backend/tests/
└── unit/services/
    └── appointment-service.test.ts  (UPDATED - hasAppointmentOnDate tests)
```

**Existing Code Status:**
- ✅ `appointment-service.ts` — Has hasAppointmentOnDate, checkSlotConflict
- ✅ `listAppointmentsForPatient` — Can be adapted or new query for date-only
- ✅ `slot-selection-service.ts` — Pre-check before bookAppointment

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Date comparison: use date part only (timezone-aware for doctor's date)
- Limit = 1 per patient per day (hardcoded for now; configurable per doctor in future)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – read appointments)
  - [x] **RLS verified?** (Y)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Patient with existing appointment on date cannot book another on same date
- [x] Error message is clear and user-friendly
- [x] Patient can still book on a different date
- [x] Guest bookings (patient_id null) checked by name+phone
- [x] No PHI in logs

---

## 🔗 Related Tasks

- [e-task-1: Booking for someone else](./e-task-1-booking-for-someone-else.md) — Independent; limit applies to both self and "booking for" flow

---

**Last Updated:** 2026-03-18  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
