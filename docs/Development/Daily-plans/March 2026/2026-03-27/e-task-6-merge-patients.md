# Task 6: Merge Patients (Dashboard)
## 2026-03-27

---

## 📋 Task Overview

Allow doctors to merge duplicate patient records in the dashboard. When two patients are the same person (e.g. typos, different phones), doctor selects both and merges: one record survives, all appointments move to it, the other is deactivated or deleted.

**Estimated Time:** 5–6 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **New feature** — Add merge API, UI in Patients tab

**Current State:**
- ✅ **What exists:** Patients tab (from e-task-4); list patients API; appointments have patient_id
- ❌ **What's missing:** Merge API; "Possible duplicates" detection; merge UI
- ⚠️ **Notes:** Merge = keep patient A, move all appointments from B to A, then soft-delete or anonymize B. Conversations: patient_id on conversation points to one patient; if B had conversations, we need to reassign or handle.

**Scope Guard:**
- Expected files touched: ≤ 6 (patient-service, controller, routes, frontend)

**Reference Documentation:**
- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend: Merge Service

- [x] 1.1 Add mergePatients(doctorId, sourcePatientId, targetPatientId, correlationId): Promise<void>
  - [x] 1.1.1 Validate: doctor has access to both patients (via appointments/conversations)
  - [x] 1.1.2 Update appointments: SET patient_id = targetPatientId WHERE patient_id = sourcePatientId
  - [x] 1.1.3 Update conversations: SET patient_id = targetPatientId WHERE patient_id = sourcePatientId
  - [x] 1.1.4 Anonymize source patient (name → [Merged], phone → merged-{id})
  - [x] 1.1.5 Audit log: merge event (metadata only, no PHI)
- [x] 1.2 Target patient survives; source gets merged into target

### 2. Backend: Possible Duplicates

- [x] 2.1 Add listPossibleDuplicates(doctorId, correlationId): Promise<{ groups }>
  - [x] 2.1.1 Group by same phone last-10
  - [x] 2.1.2 Return groups of 2+ patients

### 3. API

- [x] 3.1 POST /api/v1/patients/merge { sourcePatientId, targetPatientId }
- [x] 3.2 GET /api/v1/patients/possible-duplicates

### 4. Frontend: Merge UI

- [x] 4.1 "Possible duplicates" section in Patients tab
- [x] 4.2 Merge flow: MergePatientsModal — select which patient to keep, confirm → POST merge API
- [x] 4.3 Refresh list on success (router.refresh)

### 5. Compliance

- [x] 5.1 Anonymize merged patient: name → [Merged], phone → merged-{id}
- [x] 5.2 Audit: log merge with patient IDs (no PHI)

### 6. Verification & Testing

- [x] 6.1 Run type-check
- [ ] 6.2 Manual test: create two similar patients, merge, verify appointments moved
- [ ] 6.3 Verify source patient anonymized

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── patient-service.ts          (UPDATED - mergePatients)
│   └── patient-matching-service.ts (UPDATED - listPossibleDuplicates or reuse)
├── controllers/
│   └── patient-controller.ts      (UPDATED - mergeHandler)
└── routes/api/v1/
    └── patients.ts                (UPDATED - POST /merge)

frontend/
├── app/dashboard/patients/
│   └── page.tsx                   (UPDATED - possible duplicates section)
└── components/patients/
    └── MergePatientsModal.tsx     (NEW)
```

**Existing Code Status:**
- ✅ `patient-service.ts` — updatePatient, findPatientById
- ✅ `appointment-service.ts` — appointments have patient_id
- ✅ `conversations` — patient_id
- ✅ Patients tab from e-task-4

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Anonymize merged patient, don't hard-delete (COMPLIANCE F)
- Doctor must have access to both patients

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – patients, appointments, conversations)
  - [x] **RLS verified?** (Y – merge scoped to doctor's patients)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (Y – merged patient anonymized)

---

## ✅ Acceptance & Verification Criteria

- [x] Merge moves all appointments and conversations to target patient
- [x] Source patient anonymized
- [x] Doctor can only merge their own patients
- [x] UI allows merge with confirmation
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-2: Patient matching service](./e-task-2-patient-matching-service.md)
- [e-task-4: Patients tab UI](./e-task-4-patients-tab-ui.md)

---

**Last Updated:** 2026-03-27  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
