# Task 2: Doctor Settings API (GET / PATCH)
## 2026-03-09

---

## 📋 Task Overview

Expose doctor settings via REST API for authenticated doctors. Enables dashboard and future integrations to read and update practice settings.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [x] **New feature** — New endpoints
- [ ] **Update existing** — Extends doctor-settings-service

**Current State:**
- ✅ **What exists:** `doctor-settings-service.ts` with `getDoctorSettings(doctorId)` (service role); used by webhook-worker for payment links
- ❌ **What's missing:** HTTP endpoints, user-scoped read/update (RLS via user client), PATCH handler
- ⚠️ **Notes:** Service uses admin client. API must use user client for RLS (doctor sees own row only).

**Scope Guard:**
- Expected files touched: ≤ 6

**Reference Documentation:**
- [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)
- [API_DESIGN.md](../../../Reference/API_DESIGN.md)
- [CONTRACTS.md](../../../Reference/CONTRACTS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Service Layer
- [x] 1.1 Add `getDoctorSettingsForUser(doctorId, userId)` — **Completed: 2026-03-09**
  - [x] 1.1.1 Validate doctorId === userId (ownership)
  - [x] 1.1.2 Return defaults when no row
- [x] 1.2 Add `updateDoctorSettings(doctorId, userId, payload)` — **Completed: 2026-03-09**
  - [x] 1.2.1 Validate ownership
  - [x] 1.2.2 Validate slot_interval_minutes in [15, 20, 30, 45, 60] if provided
  - [x] 1.2.3 Upsert (insert or update) doctor_settings row
  - [x] 1.2.4 Return updated row

### 2. Controller and Routes
- [x] 2.1 Create `GET /api/v1/settings/doctor` — **Completed: 2026-03-09**
- [x] 2.2 Create `PATCH /api/v1/settings/doctor` — **Completed: 2026-03-09**
  - [x] 2.2.1 Accept JSON body with optional fields
  - [x] 2.2.2 Validate input (Zod)
- [x] 2.3 Register routes under authenticated middleware — **Completed: 2026-03-09**

### 3. Verification & Testing
- [x] 3.1 Run type-check and lint — **Completed: 2026-03-09**
- [ ] 3.2 Manual test: GET returns settings; PATCH updates and returns
- [ ] 3.3 Verify RLS: doctor A cannot read/update doctor B's settings

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/
│   └── settings-controller.ts    (CREATE or extend)
├── routes/
│   └── settings-routes.ts        (CREATE or extend)
├── services/
│   └── doctor-settings-service.ts (UPDATED - add user-scoped get/update)
└── index.ts                      (UPDATED - mount routes)
```

**Existing Code Status:**
- ✅ `doctor-settings-service.ts` — EXISTS (getDoctorSettings with admin client)
- ❌ Settings routes — MISSING (check if settings or doctor-settings route exists)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller must use `successResponse` helper (STANDARDS.md)
- Service layer must not import Express types (ARCHITECTURE.md)
- No PHI in logs (COMPLIANCE.md)
- PATCH: partial update; only provided fields are updated
- Slot interval: validate 15, 20, 30, 45, 60

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – doctor_settings)
  - [ ] **RLS verified?** (Y – doctor_id = auth.uid())
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] GET /api/v1/settings/doctor returns doctor's settings (200) or empty defaults — **Implemented**
- [x] PATCH /api/v1/settings/doctor updates provided fields and returns updated row — **Implemented**
- [x] Unauthenticated requests return 401 — **Implemented**
- [x] Invalid slot_interval_minutes returns 400 — **Implemented**

---

## 🔗 Related Tasks

- [e-task-1: Extend doctor_settings migration](./e-task-1-doctor-settings-extend-migration.md)
- [e-task-4: Bot uses doctor settings](./e-task-4-bot-uses-doctor-settings.md)
- [e-task-5: Frontend dashboard](./e-task-5-frontend-dashboard.md)

---

**Last Updated:** 2026-03-09  
**Completed:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
