# Task 3: List Patients API
## 2026-03-27

---

## 📋 Task Overview

Add `GET /api/v1/patients` to list patients for the authenticated doctor. Patients are those who have at least one appointment or conversation with this doctor. Powers the Patients tab UI.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **New feature** — Add list endpoint, patient-service listPatientsForDoctor

**Current State:**
- ✅ **What exists:** GET /api/v1/patients/:id (single patient); getPatientForDoctor; listAppointmentsForDoctor
- ❌ **What's missing:** GET /api/v1/patients (list); listPatientsForDoctor service
- ⚠️ **Notes:** Patients table has no doctor_id. Link via appointments.patient_id and conversations.patient_id.

**Scope Guard:**
- Expected files touched: ≤ 5 (patient-service, patient-controller, routes, types, frontend api)

**Reference Documentation:**
- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Service Layer

- [x] 1.1 Add listPatientsForDoctor(doctorId, correlationId, filters?): Promise<PatientSummary[]>
  - [x] 1.1.1 Query: distinct patients from (appointments where doctor_id = X) UNION (conversations where doctor_id = X)
  - [x] 1.1.2 Join patients table for name, phone (masked?), age, gender, medical_record_number
  - [x] 1.1.3 Optional filters: search by name, date range (last appointment)
  - [x] 1.1.4 Order: by last appointment date desc, or created_at
- [x] 1.2 Define PatientSummary type: id, name, phone (last 4 digits for display?), age?, gender?, medical_record_number?, lastAppointmentDate?

### 2. Controller & Route

- [x] 2.1 Add listPatientsHandler in patient-controller
  - [x] 2.1.1 Require authenticateToken
  - [x] 2.1.2 Extract userId (doctor) from JWT
  - [x] 2.1.3 Call listPatientsForDoctor(userId, correlationId)
  - [x] 2.1.4 Return successResponse({ patients })
- [x] 2.2 Add GET / to patients routes (or GET /api/v1/patients with list handler)

### 3. API Contract

- [x] 3.1 Response shape: { success: true, data: { patients: PatientSummary[] } }
- [x] 3.2 Document in CONTRACTS.md if exists
- [x] 3.3 Frontend: add getPatients(token) in lib/api.ts

### 4. Verification & Testing

- [x] 4.1 Run type-check
- [ ] 4.2 Manual test: login as doctor, GET /api/v1/patients, verify list
- [ ] 4.3 Verify only doctor's patients returned (no cross-doctor leak)

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── patient-service.ts        (UPDATED - listPatientsForDoctor)
├── controllers/
│   └── patient-controller.ts     (UPDATED - listPatientsHandler)
└── routes/api/v1/
    └── patients.ts               (UPDATED - GET /)

frontend/
└── lib/
    └── api.ts                    (UPDATED - getPatients)
```

**Existing Code Status:**
- ✅ `patient-controller.ts` — getPatientForDoctor (single)
- ✅ `patients.ts` routes — GET /:id
- ✅ `appointment-service.ts` — listAppointmentsForDoctor
- ✅ RLS: patients accessible via conversations or appointments

---

## 🧠 Design Constraints

- Doctor may only see patients linked via their appointments or conversations (RLS-aligned)
- No PHI in logs (COMPLIANCE.md)
- Use successResponse helper (STANDARDS.md)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – read patients)
  - [x] **RLS verified?** (Y – query scoped to doctor)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] GET /api/v1/patients returns patients for authenticated doctor
- [x] Only patients with appointment or conversation with doctor
- [x] Type-check passes
- [x] Frontend getPatients() added

---

## 🔗 Related Tasks

- [e-task-4: Patients tab UI](./e-task-4-patients-tab-ui.md)
- [e-task-6: Merge patients](./e-task-6-merge-patients.md)

---

**Last Updated:** 2026-03-27  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
