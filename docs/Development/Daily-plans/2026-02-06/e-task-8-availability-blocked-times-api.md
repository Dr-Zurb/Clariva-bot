# Task 8: Availability & blocked_times API
## 2026-02-06 - Must-have 2: Doctor Setup

---

## 📋 Task Overview

Expose existing availability and blocked_times via REST API so the frontend can load and update them. Implement GET/PUT for recurring weekly availability; GET/POST/DELETE for blocked_times. Timezone for the doctor can come from doctor_profiles (e-task-7) or doctor_settings; document where timezone is stored and use it when interpreting availability. All endpoints require auth; RLS and ownership checks so doctor only manages their own data.

**Estimated Time:** 2.5–3 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [x] **New feature**
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** availability-service (getDoctorAvailability, createAvailability, updateAvailability, deleteAvailability; getAvailableSlots; blocked_times: create, list, update, delete); availability and blocked_times tables (001); RLS.
- ❌ **What's missing:** REST routes and controllers for availability and blocked_times; Zod schemas for request bodies; timezone field (profile or settings) and documentation.
- ⚠️ **Notes:** Worker and booking already use availability-service directly; this task is API surface for dashboard/setup UI.

**Scope Guard:** Expected files touched: ≤ 6

**Reference Documentation:**
- [RECIPES.md](../../Reference/RECIPES.md) - Add route, controller, service
- [STANDARDS.md](../../Reference/STANDARDS.md) - asyncHandler, Zod, successResponse
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - availability (day_of_week, start_time, end_time), blocked_times (start_time, end_time TIMESTAMPTZ)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Availability API
- [ ] 1.1 GET `/api/v1/availability`: auth required; doctorId = req.user.id; call getDoctorAvailability(doctorId, correlationId, userId); return array of availability rows
- [ ] 1.2 PUT `/api/v1/availability`: auth required; body Zod: array of { day_of_week, start_time, end_time, is_available? }; replace or upsert doctor’s availability; validate times (start < end, day 0–6); call existing service create/update/delete as needed
- [ ] 1.3 Response shape per API_DESIGN; no PHI in logs

### 2. Blocked times API
- [ ] 2.1 GET `/api/v1/blocked-times` (optional query: from, to for date range): auth required; list blocked_times for doctorId = req.user.id; optional filter by date range
- [ ] 2.2 POST `/api/v1/blocked-times`: auth required; body Zod: { start_time (ISO), end_time (ISO), reason? }; create blocked time; validate end > start; call availability-service or blocked_times service
- [ ] 2.3 DELETE `/api/v1/blocked-times/:id`: auth required; delete only if doctor_id = req.user.id; 404 if not found
- [ ] 2.4 All use asyncHandler and ownership validation

### 3. Timezone
- [ ] 3.1 Document: doctor timezone stored in doctor_profiles.timezone (e-task-7) or doctor_settings; GET availability/blocked-times may return timezone in response so frontend can display in doctor’s TZ
- [ ] 3.2 Slot generation (getAvailableSlots) already uses date; ensure backend uses doctor timezone when interpreting “today” if needed (or leave as UTC and document)

### 4. Zod schemas
- [ ] 4.1 availabilityPutSchema: array of { day_of_week: 0–6, start_time: time string, end_time: time string, is_available?: boolean }
- [ ] 4.2 blockedTimePostSchema: { start_time: ISO string, end_time: ISO string, reason?: string }; optional query schema for GET from/to

### 5. Verification
- [ ] 5.1 Unit or integration tests: GET/PUT availability; GET/POST/DELETE blocked_times; reject other doctor’s id
- [ ] 5.2 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/
│   └── availability-controller.ts    (NEW - or extend appointment-controller if grouped)
├── routes/
│   └── api/v1/
│       ├── availability.ts            (NEW)
│       └── blocked-times.ts           (NEW) or single settings route
├── services/
│   └── availability-service.ts        (USE - may add small helpers if needed)
└── utils/
    └── validation.ts                  (UPDATE - Zod schemas)
```

**Existing Code Status:**
- ✅ availability-service - EXISTS (getDoctorAvailability, create, update, delete; blocked_times helpers)
- ❌ REST routes and controllers for availability/blocked_times - MISSING
- ❌ Zod schemas for these APIs - MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller uses asyncHandler; service layer does not import Express.
- RLS and validateOwnership ensure doctor only touches own data.
- Time format: availability uses TIME (HH:MM or similar); blocked_times use TIMESTAMPTZ (ISO).

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – availability, blocked_times) → [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can GET and PUT availability; GET/POST/DELETE blocked_times via API.
- [ ] Only own data is accessible; invalid body returns 400.
- [ ] Type-check and lint pass.

---

## 🔗 Related Tasks

- [e-task-7: Doctor profile backend](./e-task-7-doctor-profile-backend.md) (timezone in profile)
- [e-task-11: Frontend Setup/Settings flow](./e-task-11-frontend-setup-settings-flow.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
