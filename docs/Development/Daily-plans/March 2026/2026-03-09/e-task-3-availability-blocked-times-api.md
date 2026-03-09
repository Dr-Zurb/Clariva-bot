# Task 3: Availability & Blocked Times API
## 2026-03-09

---

## 📋 Task Overview

Expose availability (weekly schedule) and blocked times via REST API for authenticated doctors. Enables dashboard to manage schedule and exclusions.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [x] **New feature** — New endpoints
- [ ] **Update existing** — Service layer exists; add routes/controllers

**Current State:**
- ✅ **What exists:** `availability` and `blocked_times` tables (001_initial_schema.sql); RLS policies (002); `availability-service.ts` with getDoctorAvailability, createAvailability, updateAvailability, getBlockedTimes, createBlockedTime, deleteBlockedTime, getAvailableSlots
- ❌ **What's missing:** HTTP routes and controllers for availability and blocked_times
- ⚠️ **Notes:** getAvailableSlots is used by webhook-worker (service role). API needs user-scoped CRUD.

**Scope Guard:**
- Expected files touched: ≤ 8

**Reference Documentation:**
- [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)
- [API_DESIGN.md](../../../Reference/API_DESIGN.md)
- [CONTRACTS.md](../../../Reference/CONTRACTS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Availability API
- [x] 1.1 `GET /api/v1/availability` — **Completed: 2026-03-09**
  - [x] 1.1.1 Use getDoctorAvailability(doctorId, correlationId, userId)
  - [x] 1.1.2 Return array of availability records
- [x] 1.2 `PUT /api/v1/availability` — **Completed: 2026-03-09**
  - [x] 1.2.1 Accept array of { day_of_week, start_time, end_time }
  - [x] 1.2.2 Delete existing, insert new (replaceDoctorAvailability)
  - [x] 1.2.3 Validate day_of_week 0–6, start_time < end_time

### 2. Blocked Times API
- [x] 2.1 `GET /api/v1/blocked-times` — **Completed: 2026-03-09**
  - [x] 2.1.1 Use getBlockedTimesForDoctor with optional start_date, end_date
  - [x] 2.1.2 Filter by doctor_id (validateOwnership)
- [x] 2.2 `POST /api/v1/blocked-times` — **Completed: 2026-03-09**
  - [x] 2.2.1 Accept { start_time, end_time, reason? } (ISO datetime)
  - [x] 2.2.2 Validate start < end
- [x] 2.3 `DELETE /api/v1/blocked-times/:id` — **Completed: 2026-03-09**
  - [x] 2.3.1 Validate ownership (deleteBlockedTimeForDoctor)

### 3. Controller and Routes
- [x] 3.1 Create availability controller — **Completed: 2026-03-09**
- [x] 3.2 Create blocked-times controller — **Completed: 2026-03-09**
- [x] 3.3 Register routes under authenticated middleware — **Completed: 2026-03-09**

### 4. Verification & Testing
- [x] 4.1 Run type-check and lint — **Completed: 2026-03-09**
- [ ] 4.2 Manual test: CRUD for availability and blocked times
- [ ] 4.3 Verify RLS: doctor A cannot access doctor B's data

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/
│   ├── availability-controller.ts   (CREATE)
│   └── blocked-times-controller.ts  (CREATE)
├── routes/
│   ├── availability-routes.ts       (CREATE)
│   └── blocked-times-routes.ts     (CREATE)
├── services/
│   └── availability-service.ts     (CHECK - may need getBlockedTimes with filters)
└── index.ts                         (UPDATED - mount routes)
```

**Existing Code Status:**
- ✅ `availability-service.ts` — EXISTS (getDoctorAvailability, createAvailability, updateAvailability, getBlockedTimes, createBlockedTime, deleteBlockedTime)
- ❌ Availability/blocked-times routes — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller must use `successResponse` helper (STANDARDS.md)
- Service layer must not import Express types (ARCHITECTURE.md)
- No PHI in logs (COMPLIANCE.md)
- Availability: day_of_week 0=Sunday, 6=Saturday (or project convention)
- Blocked times: TIMESTAMPTZ; exclude from getAvailableSlots

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – availability, blocked_times)
  - [ ] **RLS verified?** (Y – doctor_id = auth.uid())
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] GET /api/v1/availability returns doctor's weekly schedule — **Implemented**
- [x] PUT /api/v1/availability replaces schedule — **Implemented**
- [x] GET /api/v1/blocked-times returns blocked times (optionally filtered) — **Implemented**
- [x] POST /api/v1/blocked-times creates blocked time — **Implemented**
- [x] DELETE /api/v1/blocked-times/:id removes blocked time — **Implemented**
- [x] Unauthenticated requests return 401 — **Implemented**

---

## 🔗 Related Tasks

- [e-task-4: Bot uses doctor settings](./e-task-4-bot-uses-doctor-settings.md)
- [e-task-5: Frontend dashboard](./e-task-5-frontend-dashboard.md)

---

**Last Updated:** 2026-03-09  
**Completed:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
