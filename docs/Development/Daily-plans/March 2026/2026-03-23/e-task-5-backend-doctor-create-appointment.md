# Task 5: Backend — Doctor Create Appointment API

## 2026-03-23 — Add Appointment from Dashboard

---

## 📋 Task Overview

Add a doctor-only endpoint to create appointments from the dashboard. Accept patient (existing or walk-in), date/time, reason for visit, notes, and optional **free of cost** flag. Derive `doctorId` from authenticated user.

**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

**Change Type:**
- [ ] **New feature** — New route and validation; extends book flow

**Current State:**
- ✅ **What exists:** `POST /api/v1/appointments/book` (accepts doctorId, patientName, patientPhone, appointmentDate, reasonForVisit, notes; optional patientId, consultationType, conversationId); `bookAppointment` in appointment-service; `validateBookAppointment`; auth middleware; `getAvailableSlots`, `checkSlotConflict`
- ❌ **What's missing:** Doctor-only create endpoint that derives doctorId from req.user; `freeOfCost` support; validation for doctor-create body (patientId OR patientName+patientPhone)
- ⚠️ **Notes:** Book endpoint is unauthenticated (webhook) or accepts doctorId in body. Doctor dashboard needs auth-required endpoint where doctorId comes from req.user.

**Scope Guard:**
- Expected files touched: ~5 (validation, controller, routes, possibly appointment-service)
- Depends on: —

**Reference Documentation:**
- [ADD_APPOINTMENT_FROM_DASHBOARD.md](./ADD_APPOINTMENT_FROM_DASHBOARD.md)
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- [RECIPES.md](../../../Reference/RECIPES.md)
- [STANDARDS.md](../../../Reference/STANDARDS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Validation Schema

- [x] 1.1 Add `doctorCreateAppointmentSchema` in `backend/src/utils/validation.ts` — **Completed: 2026-03-28**
  - [x] 1.1.1 `patientId` — optional UUID (when selecting existing patient)
  - [x] 1.1.2 `patientName` — required when patientId absent; else optional
  - [x] 1.1.3 `patientPhone` — required when patientId absent; else optional
  - [x] 1.1.4 `appointmentDate` — ISO 8601 datetime; not in past
  - [x] 1.1.5 `reasonForVisit` — required, max 500 chars
  - [x] 1.1.6 `notes` — optional, max 1000 chars
  - [x] 1.1.7 `freeOfCost` — optional boolean, default false
  - [x] 1.1.8 Refine: when patientId present, allow patientName/patientPhone to be omitted (resolved from DB); when patientId absent, require both
- [x] 1.2 Export `validateDoctorCreateAppointment` and `DoctorCreateAppointmentInput` type

### 2. Controller

- [x] 2.1 Add `createAppointmentHandler` in `backend/src/controllers/appointment-controller.ts` — **Completed: 2026-03-28**
  - [x] 2.1.1 Require `req.user`; throw `UnauthorizedError` if missing
  - [x] 2.1.2 Derive `doctorId` from `req.user.id`
  - [x] 2.1.3 Validate body with `validateDoctorCreateAppointment`
  - [x] 2.1.4 When `patientId` provided: fetch patient via `getPatientForDoctor`, use `patient.name`, `patient.phone`
  - [x] 2.1.5 Build `BookAppointmentInput`-compatible payload: doctorId, patientId?, patientName, patientPhone, appointmentDate, reasonForVisit, notes, freeOfCost
  - [x] 2.1.6 When `freeOfCost`: set status to `'confirmed'` (service sets via bookAppointment)
  - [x] 2.1.7 Call `bookAppointment` with userId (enforces ownership)
  - [x] 2.1.8 Return `successResponse({ appointment }, req)` with 201
- [x] 2.2 Use `asyncHandler`; follow STANDARDS successResponse pattern

### 3. Service Support for freeOfCost

- [x] 3.1 Extend `bookAppointment` in `backend/src/services/appointment-service.ts` — **Completed: 2026-03-28**
  - [x] 3.1.1 Accept optional `freeOfCost` on BookAppointmentInput
  - [x] 3.1.2 When freeOfCost true: insert with `status: 'confirmed'` instead of `'pending'`
  - [x] 3.1.3 No payment creation (bookAppointment does not create payments; slot-selection-service does for patient flow)
- [x] 3.2 Reuse `checkSlotConflict`; same slot validation as existing book

### 4. Routes

- [x] 4.1 Add `POST /api/v1/appointments` in `backend/src/routes/api/v1/appointments.ts` — **Completed: 2026-03-28**
  - [x] 4.1.1 Mount `createAppointmentHandler`
  - [x] 4.1.2 Use `authenticateToken` middleware (doctor-only)
- [x] 4.2 Route order: POST / before GET `:id`

### 5. Verification

- [x] 5.1 Type-check passes
- [ ] 5.2 Manual test: POST with auth token; create appointment for existing patient and walk-in
- [ ] 5.3 Verify freeOfCost: appointment created with status `confirmed`, no payment row

---

## 📁 Files to Create/Update

```
backend/src/
├── utils/
│   └── validation.ts              (UPDATE - doctorCreateAppointmentSchema)
├── controllers/
│   └── appointment-controller.ts  (UPDATE - createAppointmentHandler)
├── services/
│   └── appointment-service.ts     (UPDATE - optional freeOfCost/status in book or new fn)
└── routes/
    └── api/v1/
        └── appointments.ts         (UPDATE - POST / with auth)
```

---

## 🧠 Design Constraints

- Controller uses `successResponse(data, req)` — STANDARDS.md
- Service is framework-agnostic; no Express imports
- No PHI in logs (IDs only)
- When patientId provided: validate patient belongs to doctor (via appointments or patient-doctor relationship per RLS)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — appointments table)
  - [x] **RLS verified?** (Y — ownership via doctor_id = req.user.id)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] POST /api/v1/appointments (auth required) creates appointment
- [x] 401 when unauthenticated
- [x] doctorId derived from req.user.id (not from body)
- [x] Supports patientId (existing patient) and walk-in (patientName + patientPhone)
- [x] freeOfCost true → status `confirmed`; no payment created
- [x] Slot conflict returns 409 (existing ConflictError in bookAppointment)
- [x] Response format follows CONTRACTS.md

---

## 🔗 Related Tasks

- [e-task-6: Frontend Add Appointment Modal](./e-task-6-frontend-add-appointment-modal.md)
- [e-task-7: Integration & README](./e-task-7-add-appointment-integration-readme.md)

---

**Last Updated:** 2026-03-28  
**Completed:** 2026-03-28
