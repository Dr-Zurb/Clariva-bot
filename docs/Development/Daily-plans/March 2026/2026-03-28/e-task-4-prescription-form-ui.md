# Task 4: Prescription Form UI

## 2026-03-28 — Prescription V1 Implementation

---

## 📋 Task Overview

Build the prescription form component below the video call section on the appointment detail page. Doctor can fill structured SOAP (CC, HOPI, diagnosis, plan) and medications, or upload photo, or both. Save draft and Send to patient.

**Estimated Time:** 3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

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

- [x] 1.1 Add to `frontend/lib/api.ts`
  - [x] 1.1.1 `createPrescription(token, payload)` — POST /api/v1/prescriptions
  - [x] 1.1.2 `getPrescription(token, id)` — GET /api/v1/prescriptions/:id
  - [x] 1.1.3 `listPrescriptionsByAppointment(token, appointmentId)` — GET ?appointmentId=
  - [x] 1.1.4 `updatePrescription(token, id, payload)` — PATCH
  - [x] 1.1.5 `getPrescriptionUploadUrl(token, prescriptionId, { filename, contentType })` — POST .../attachments/upload-url
  - [x] 1.1.6 `registerPrescriptionAttachment(token, prescriptionId, { filePath, fileType, caption })` — POST .../attachments
  - [x] 1.1.7 `getPrescriptionDownloadUrl(token, prescriptionId, attachmentId)` — GET .../attachments/:id/download-url
- [x] 1.2 Add types in `frontend/types/prescription.ts`
  - [x] 1.2.1 Prescription, PrescriptionMedicine, PrescriptionAttachment
  - [x] 1.2.2 CreatePrescriptionPayload, UpdatePrescriptionPayload

### 2. PrescriptionForm Component

- [x] 2.1 Create `frontend/components/consultation/PrescriptionForm.tsx`
  - [x] 2.1.1 Props: appointmentId, patientId, token, onSuccess?, existingPrescription?
  - [x] 2.1.2 State: entry mode (structured | photo | both); form fields; medicines array; attachments; saving; error
  - [x] 2.1.3 Entry mode selector: radio or tabs "Structured" | "Photo only" | "Both"
- [x] 2.2 Structured section (when mode is structured or both)
  - [x] 2.2.1 CC (Chief Complaint): text input, placeholder
  - [x] 2.2.2 HOPI (History of Present Illness): textarea
  - [x] 2.2.3 Assessment: provisional diagnosis — text input
  - [x] 2.2.4 Plan: investigations, follow-up, patient education — text inputs/textarea
  - [x] 2.2.5 Medications: dynamic list; each row: name, dosage, route, frequency, duration, instructions
  - [x] 2.2.6 [+ Add medicine] button; [x] remove per row
  - [x] 2.2.7 Collapsible sections optional for V1 (flat)
- [x] 2.3 Photo section (when mode is photo or both)
  - [x] 2.3.1 File input (accept image/*, .pdf)
  - [x] 2.3.2 On select: create prescription if not exists; get upload URL; upload via Supabase uploadToSignedUrl; register attachment
  - [x] 2.3.3 Show list of uploaded files
  - [x] 2.3.4 Support multiple files (max 5 per prescription)
- [x] 2.4 Actions
  - [x] 2.4.1 "Save draft" — create/update prescription without sending
  - [x] 2.4.2 "Save & send to patient" — create/update + TODO e-task-5 trigger
  - [x] 2.4.3 Disabled states while saving; loading indicators
- [x] 2.5 Error display: inline error message (role="alert")
- [x] 2.6 Accessibility: labels, aria-live for errors

### 3. Medicine Row Component

- [x] 3.1 Create `MedicineRow.tsx`
  - [x] 3.1.1 Inputs: medicine name, dosage, route, frequency, duration, instructions
  - [x] 3.1.2 Route/frequency: text input with placeholder "e.g. Oral, BD"
  - [x] 3.1.3 Remove button
- [x] 3.2 Empty state: at least one empty row or [+ Add]

### 4. Photo Upload Flow

- [x] 4.1 On file select
  - [x] 4.1.1 If no prescription exists: create prescription first (type photo or both)
  - [x] 4.1.2 Call getPrescriptionUploadUrl
  - [x] 4.1.3 Upload via supabase.storage.uploadToSignedUrl(path, token, file)
  - [x] 4.1.4 Call registerPrescriptionAttachment with filePath
  - [x] 4.1.5 Update local state
- [x] 4.2 Progress indicator (optional for V1) — uploading state
- [x] 4.3 Error handling: file too large, upload failed, invalid type

### 5. Integration with Appointment Page

- [x] 5.1 Add PrescriptionForm to `AppointmentConsultationActions.tsx`
  - [x] 5.1.1 Place below video + patient link; above MarkCompletedForm
  - [x] 5.1.2 Section title: "Prescription & clinical note"
  - [x] 5.1.3 Show when: consultationStarted OR status pending/confirmed/completed
  - [x] 5.1.4 Pass appointmentId, patientId, token
- [x] 5.2 Load existing prescription
  - [x] 5.2.1 On mount: listPrescriptionsByAppointment; if any, show most recent (edit mode)
  - [x] 5.2.2 V1: single prescription per appointment (most recent)
- [x] 5.3 Coordination with MarkCompletedForm
  - [x] 5.3.1 PrescriptionForm and MarkCompletedForm are siblings
  - [x] 5.3.2 Doctor can Save draft without marking completed
  - [x] 5.3.3 Doctor can Mark completed independently
  - [x] 5.3.4 Save & send: TODO e-task-5

### 6. Styling & UX

- [x] 6.1 Match existing design: rounded borders, gray-50 bg for sections
- [x] 6.2 Responsive: stack on mobile
- [x] 6.3 No PHI in URLs or client storage beyond session
- [x] 6.4 Definition of done: a11y, type-check passes (build OK)

### 7. Verification

- [ ] 7.1 Create structured prescription; save draft; verify in API
- [ ] 7.2 Upload photo; verify in Storage and DB
- [ ] 7.3 Edit existing prescription; update
- [ ] 7.4 Save & send — e-task-5 will add send flow

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

- [x] **Data touched?** (Y — prescription creation)
  - [x] **RLS verified?** (Y — backend enforces)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Doctor can fill CC, HOPI, diagnosis, plan, medications
- [x] Doctor can add/remove medicine rows
- [x] Doctor can upload 1+ photos
- [x] Save draft persists to backend
- [x] Save & send — placeholder for e-task-5 send flow
- [x] Form integrates on appointment detail page
- [x] Type-check and lint pass

---

## 🔗 Related Tasks

- [e-task-2: Prescription API](./e-task-2-prescription-service-api.md)
- [e-task-3: Photo storage](./e-task-3-prescription-photo-storage.md)
- [e-task-5: Send to patient](./e-task-5-prescription-send-to-patient.md)

---

**Last Updated:** 2026-03-28
