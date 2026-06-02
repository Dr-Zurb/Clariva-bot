# Task 6: Previous Prescriptions View

## 2026-03-28 — Prescription V1 Implementation

---

## 📋 Task Overview

Show previous prescriptions for the patient on the appointment detail page. Doctor sees last 2–3 prescriptions when viewing an appointment; link to view all prescriptions for that patient.

**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

**Change Type:**
- [x] **New feature** — New UI component and API usage

**Current State:**
- ✅ **What exists:** `listPrescriptionsByPatient` API (e-task-2); `listPrescriptionsByAppointment` API; appointment detail page has patient_id
- ❌ **What's missing:** UI to display previous prescriptions; "View all" link
- ⚠️ **Notes:** Only show prescriptions for patients the doctor has access to (via appointments). API already enforces this.

**Scope Guard:**
- Expected files touched: ~3 (component, appointment page, maybe list API)
- Depends on: e-task-2, e-task-4

**Reference Documentation:**
- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md) — Patient History section
- [e-task-2](./e-task-2-prescription-service-api.md) — listPrescriptionsByPatient

---

## ✅ Task Breakdown (Hierarchical)

### 1. Previous Prescriptions Component

- [x] 1.1 Create `frontend/components/consultation/PreviousPrescriptions.tsx`
  - [x] 1.1.1 Props: patientId, appointmentId, token, limit (default 3)
  - [x] 1.1.2 Fetch: listPrescriptionsByPatient(patientId)
  - [x] 1.1.3 Display: last 3 prescriptions, most recent first
  - [x] 1.1.4 Each item: date, diagnosis (truncated), type, View button
  - [x] 1.1.5 "View all" link → /dashboard/patients/[patientId]#prescriptions
- [x] 1.2 Loading and empty state
- [x] 1.3 "View" action: expand inline (CC, diagnosis, meds, attachments)
- [x] 1.4 Attachments: View image/file link (fetches download URL on click)
- [ ] 1.5 "Copy from previous" — deferred to V2

### 2. Placement on Appointment Page

- [x] 2.1 Add PreviousPrescriptions to AppointmentConsultationActions
  - [x] 2.1.1 Place above PrescriptionForm
  - [x] 2.1.2 Only show when patient_id present
- [x] 2.2 Show all prescriptions for patient (most recent first)

### 3. Patient Prescriptions Tab (V1 Scope)

- [x] 3.1 Add PatientPrescriptions component to patient detail page
  - [x] 3.1.1 Patient page: `/dashboard/patients/[id]`
  - [x] 3.1.2 Section "Prescriptions" with id="prescriptions" for anchor
  - [x] 3.1.3 Same expand/collapse UI as PreviousPrescriptions
- [x] 3.2 "View all" links to patient page #prescriptions

### 4. API: List by Patient

- [x] 4.1 Added listPrescriptionsByPatient to frontend API
- [x] 4.2 Backend returns full prescriptions with medicines/attachments

### 5. Verification

- [ ] 5.1 Appointment with patient: previous prescriptions section visible
- [ ] 5.2 Appointment without patient: section hidden
- [ ] 5.3 View expands; attachment links open in new tab
- [ ] 5.4 No PHI in URLs

---

## 📁 Files to Create/Update

```
frontend/
├── components/
│   └── consultation/
│       ├── PreviousPrescriptions.tsx  (CREATE)
│       └── ...
├── app/
│   └── dashboard/
│       └── appointments/
│           └── [id]/
│               └── page.tsx         (UPDATE - add PreviousPrescriptions)
└── app/
    └── dashboard/
        └── patients/
            └── [id]/
                └── page.tsx         (UPDATE - add Prescriptions section, if exists)
```

---

## 🧠 Design Constraints

- Only show when patient_id exists
- Reuse API from e-task-2
- Match existing UI patterns

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — read prescriptions)
  - [x] **RLS verified?** (Y — backend)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Previous prescriptions (last 3) visible on appointment detail when patient linked
- [x] Doctor can view full prescription (expand inline)
- [x] "View all" link to patient page #prescriptions
- [x] Empty state handled

---

## 🔗 Related Tasks

- [e-task-2: Prescription API](./e-task-2-prescription-service-api.md)
- [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md)

---

**Last Updated:** 2026-03-28
