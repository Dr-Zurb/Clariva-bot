# Task 5: PATCH Appointment (Status & Clinical Notes)
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

Add PATCH endpoint for appointments so doctors can update status (e.g. mark completed) and clinical_notes. Supports in-clinic appointments (no video) and manual completion. Existing updateAppointmentStatus only changes status; extend to allow clinical_notes.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-21

**Change Type:**
- [ ] **Update existing** — Extend appointment-service and controller

**Current State:**
- ✅ **What exists:** appointment-service.updateAppointmentStatus(id, status, correlationId, userId); appointment routes: GET list, GET :id only; no PATCH
- ❌ **What's missing:** PATCH /api/v1/appointments/:id; clinical_notes support
- ⚠️ **Notes:** updateAppointmentStatus updates only status. Need new updateAppointment or extend to accept optional clinical_notes.

**Scope Guard:**
- Expected files touched: ≤ 4

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md) - Audit, impact
- [RECIPES.md](../../../Reference/RECIPES.md) - Add route, validation
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Service
- [x] 1.1 Add `updateAppointment` in `backend/src/services/appointment-service.ts`
  - [x] 1.1.1 `updateAppointment(id, updates: { status?, clinical_notes? }, correlationId, userId)` — validate ownership; update only provided fields
  - [x] 1.1.2 If status is 'completed', allow setting clinical_notes in same call
  - [x] 1.1.3 Reuse validateOwnership, logDataModification
  - [x] 1.1.4 Allow clearing clinical_notes (null or empty string)
- [x] 1.2 Validation: status enum; clinical_notes max 5000 chars

### 2. Controller
- [x] 2.1 Add `patchAppointmentByIdHandler` to appointment-controller
  - [x] 2.1.1 PATCH /:id; body: { status?, clinical_notes? }; at least one required
  - [x] 2.1.2 Use asyncHandler, successResponse
- [x] 2.2 Zod schema patchAppointmentBodySchema

### 3. Routes
- [x] 3.1 Add PATCH `/:id` to appointments.ts
  - [x] 3.1.1 authenticateToken required
  - [x] 3.1.2 Mount patchAppointmentByIdHandler

### 4. Verification & Testing
- [x] 4.1 Run type-check
- [x] 4.2 Unit test: updateAppointment with status, with clinical_notes, ValidationError when empty
- [x] 4.3 RLS via ownership in service (validateOwnership)

---

## 📁 Files to Create/Update

```
backend/src/
├── controllers/
│   └── appointment-controller.ts   (UPDATE - patchAppointmentByIdHandler)
├── routes/
│   └── api/v1/
│       └── appointments.ts        (UPDATE - PATCH :id)
├── services/
│   └── appointment-service.ts     (UPDATE - updateAppointment with clinical_notes)
└── utils/
    └── validation.ts              (UPDATE - patchAppointmentBodySchema)
```

**Existing Code Status:**
- ✅ `appointment-service.ts` - EXISTS (updateAppointmentStatus)
- ✅ `appointment-controller.ts` - EXISTS
- ✅ `appointments.ts` routes - EXISTS

**When updating existing code:**
- [ ] Audit: updateAppointmentStatus callers; no breaking changes
- [ ] updateAppointment can call or replace updateAppointmentStatus internally
- [ ] Add patchAppointmentBodySchema; keep validation consistent

---

## 🧠 Design Constraints

- PATCH is partial update: only send fields that change
- clinical_notes: optional; max length per COMPLIANCE
- No PHI in logs (appointment_id only)
- successResponse with updated appointment

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — appointments)
  - [ ] **RLS verified?** (Y — ownership in service)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] PATCH /api/v1/appointments/:id with { status: 'completed' } updates status
- [x] PATCH with { clinical_notes: '...' } updates notes
- [x] PATCH with both updates both
- [x] 403 if not owner; 404 if not found (via validateOwnership, getAppointmentById pattern)

---

## 🔗 Related Tasks

- [e-task-1-consultation-migration](./e-task-1-consultation-migration.md)
- [e-task-6-frontend-appointment-video](./e-task-6-frontend-appointment-video.md)
- [TELECONSULTATION_PLAN.md](./TELECONSULTATION_PLAN.md)

---

**Last Updated:** 2026-03-21
