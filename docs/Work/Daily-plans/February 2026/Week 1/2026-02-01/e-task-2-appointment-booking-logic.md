# Task 2: Appointment Booking Logic
## February 1, 2026 - Week 3: Booking System & Payments Day 2–3

---

## 📋 Task Overview

Implement appointment booking logic with double-booking prevention, Zod validation, and atomicity. Create `POST /api/v1/appointments/book` and `GET /api/v1/appointments/:id`. For multi-step operations (appointment + audit), use Postgres rpc() or compensating logic per STANDARDS. Booking confirmation via Instagram DM is Task 3.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** _2026-01-30_

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** `appointment-service.ts` (createAppointment, getDoctorAppointments); `availability-service.ts`; Task 1 delivers getAvailableSlots; appointments table
- ❌ **What's missing:** Double-booking prevention (check slot not taken before insert); POST /api/v1/appointments/book; GET /api/v1/appointments/:id; Zod schemas for book payload; atomicity (rpc or compensating)
- ⚠️ **Notes:** appointments: patient_name, patient_phone, appointment_date, status, notes. COMPLIANCE: no PII in logs; audit metadata only; RLS doctor-only.

**Scope Guard:**
- Expected files touched: ≤ 6
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Services Architecture: rpc() or compensating logic for multi-step
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Controller pattern; services handle logic
- [DB_SCHEMA.md](../../Reference/engineering/architecture/DB_SCHEMA.md) - appointments table
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - Audit (changedFields only, no values); no PII in logs
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - R-VALIDATION-001 (createAppointmentSchema, getAppointmentParamsSchema)
- [ERROR_CATALOG.md](../../Reference/engineering/development/ERROR_CATALOG.md) - ConflictError (409), ValidationError (400), NotFoundError (404)
- [TESTING.md](../../Reference/engineering/development/TESTING.md) - Fake placeholders (PATIENT_TEST, +10000000000) for tests

---

## ✅ Task Breakdown (Hierarchical)

### 1. Double-Booking Prevention
- [x] 1.1 Before createAppointment: verify slot is still available (query appointments for doctor + date range overlapping requested slot)
- [x] 1.2 If slot taken: throw ConflictError (409) with clear message (e.g. "This time slot is no longer available")
- [x] 1.3 Use env.SLOT_INTERVAL_MINUTES (Task 1) for overlap check; same duration as getAvailableSlots
- [x] 1.4 Document choice: application-level check (Phase 0) vs database constraint (UNIQUE on doctor_id + appointment_date)

### 2. Book API
- [x] 2.1 Add `POST /api/v1/appointments/book` with body: doctorId, patientName, patientPhone, appointmentDate (ISO), notes (optional)
- [x] 2.2 Controller: use asyncHandler; validate with Zod; map camelCase → snake_case (patient_name, patient_phone); call appointment-service; return successResponse
- [x] 2.3 Service: validate slot available; create appointment; audit log (metadata only). Support optional userId (webhook worker uses service role when no userId)
- [x] 2.4 Zod schema: reuse patientNameSchema, patientPhoneSchema from validation.ts; doctorId (UUID); appointmentDate (ISO datetime, reject past); notes (optional, max 500)
- [x] 2.5 Auth: POST /book may be called by webhook worker (service role, no userId) or doctor dashboard (JWT, userId); document and support both

### 3. Get Appointment API
- [x] 3.1 Add `GET /api/v1/appointments/:id`
- [x] 3.2 Controller: use getAppointmentParamsSchema (RECIPES) for id (UUID); call getAppointmentById; return successResponse
- [x] 3.3 Service: get single appointment; validate ownership (doctor_id = userId); return 404 if not found or not owner (don't leak existence)
- [x] 3.4 Auth: requires authenticated doctor (userId); return 401 if unauthenticated

### 4. Atomicity
- [x] 4.1 For create: if using multi-step (appointment + audit), use Postgres rpc() or ensure compensating logic on failure per STANDARDS
- [x] 4.2 Phase 0: single insert + audit log may be sufficient; document if rpc needed for stricter atomicity

### 5. Compliance & Logging
- [x] 5.1 No PII in logs (only correlationId, appointmentId, doctorId, resource IDs)
- [x] 5.2 Audit: log create/read with metadata only; changedFields if applicable, no values (COMPLIANCE D)

### 6. Testing & Verification
- [x] 6.1 Unit tests for double-book prevention; createAppointment; getAppointmentById; use fake placeholders (PATIENT_TEST, +10000000000) per TESTING.md
- [x] 6.2 Test GET /:id returns 404 when appointment not found or user not owner
- [x] 6.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── appointment-service.ts    (UPDATE - add getAppointmentById; double-book check; bookAppointment with optional userId)
├── controllers/
│   └── appointment-controller.ts  (UPDATE - add book, getById handlers)
├── routes/
│   └── api/v1/
│       └── appointments.ts       (UPDATE - add POST /book, GET /:id)
└── utils/
    └── validation.ts             (UPDATE - bookAppointmentSchema; reuse patientNameSchema, patientPhoneSchema)
```

**Existing Code Status:**
- ✅ `appointment-service.ts` - EXISTS (createAppointment, getDoctorAppointments)
- ⚠️ `appointment-controller.ts` - May exist from Task 1 (getAvailableSlots)
- ❌ getAppointmentById - MISSING
- ❌ Double-booking check - MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller must use `asyncHandler` and `successResponse` (STANDARDS.md)
- Service must not import Express (ARCHITECTURE.md)
- No PII in logs (COMPLIANCE.md)
- Multi-step: rpc() or compensating logic per STANDARDS Services Architecture
- DB schema: patient_name, patient_phone, notes (no reason); API uses camelCase, map to snake_case for InsertAppointment

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y - appointments) → [x] **RLS verified?** (Y - service role for book/getById)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)
- [x] **Auth/RLS:** Document POST /book (webhook worker vs doctor); GET /:id (doctor-only, requires auth)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] POST /api/v1/appointments/book creates appointment when slot available
- [x] POST returns 409 (ConflictError) when slot already booked
- [x] GET /api/v1/appointments/:id returns appointment for owner
- [x] GET /:id returns 404 when appointment not found or user not owner
- [x] Zod validation rejects invalid payload
- [x] Unit tests cover booking, double-book prevention, getById (404 cases)
- [x] Type-check and lint pass

---

## 🐛 Issues Encountered & Resolved

- None. Tests pass; type-check passes; lint has pre-existing warnings (no errors).

---

## 📝 Notes

- patient_name, patient_phone come from collected data (Task 4/5) when booking from conversation flow
- API may be called by doctor dashboard or by webhook worker (service role); document auth model
- **Slot duration:** Use env.SLOT_INTERVAL_MINUTES for double-book overlap check (same as Task 1)
- **Webhook worker:** Calls bookAppointment directly (service role) without HTTP; optional userId; document

---

## 🔗 Related Tasks

- [Task 1: Availability & Time Slots](./e-task-1-availability-and-time-slots.md)
- [Task 3: Booking Flow & Instagram Confirmation](./e-task-3-booking-flow-and-instagram-confirmation.md)

---

**Last Updated:** 2026-02-01  
**Completed:** _2026-01-30_  
**Related Learning:** `docs/Archive/learning/2026-02-01/l-task-2-appointment-booking-logic.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 1.1.0
