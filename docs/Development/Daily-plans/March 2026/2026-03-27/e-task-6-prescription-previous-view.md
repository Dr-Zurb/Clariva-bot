# Task 6: Previous Prescriptions View

## 2026-03-27 — Prescription V1 Implementation

---

## 📋 Task Overview

Show previous prescriptions for the patient on the appointment detail page. Doctor sees last 2–3 prescriptions when viewing an appointment; link to view all prescriptions for that patient.

**Estimated Time:** 1.5 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

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

- [ ] 1.1 Create `frontend/components/consultation/PreviousPrescriptions.tsx`
  - [ ] 1.1.1 Props: patientId, appointmentId, token, limit?: number (default 3)
  - [ ] 1.1.2 Fetch: listPrescriptionsByPatient(patientId) or listPrescriptionsByAppointment(appointmentId)
  - [ ] 1.1.3 Decision: For appointment view, show prescriptions for this patient (not just this appointment) — use listPrescriptionsByPatient; filter or sort by most recent
  - [ ] 1.1.4 Display: last 2–3 prescriptions as cards or list
  - [ ] 1.1.5 Each item: date, diagnosis (truncated), type (structured/photo/both), "View" link
  - [ ] 1.1.6 "View all" link → /dashboard/patients/[patientId]/prescriptions (or modal — V1: link to patient prescriptions tab)
- [ ] 1.2 Loading and empty state
  - [ ] 1.2.1 Loading spinner or skeleton
  - [ ] 1.2.2 Empty: "No previous prescriptions" or hide section
- [ ] 1.3 "View" action
  - [ ] 1.3.1 V1: Expand inline to show full prescription (CC, diagnosis, meds, attachments)
  - [ ] 1.3.2 Or: Navigate to prescription detail page — GET /prescriptions/:id and show in modal/drawer
  - [ ] 1.3.3 For photo attachments: show download URL and render image
- [ ] 1.4 "Copy from previous" (optional V1)
  - [ ] 1.4.1 Button "Use as template" — prefill form with that prescription's data
  - [ ] 1.4.2 Call onCopyFromPrevious(prescription) callback to parent PrescriptionForm
  - [ ] 1.4.3 Mark as optional for V1; can defer to V2

### 2. Placement on Appointment Page

- [ ] 2.1 Add PreviousPrescriptions to appointment detail page
  - [ ] 2.1.1 Place above PrescriptionForm (so doctor sees history before writing new)
  - [ ] 2.1.2 Section title: "Previous prescriptions for this patient"
  - [ ] 2.1.3 Only show when patient_id is present (appointment has linked patient)
  - [ ] 2.1.4 Pass patientId, appointmentId, token
- [ ] 2.2 Exclude current appointment's prescriptions from "previous"?
  - [ ] 2.2.1 "Previous" = prescriptions from other appointments
  - [ ] 2.2.2 Or include all (current + past) — doctor sees everything
  - [ ] 2.2.3 Simpler: show all prescriptions for patient; most recent first. Current appointment's prescription will appear when created.

### 3. Patient Prescriptions Tab (V1 Scope)

- [ ] 3.1 Add "Prescriptions" section to patient detail page
  - [ ] 3.1.1 Patient page: `/dashboard/patients/[id]`
  - [ ] 3.1.2 Add tab or section "Prescriptions" — list all prescriptions for this patient
  - [ ] 3.1.3 Use listPrescriptionsByPatient
  - [ ] 3.1.4 Same card/list UI as PreviousPrescriptions
  - [ ] 3.1.5 Check if patient page exists; if not, "View all" can link to filtered appointments list for now — document
- [ ] 3.2 Fallback: "View all" links to appointments list filtered by patient — each appointment can show its prescriptions. Simpler for V1.

### 4. API: List by Patient

- [ ] 4.1 Verify listPrescriptionsByPatient returns correct data
  - [ ] 4.1.1 Ordered by created_at DESC
  - [ ] 4.1.2 Include medicines and attachments count or full data
- [ ] 4.2 Pagination (optional V1): limit 20; offset for "load more"

### 5. Verification

- [ ] 5.1 Appointment with patient: previous prescriptions section visible
- [ ] 5.2 Appointment without patient: section hidden or "Link patient to see history"
- [ ] 5.3 View expands or navigates correctly
- [ ] 5.4 No PHI in URLs (prescription ID is UUID, OK)

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

- [ ] **Data touched?** (Y — read prescriptions)
  - [ ] **RLS verified?** (Y — backend)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Previous prescriptions (last 2–3) visible on appointment detail when patient linked
- [ ] Doctor can view full prescription
- [ ] "View all" link works (patient prescriptions or fallback)
- [ ] Empty state handled

---

## 🔗 Related Tasks

- [e-task-2: Prescription API](./e-task-2-prescription-service-api.md)
- [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md)

---

**Last Updated:** 2026-03-27
