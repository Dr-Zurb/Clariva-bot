# Task 2: Prescription Service & API

## 2026-03-27 — Prescription V1 Implementation

---

## 📋 Task Overview

Implement prescription backend: service layer (create, get, list, update) and REST API endpoints. Doctor creates/updates prescriptions; fetches by appointment or patient.

**Estimated Time:** 2.5 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

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

- [ ] 1.1 Create `backend/src/types/prescription.ts`
  - [ ] 1.1.1 `Prescription` interface (id, appointment_id, patient_id, doctor_id, type, cc, hopi, provisional_diagnosis, investigations, follow_up, patient_education, clinical_notes, sent_to_patient_at, created_at, updated_at)
  - [ ] 1.1.2 `PrescriptionMedicine` interface
  - [ ] 1.1.3 `PrescriptionAttachment` interface
  - [ ] 1.1.4 `CreatePrescriptionInput`, `UpdatePrescriptionInput` (camelCase for API)
  - [ ] 1.1.5 `PrescriptionType` = 'structured' | 'photo' | 'both'
- [ ] 1.2 Export from `backend/src/types/index.ts`

### 2. Validation

- [ ] 2.1 Add prescription schemas in `backend/src/utils/validation.ts` (or new file per RECIPES)
  - [ ] 2.1.1 `validateCreatePrescriptionBody`: appointmentId, patientId, type, optional SOAP fields, optional medicines array
  - [ ] 2.1.2 `validateUpdatePrescriptionBody`: partial; at least one field
  - [ ] 2.1.3 `validatePrescriptionParams`: id (UUID)
  - [ ] 2.1.4 Medicine schema: name, dosage, route, frequency, duration, instructions
  - [ ] 2.1.5 Field length limits (e.g. cc 500, hopi 2000, diagnosis 500) per RECIPES

### 3. Prescription Service

- [ ] 3.1 Create `backend/src/services/prescription-service.ts`
  - [ ] 3.1.1 `createPrescription(data, correlationId, userId)`: validate appointment belongs to doctor; insert prescription + medicines; return full prescription
  - [ ] 3.1.2 `getPrescriptionById(id, correlationId, userId)`: RLS enforces ownership; include medicines and attachments
  - [ ] 3.1.3 `listPrescriptionsByAppointment(appointmentId, correlationId, userId)`: prescriptions for one appointment
  - [ ] 3.1.4 `listPrescriptionsByPatient(patientId, correlationId, userId)`: prescriptions for patient (doctor must have access via appointment/conversation)
  - [ ] 3.1.5 `updatePrescription(id, updates, correlationId, userId)`: partial update; RLS enforced
  - [ ] 3.1.6 Use `supabase` (user client) not admin for doctor operations
  - [ ] 3.1.7 Audit log: `logDataModification` on create/update
- [ ] 3.2 Ownership validation
  - [ ] 3.2.1 Before create: fetch appointment, assert appointment.doctor_id === userId
  - [ ] 3.2.2 Before create: assert patient_id is linked to that appointment (or allow from appointment)
  - [ ] 3.2.3 For list by patient: doctor must have appointment or conversation with patient (check via appointments or conversations)

### 4. Controller

- [ ] 4.1 Create `backend/src/controllers/prescription-controller.ts`
  - [ ] 4.1.1 `createPrescriptionHandler`: POST body → validateCreatePrescriptionBody → createPrescription → successResponse({ prescription })
  - [ ] 4.1.2 `getPrescriptionByIdHandler`: GET :id → validatePrescriptionParams → getPrescriptionById → 404 if not found
  - [ ] 4.1.3 `listByAppointmentHandler`: GET query appointmentId → listPrescriptionsByAppointment
  - [ ] 4.1.4 `listByPatientHandler`: GET query patientId → listPrescriptionsByPatient
  - [ ] 4.1.5 `updatePrescriptionHandler`: PATCH :id → validateUpdatePrescriptionBody → updatePrescription
  - [ ] 4.1.6 All handlers use asyncHandler; require auth (req.user)
  - [ ] 4.1.7 Throw UnauthorizedError if !userId

### 5. Routes

- [ ] 5.1 Create `backend/src/routes/api/v1/prescriptions.ts`
  - [ ] 5.1.1 POST / — createPrescriptionHandler
  - [ ] 5.1.2 GET /:id — getPrescriptionByIdHandler
  - [ ] 5.1.3 GET / — list (query: appointmentId | patientId)
  - [ ] 5.1.4 PATCH /:id — updatePrescriptionHandler
  - [ ] 5.1.5 Mount with auth middleware
- [ ] 5.2 Mount in `backend/src/routes/api/v1/index.ts`
  - [ ] 5.2.1 `router.use('/prescriptions', prescriptionRoutes)` (or similar path)

### 6. Error Handling

- [ ] 6.1 NotFoundError when prescription not found
- [ ] 6.2 ValidationError for invalid body
- [ ] 6.3 ForbiddenError if doctor does not own appointment/patient

### 7. Verification

- [ ] 7.1 Type-check passes
- [ ] 7.2 Manual test: create prescription via API (Postman/curl)
- [ ] 7.3 Verify RLS: different doctor cannot access

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

- [ ] **Data touched?** (Y — prescriptions table)
  - [ ] **RLS verified?** (Y — via Supabase user client)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N — reads/writes only)

---

## ✅ Acceptance & Verification Criteria

- [ ] POST /api/v1/prescriptions creates prescription with medicines
- [ ] GET /api/v1/prescriptions/:id returns prescription + medicines + attachments
- [ ] GET /api/v1/prescriptions?appointmentId=X returns list
- [ ] GET /api/v1/prescriptions?patientId=X returns list (for doctor's patients)
- [ ] PATCH /api/v1/prescriptions/:id updates
- [ ] Response format follows CONTRACTS.md

---

## 🔗 Related Tasks

- [e-task-1: Migration](./e-task-1-prescription-migration.md)
- [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md)
- [e-task-5: Send to patient](./e-task-5-prescription-send-to-patient.md)

---

**Last Updated:** 2026-03-27
