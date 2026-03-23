# Task 4: Prescription Form UI

## 2026-03-27 — Prescription V1 Implementation

---

## 📋 Task Overview

Build the prescription form component below the video call section on the appointment detail page. Doctor can fill structured SOAP (CC, HOPI, diagnosis, plan) and medications, or upload photo, or both. Save draft and Send to patient.

**Estimated Time:** 3 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [x] **New feature** — New component; extends appointment detail page

**Current State:**
- ✅ **What exists:** `AppointmentConsultationActions` with VideoRoom, PatientJoinLink, MarkCompletedForm; `MarkCompletedForm` has clinical_notes + Mark completed; appointment detail page at `/dashboard/appointments/[id]`
- ❌ **What's missing:** PrescriptionForm component; entry mode (structured/photo/both); medications list; photo upload UI; integration with MarkCompletedForm area
- ⚠️ **Notes:** Form appears in "Post-consultation" block; placement: below video, alongside or above MarkCompletedForm. Use existing patterns from MarkCompletedForm (patchAppointment, onSuccess, error state).

**Scope Guard:**
- Expected files touched: ~6 (components, lib/api, types)
- Depends on: e-task-2 (API), e-task-3 (upload URL API)

**Reference Documentation:**
- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md) — UI mockup
- [MarkCompletedForm](../../../../frontend/components/consultation/MarkCompletedForm.tsx)
- [AppointmentConsultationActions](../../../../frontend/components/consultation/AppointmentConsultationActions.tsx)
- [FRONTEND_STANDARDS.md](../../../Reference/FRONTEND_STANDARDS.md)
- [DEFINITION_OF_DONE_FRONTEND.md](../../../Reference/DEFINITION_OF_DONE_FRONTEND.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. API Client (Frontend)

- [ ] 1.1 Add to `frontend/lib/api.ts`
  - [ ] 1.1.1 `createPrescription(token, payload)` — POST /api/v1/prescriptions
  - [ ] 1.1.2 `getPrescription(token, id)` — GET /api/v1/prescriptions/:id
  - [ ] 1.1.3 `listPrescriptionsByAppointment(token, appointmentId)` — GET ?appointmentId=
  - [ ] 1.1.4 `updatePrescription(token, id, payload)` — PATCH
  - [ ] 1.1.5 `getPrescriptionUploadUrl(token, prescriptionId, { filename, contentType })` — POST .../attachments/upload-url
  - [ ] 1.1.6 `registerPrescriptionAttachment(token, prescriptionId, { filePath, fileType, caption })` — POST .../attachments
  - [ ] 1.1.7 `getPrescriptionDownloadUrl(token, prescriptionId, attachmentId)` — GET .../attachments/:id/download-url
- [ ] 1.2 Add types in `frontend/types/prescription.ts`
  - [ ] 1.2.1 Prescription, PrescriptionMedicine, PrescriptionAttachment
  - [ ] 1.2.2 CreatePrescriptionPayload, UpdatePrescriptionPayload

### 2. PrescriptionForm Component

- [ ] 2.1 Create `frontend/components/consultation/PrescriptionForm.tsx`
  - [ ] 2.1.1 Props: appointmentId, patientId, token, onSuccess?, existingPrescription?
  - [ ] 2.1.2 State: entry mode (structured | photo | both); form fields; medicines array; attachments; saving; error
  - [ ] 2.1.3 Entry mode selector: radio or tabs "Structured" | "Photo only" | "Both"
- [ ] 2.2 Structured section (when mode is structured or both)
  - [ ] 2.2.1 CC (Chief Complaint): text input, placeholder
  - [ ] 2.2.2 HOPI (History of Present Illness): textarea
  - [ ] 2.2.3 Assessment: provisional diagnosis — text input
  - [ ] 2.2.4 Plan: investigations, follow-up, patient education — text inputs/textarea
  - [ ] 2.2.5 Medications: dynamic list; each row: name, dosage, route, frequency, duration, instructions
  - [ ] 2.2.6 [+ Add medicine] button; [x] remove per row
  - [ ] 2.2.7 Collapsible sections optional for V1 (can be flat)
- [ ] 2.3 Photo section (when mode is photo or both)
  - [ ] 2.3.1 File input (accept image/*, .pdf) or drag-drop
  - [ ] 2.3.2 On select: create prescription if not exists; get upload URL; upload file; register attachment
  - [ ] 2.3.3 Show thumbnails of uploaded images; remove button
  - [ ] 2.3.4 Support multiple files (max 5 per prescription)
- [ ] 2.4 Actions
  - [ ] 2.4.1 "Save draft" — create/update prescription without sending; no sent_to_patient_at
  - [ ] 2.4.2 "Save & send to patient" — create/update + trigger send (e-task-5)
  - [ ] 2.4.3 Disabled states while saving; loading indicators
- [ ] 2.5 Error display: inline error message (role="alert")
- [ ] 2.6 Accessibility: labels, focus management, aria-live for errors

### 3. Medicine Row Component

- [ ] 3.1 Create `MedicineRow` or inline in PrescriptionForm
  - [ ] 3.1.1 Inputs: medicine name, dosage, route (e.g. Oral/Topical), frequency (BD/TDS/etc.), duration, instructions
  - [ ] 3.1.2 Route/frequency: text input with placeholder "e.g. Oral, BD"
  - [ ] 3.1.3 Remove button
- [ ] 3.2 Empty state: at least one empty row or [+ Add]

### 4. Photo Upload Flow

- [ ] 4.1 On file select
  - [ ] 4.1.1 If no prescription exists: create prescription first (type photo or both)
  - [ ] 4.1.2 Call getPrescriptionUploadUrl
  - [ ] 4.1.3 PUT file to uploadUrl (fetch with method PUT, body: file)
  - [ ] 4.1.4 Call registerPrescriptionAttachment with filePath
  - [ ] 4.1.5 Refresh prescription data or update local state
- [ ] 4.2 Progress indicator (optional for V1)
- [ ] 4.3 Error handling: file too large, upload failed, invalid type

### 5. Integration with Appointment Page

- [ ] 5.1 Add PrescriptionForm to `AppointmentConsultationActions.tsx`
  - [ ] 5.1.1 Place below video + patient link; above or beside MarkCompletedForm
  - [ ] 5.1.2 Section title: "Prescription & clinical note"
  - [ ] 5.1.3 Show when: consultationStarted OR appointment.status is pending/confirmed/completed (doctor can add Rx anytime post-consult)
  - [ ] 5.1.4 Pass appointmentId, patientId (from appointment.patient_id), token
- [ ] 5.2 Load existing prescription
  - [ ] 5.2.1 On mount: listPrescriptionsByAppointment; if any, show most recent in form (edit mode)
  - [ ] 5.2.2 Allow creating new prescription if doctor wants second (e.g. follow-up note); V1: single prescription per appointment or allow multiple — decide per plan
- [ ] 5.3 Coordination with MarkCompletedForm
  - [ ] 5.3.1 PrescriptionForm and MarkCompletedForm are siblings; both in "Post-consultation" block
  - [ ] 5.3.2 Doctor can Save draft prescription without marking completed
  - [ ] 5.3.3 Doctor can Mark completed independently (existing flow)
  - [ ] 5.3.4 Optional: "Save & send" could trigger Mark completed — document decision

### 6. Styling & UX

- [ ] 6.1 Match existing design: rounded borders, gray-50 bg for sections
- [ ] 6.2 Responsive: stack on mobile
- [ ] 6.3 No PHI in URLs or client storage beyond session
- [ ] 6.4 Definition of done: a11y, no console errors, type-check passes

### 7. Verification

- [ ] 7.1 Create structured prescription; save draft; verify in API
- [ ] 7.2 Upload photo; verify in Storage and DB
- [ ] 7.3 Edit existing prescription; update
- [ ] 7.4 Save & send — triggers e-task-5 flow

---

## 📁 Files to Create/Update

```
frontend/
├── lib/
│   └── api.ts                          (UPDATE - prescription API)
├── types/
│   └── prescription.ts                 (CREATE)
├── components/
│   └── consultation/
│       ├── PrescriptionForm.tsx        (CREATE)
│       ├── MedicineRow.tsx             (CREATE - or inline)
│       └── AppointmentConsultationActions.tsx (UPDATE - add PrescriptionForm)
```

---

## 🧠 Design Constraints

- No PHI in client logs, sessionStorage, or URL params
- Use existing fetch patterns from lib/api (Bearer token, API_BASE)
- Form state: controlled components
- Follow FRONTEND_STANDARDS (Tailwind, semantic HTML)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — prescription creation)
  - [ ] **RLS verified?** (Y — backend enforces)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can fill CC, HOPI, diagnosis, plan, medications
- [ ] Doctor can add/remove medicine rows
- [ ] Doctor can upload 1+ photos
- [ ] Save draft persists to backend
- [ ] Save & send triggers send flow (e-task-5)
- [ ] Form integrates on appointment detail page
- [ ] Type-check and lint pass

---

## 🔗 Related Tasks

- [e-task-2: Prescription API](./e-task-2-prescription-service-api.md)
- [e-task-3: Photo storage](./e-task-3-prescription-photo-storage.md)
- [e-task-5: Send to patient](./e-task-5-prescription-send-to-patient.md)

---

**Last Updated:** 2026-03-27
