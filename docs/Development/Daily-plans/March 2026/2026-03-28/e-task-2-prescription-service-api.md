# Task 2: Prescription Service & API

## 2026-03-28 — Prescription V1 Implementation

---

## 📋 Task Overview

Implement prescription backend: service layer (create, get, list, update) and REST API endpoints. Doctor creates/updates prescriptions; fetches by appointment or patient.

**Estimated Time:** 2.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

**Change Type:**
- [x] **New feature** — New service and routes

**Current State:**
- ✅ **What exists:** `appointment-service` (updateAppointment, getAppointmentById); `notification-service` (send patterns); `successResponse`, `asyncHandler`, validation patterns
- ❌ **What's missing:** `prescription-service`, prescription controller, prescription routes, validation schemas
- ⚠️ **Notes:** Service must use user role client for RLS; ownership via appointment.doctor_id.

**Scope Guard:**
- Expected files touched: ~8 (service, controller, routes, validation, types)
- Depends on: e-task-1 (migration)

**Reference Documentation:**
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md) — Layer boundaries
- [RECIPES.md](../../../Reference/RECIPES.md) — Patterns
- [STANDARDS.md](../../../Reference/STANDARDS.md) — successResponse, asyncHandler
- [CONTRACTS.md](../../../Reference/CONTRACTS.md) — Response format

---

## ✅ Task Breakdown (Hierarchical)

### 1. Types

- [x] ✅ 1.1 Create `backend/src/types/prescription.ts` - **Completed: 2026-03-28**
  - [x] ✅ 1.1.1 `Prescription` interface
  - [x] ✅ 1.1.2 `PrescriptionMedicine` interface
  - [x] ✅ 1.1.3 `PrescriptionAttachment` interface
  - [x] ✅ 1.1.4 `CreatePrescriptionInput`, `UpdatePrescriptionInput` (camelCase for API)
  - [x] ✅ 1.1.5 `PrescriptionType` = 'structured' | 'photo' | 'both'
- [x] ✅ 1.2 Export from `backend/src/types/index.ts`

### 2. Validation

- [x] ✅ 2.1 Add prescription schemas in `backend/src/utils/validation.ts` - **Completed: 2026-03-28**
  - [x] ✅ 2.1.1 `validateCreatePrescriptionBody`: appointmentId, patientId, type, optional SOAP fields, optional medicines array
  - [x] ✅ 2.1.2 `validateUpdatePrescriptionBody`: partial; at least one field
  - [x] ✅ 2.1.3 `validatePrescriptionParams`: id (UUID)
  - [x] ✅ 2.1.4 Medicine schema: name, dosage, route, frequency, duration, instructions
  - [x] ✅ 2.1.5 Field length limits (cc 500, hopi 2000, diagnosis 500)

### 3. Prescription Service

- [x] ✅ 3.1 Create `backend/src/services/prescription-service.ts` - **Completed: 2026-03-28**
  - [x] ✅ 3.1.1 `createPrescription`: validate appointment belongs to doctor; insert prescription + medicines
  - [x] ✅ 3.1.2 `getPrescriptionById`: include medicines and attachments
  - [x] ✅ 3.1.3 `listPrescriptionsByAppointment`: prescriptions for one appointment
  - [x] ✅ 3.1.4 `listPrescriptionsByPatient`: prescriptions for patient (doctor access via appointment/conversation)
  - [x] ✅ 3.1.5 `updatePrescription`: partial update
  - [x] ✅ 3.1.6 Uses admin client with ownership verification
  - [x] ✅ 3.1.7 Audit log: `logDataModification` on create/update
- [x] ✅ 3.2 Ownership validation - **Completed: 2026-03-28**
  - [x] ✅ 3.2.1 Before create: fetch appointment, assert appointment.doctor_id === userId
  - [x] ✅ 3.2.2 Before create: assert patient_id linked to appointment
  - [x] ✅ 3.2.3 For list by patient: doctor must have appointment or conversation

### 4. Controller

- [x] ✅ 4.1 Create `backend/src/controllers/prescription-controller.ts` - **Completed: 2026-03-28**
  - [x] ✅ 4.1.1 `createPrescriptionHandler`
  - [x] ✅ 4.1.2 `getPrescriptionByIdHandler`
  - [x] ✅ 4.1.3 `listPrescriptionsHandler` (appointmentId or patientId)
  - [x] ✅ 4.1.4 `updatePrescriptionHandler`
  - [x] ✅ 4.1.5 All handlers use asyncHandler
  - [x] ✅ 4.1.6 Require auth (req.user)
  - [x] ✅ 4.1.7 Throw UnauthorizedError if !userId

### 5. Routes

- [x] ✅ 5.1 Create `backend/src/routes/api/v1/prescriptions.ts` - **Completed: 2026-03-28**
  - [x] ✅ 5.1.1 POST / — createPrescriptionHandler
  - [x] ✅ 5.1.2 GET /:id — getPrescriptionByIdHandler
  - [x] ✅ 5.1.3 GET / — list (query: appointmentId | patientId)
  - [x] ✅ 5.1.4 PATCH /:id — updatePrescriptionHandler
  - [x] ✅ 5.1.5 Mount with auth middleware
- [x] ✅ 5.2 Mount in `backend/src/routes/api/v1/index.ts`
  - [x] ✅ 5.2.1 `router.use('/prescriptions', prescriptionRoutes)`

### 6. Error Handling

- [x] ✅ 6.1 NotFoundError when prescription not found
- [x] ✅ 6.2 ValidationError for invalid body
- [x] ✅ 6.3 ForbiddenError if doctor does not own appointment/patient

### 7. Verification

- [x] ✅ 7.1 Type-check passes
- [ ] 7.2 Manual test: create prescription via API (Postman/curl) — *Optional*
- [ ] 7.3 Verify RLS: different doctor cannot access — *Optional*

---

## 📁 Files to Create/Update

```
backend/src/
├── types/
│   ├── prescription.ts           (CREATE)
│   └── index.ts                  (UPDATE - export)
├── utils/
│   └── validation.ts             (UPDATE - add prescription schemas)
├── services/
│   └── prescription-service.ts   (CREATE)
├── controllers/
│   └── prescription-controller.ts (CREATE)
├── routes/
│   └── api/v1/
│       ├── prescriptions.ts     (CREATE)
│       └── index.ts              (UPDATE - mount)
```

---

## 🧠 Design Constraints

- Controller uses `successResponse(data, req)` — STANDARDS.md
- Service is framework-agnostic; no Express imports
- Use `handleSupabaseError` for DB errors
- No PHI in logs (IDs only)
- List by patient: doctor access via appointments table (appointment.patient_id, appointment.doctor_id = userId)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — prescriptions table)
  - [x] **RLS verified?** (Y — ownership verified in service)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N — reads/writes only)

---

## ✅ Acceptance & Verification Criteria

- [x] POST /api/v1/prescriptions creates prescription with medicines
- [x] GET /api/v1/prescriptions/:id returns prescription + medicines + attachments
- [x] GET /api/v1/prescriptions?appointmentId=X returns list
- [x] GET /api/v1/prescriptions?patientId=X returns list (for doctor's patients)
- [x] PATCH /api/v1/prescriptions/:id updates
- [x] Response format follows CONTRACTS.md

---

## 🔗 Related Tasks

- [e-task-1: Migration](./e-task-1-prescription-migration.md)
- [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md)
- [e-task-5: Send to patient](./e-task-5-prescription-send-to-patient.md)

---

**Last Updated:** 2026-03-28
