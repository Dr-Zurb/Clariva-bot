# Task 1: Availability & Time Slots
## February 1, 2026 - Week 3: Booking System & Payments Day 1–2

---

## 📋 Task Overview

Extend the availability service for Phase 0: basic working hours, time slot calculation (e.g. 30‑min intervals), and an API to return available slots. Doctor availability can be configured via initial config or dashboard. Block booked slots when calculating available slots. No payment or confirmation yet; that is Task 3.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** _2026-01-30_

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** `availability-service.ts` (getDoctorAvailability, createAvailability, etc.); `availability` and `blocked_times` tables (001_initial_schema); `appointment-service.ts` (createAppointment, getDoctorAppointments)
- ❌ **What's missing:** Time slot calculation; get available slots API; exclusion of booked appointments and blocked times when computing slots; Zod schemas for slot query params
- ⚠️ **Notes:** Phase 0 = basic config; Full Availability Management UI is Phase 1. appointments table has patient_name, patient_phone, appointment_date, status, notes (DB_SCHEMA).

**Scope Guard:**
- Expected files touched: ≤ 6
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - Zod for input; asyncHandler; successResponse
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Controller pattern; services handle logic
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - availability, blocked_times, appointments
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - No PII in logs; audit metadata only
- [RECIPES.md](../../Reference/RECIPES.md) - R-VALIDATION-001 Zod schema pattern
- [ERROR_CATALOG.md](../../Reference/ERROR_CATALOG.md) - ValidationError (400) for invalid query
- [TESTING.md](../../Reference/TESTING.md) - Fake placeholders (PATIENT_TEST, +10000000000) for tests
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Feature completion checklist (if present)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Time Slot Calculation
- [x] 1.1 Define slot interval (e.g. 30 minutes) per product; document in config/env or constant
- [x] 1.2 Implement `getAvailableSlots(doctorId, date, correlationId, userId?)`: fetch availability for date's day_of_week; generate slots within availability windows; exclude blocked_times; exclude booked appointments
  - [x] 1.2.1 Handle multiple availability windows per day (availability allows multiple rows per doctor per day: UNIQUE on doctor_id, day_of_week, start_time, end_time)
  - [x] 1.2.2 Schema alignment: availability uses TIME; blocked_times and appointments use TIMESTAMPTZ. Combine date + availability.TIME in doctor timezone (or UTC); filter blocked_times and appointments that overlap date range (day start–end)
- [x] 1.3 Exclude slots: appointments with status IN ('pending', 'confirmed'); cancelled/completed do not block. Exclude blocked_times overlapping each slot.
- [x] 1.4 Return slots as array of `{ start: ISO string, end: ISO string, durationMinutes?: number }`; no PHI. When doctor has no availability for date, return `[]`.
- [x] 1.5 Document timezone handling: availability.TIME + date → TIMESTAMPTZ; choose doctor timezone or UTC per product

### 2. API Endpoint
- [x] 2.1 Add `GET /api/v1/appointments/available-slots?doctorId=...&date=YYYY-MM-DD`
- [x] 2.2 Controller: use asyncHandler; validate doctorId, date with Zod; call availability/booking service
- [x] 2.3 Route: create `routes/api/v1/appointments.ts`; mount under api/v1 in index; document auth: doctor-only (dashboard) or unauthenticated (patient-facing); webhook worker calls service directly (no HTTP)
- [x] 2.4 Response: `successResponse({ slots: [...] }, req)` per STANDARDS

### 3. Zod Validation
- [x] 3.1 Create Zod schema for query: doctorId (UUID), date (YYYY-MM-DD); per RECIPES R-VALIDATION-001
  - [x] 3.1.1 Reject past dates (no slots for past)
  - [x] 3.1.2 Max future range (e.g. 90 days) to prevent abuse; configurable
- [x] 3.2 Validate in controller; throw ValidationError on invalid input per ERROR_CATALOG

### 4. Compliance & Logging
- [x] 4.1 No PII in logs (only correlationId, doctorId, date)
- [x] 4.2 Audit: log "get_available_slots" or similar with metadata only per COMPLIANCE.md D

### 5. Testing & Verification
- [x] 5.1 Unit tests for slot calculation (mock availability, appointments, blocked_times); use fake placeholders (PATIENT_TEST, +10000000000) if creating appointments per TESTING.md
- [x] 5.2 Test empty availability returns `[]`
- [x] 5.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── availability-service.ts    (UPDATE - add getAvailableSlots or slot calculation)
│   └── appointment-service.ts     (USE - getDoctorAppointments for booked slots)
├── controllers/
│   └── appointment-controller.ts  (NEW - getAvailableSlots handler; asyncHandler)
├── routes/
│   └── api/v1/
│       ├── appointments.ts        (NEW - route definitions; mount GET /available-slots)
│       └── index.ts               (UPDATE - mount appointment routes)
└── utils/
    └── validation.ts              (UPDATE - availableSlotsQuerySchema per RECIPES R-VALIDATION-001)
```

**Existing Code Status:**
- ✅ `availability-service.ts` - EXISTS (getDoctorAvailability, createAvailability, etc.)
- ✅ `appointment-service.ts` - EXISTS (getDoctorAppointments with filters)
- ⚠️ `blocked_times` - table exists; availability-service or new helper may need to query it
- ❌ `appointment-controller.ts` - MISSING
- ❌ Slot calculation logic - MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller must use `asyncHandler` and `successResponse` (STANDARDS.md)
- Service layer must not import Express (ARCHITECTURE.md)
- No PII in logs (COMPLIANCE.md)
- Slot calculation: exclude appointments (status pending/confirmed) and blocked_times; respect availability windows; handle multiple windows per day
- Auth: document whether API uses doctor-only auth or unauthenticated (patient-facing); webhook worker uses service directly with service role

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y - reads availability, appointments, blocked_times) → [x] **RLS verified?** (Y - service role bypasses RLS)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)
- [x] **Auth/RLS:** Document whether getAvailableSlots API requires auth (doctor) or is patient-facing; worker uses service role

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] GET /api/v1/appointments/available-slots returns slots for valid doctorId + date
- [x] Slots exclude booked appointments (pending/confirmed) and blocked times
- [x] Empty availability for date returns `[]`
- [x] Zod validation rejects past dates and invalid query params; max future range enforced
- [x] Unit tests cover slot calculation (multiple windows, empty availability)
- [x] Type-check and lint pass

---

## 🐛 Issues Encountered & Resolved

- Fixed import path in appointments route (../../ → ../../../controllers)

---

## 📝 Notes

- Phase 0: Doctor working hours via config or manual DB insert; no UI yet
- Slot interval: 30 min recommended; document if different
- MVP may use service role for webhook-initiated flows; API may use user role (doctor) per RLS
- **Service ownership:** Slot calculation may live in availability-service or separate booking-service; monthly plan mentions booking-service; document choice (Task 2 may introduce booking-service)
- **Timezone:** availability uses TIME (no TZ); appointments/blocked_times use TIMESTAMPTZ; choose doctor timezone or UTC for slot generation

---

## 🔗 Related Tasks

- [Task 2: Appointment Booking Logic](./e-task-2-appointment-booking-logic.md)

---

**Last Updated:** 2026-02-01  
**Completed:** _2026-01-30_  
**Related Learning:** `docs/Learning/2026-02-01/l-task-1-availability-and-time-slots.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 1.1.0
