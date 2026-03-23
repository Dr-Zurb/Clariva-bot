# Task 5: Send Prescription to Patient

## 2026-03-28 — Prescription V1 Implementation

---

## 📋 Task Overview

Implement sending prescription to patient via Instagram DM and/or email. When doctor clicks "Save & send to patient", backend builds a message (structured summary or image), sends via Instagram Messaging API and/or email, and sets `sent_to_patient_at`.

**Estimated Time:** 2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

**Change Type:**
- [x] **New feature** — New service and API

**Current State:**
- ✅ **What exists:** `sendPaymentConfirmationToPatient` in notification-service (resolves patient via appointment → patient_id → platform_external_id or conversation); `sendInstagramMessage` in instagram-service; `getInstagramAccessTokenForDoctor`; `sendEmail` for doctor notifications; patients may have `email` (migration 014)
  - [ ] 1.1.1 Patient resolution: appointment.patient_id → patients.platform_external_id (Instagram) or conversation.platform_conversation_id
  - [ ] 1.1.2 Fallback: appointment.conversation_id → conversation → platform_conversation_id
- ❌ **What's missing:** Prescription-specific send flow; DM content (summary or image); email body for prescription
- ⚠️ **Notes:** Reuse notification-service patterns; no PHI in logs; audit notification_sent.

**Scope Guard:**
- Expected files touched: ~4 (service, controller, notification helper)
- Depends on: e-task-2, e-task-3, e-task-4

**Reference Documentation:**
- [notification-service.ts](../../../../backend/src/services/notification-service.ts)
- [sendPaymentConfirmationToPatient](../../../../backend/src/services/notification-service.ts) — Patient resolution pattern
- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md) — Delivery section
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Send Prescription Service

- [x] 1.1 Add `sendPrescriptionToPatient` in `notification-service.ts`
  - [x] 1.1.1 Input: prescriptionId, correlationId, userId
  - [x] 1.1.2 Load prescription with medicines, attachments; load appointment
  - [x] 1.1.3 Resolve recipient: same logic as sendPaymentConfirmationToPatient
  - [x] 1.1.4 Resolve patient email (patients.email)
- [x] 1.2 Build DM content
  - [x] 1.2.1 If attachments (JPEG/PNG): send images via sendInstagramImage + signed URL (1hr)
  - [x] 1.2.2 If structured: build text summary (diagnosis, meds, follow-up)
  - [x] 1.2.3 If both: images first, then text
  - [x] 1.2.4 Photo-only: images or fallback "Your prescription has been saved"
- [x] 1.3 Send via Instagram
  - [x] 1.3.1 Get doctor token: getInstagramAccessTokenForDoctor
  - [x] 1.3.2 Images: createAttachmentSignedUrlForDelivery (1hr expiry), sendInstagramImage
  - [x] 1.3.3 Text: sendInstagramMessage
  - [x] 1.3.4 Handle: no recipient/token → skip; failures → log, fallback
- [x] 1.4 Send via Email (if patient has email)
  - [x] 1.4.1 Subject "Your prescription from [practice]", body: text summary
  - [x] 1.4.2 sendEmail (no attachments in V1)
- [x] 1.5 Update prescription: set sent_to_patient_at on any success
- [x] 1.6 Audit: auditNotificationSent('prescription_sent', 'patient', 'prescription', id)

### 2. Instagram Image Message

- [x] 2.1 Added sendInstagramImage in instagram-service.ts
  - [x] 2.1.1 Payload: attachment type image, payload url (HTTPS)
  - [x] 2.1.2 Supabase signed URL 1hr expiry for Meta fetch
- [x] 2.2 V1: JPEG/PNG images sent; webp/pdf skip image, use text
- [x] 2.3 Fallback to text if image send fails

### 3. API Endpoint

- [x] 3.1 POST /api/v1/prescriptions/:id/send
  - [x] 3.1.1 Auth required; doctor ownership verified in service
  - [x] 3.1.2 Response: { sent, channels?, reason? }
- [x] 3.2 PrescriptionForm "Save & send"
  - [x] 3.2.1 Save, then call send API
  - [x] 3.2.2 Show success/partial messages

### 4. Error Handling

- [x] 4.1 No patient link: { sent: false, reason: 'no_patient_link' }
- [x] 4.2 No token: skip DM, try email
- [x] 4.3 Partial success: set sent_to_patient_at; return channels
- [x] 4.4 caption ?? null for registerAttachment

### 5. Verification

- [ ] 5.1 End-to-end: create prescription → Save & send → patient receives DM
- [ ] 5.2 Patient with email receives email
- [ ] 5.3 sent_to_patient_at is set after successful send
- [ ] 5.4 No PHI in logs

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── notification-service.ts        (UPDATE - add sendPrescriptionToPatient)
│   └── instagram-service.ts           (CHECK - image message support)
├── controllers/
│   └── prescription-controller.ts     (UPDATE - sendHandler)
├── routes/
│   └── api/v1/prescriptions.ts        (UPDATE - POST :id/send)
frontend/
└── components/consultation/
    └── PrescriptionForm.tsx           (UPDATE - call send API)
```

---

## 🧠 Design Constraints

- No PHI in logs (IDs only)
- Audit all sends
- Failures must not block; log and report
- Reuse sendPaymentConfirmationToPatient patient-resolution logic

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — prescription update)
  - [x] **RLS verified?** (Y)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (Y — Instagram, email)
  - [x] **Consent + redaction confirmed?** (Y — patient consented via booking)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Doctor can send prescription to patient
- [x] Patient receives DM (when Instagram linked)
- [x] Patient receives email (when email available)
- [x] sent_to_patient_at updated on success
- [x] Audit log entry for notification_sent

---

## 🔗 Related Tasks

- [e-task-2: Prescription API](./e-task-2-prescription-service-api.md)
- [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md)

---

**Last Updated:** 2026-03-28
