# Task 5: Send Prescription to Patient

## 2026-03-27 — Prescription V1 Implementation

---

## 📋 Task Overview

Implement sending prescription to patient via Instagram DM and/or email. When doctor clicks "Save & send to patient", backend builds a message (structured summary or image), sends via Instagram Messaging API and/or email, and sets `sent_to_patient_at`.

**Estimated Time:** 2 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

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

- [ ] 1.1 Add `sendPrescriptionToPatient` in `notification-service.ts` or new `prescription-delivery-service.ts`
  - [ ] 1.1.1 Input: prescriptionId, correlationId
  - [ ] 1.1.2 Load prescription with medicines, attachments; load appointment (patient_id, doctor_id)
  - [ ] 1.1.3 Resolve recipient: same logic as sendPaymentConfirmationToPatient (patient.platform_external_id or conversation.platform_conversation_id for Instagram)
  - [ ] 1.1.4 Resolve patient email if available (patients.email from migration 014)
- [ ] 1.2 Build DM content
  - [ ] 1.2.1 If prescription has attachments (photos): send image(s) via Instagram API (image message type)
  - [ ] 1.2.2 If structured: build text summary — "Your prescription:\n\n**Diagnosis:** {diagnosis}\n**Medications:**\n{med1}\n{med2}\n...\n**Follow-up:** {follow_up}"
  - [ ] 1.2.3 If both: send image(s) first, then text summary
  - [ ] 1.2.4 Photo-only: send image(s) with optional caption "Your prescription from Dr. X"
- [ ] 1.3 Send via Instagram
  - [ ] 1.3.1 Get doctor token: getInstagramAccessTokenForDoctor(doctor_id)
  - [ ] 1.3.2 For images: Instagram API supports image URL (hosted) or upload — use Supabase Storage signed URL (short expiry) for image URL
  - [ ] 1.3.3 For text: sendInstagramMessage(recipientId, text, correlationId, token)
  - [ ] 1.3.4 Handle: no recipient (skip), no token (skip, log), send failure (log, don't block)
- [ ] 1.4 Send via Email (if patient has email)
  - [ ] 1.4.1 Build email: subject "Your prescription from [Doctor]", body: structured summary or "See attached" + link to view (if we have patient portal — V1: inline text)
  - [ ] 1.4.2 For photo: attach image or link — V1: link to signed download URL (short expiry) or inline base64 — prefer link for simplicity
  - [ ] 1.4.3 sendEmail(patientEmail, subject, body, attachments?)
- [ ] 1.5 Update prescription
  - [ ] 1.5.1 Set sent_to_patient_at = now()
  - [ ] 1.5.2 Use prescription-service update or direct update
- [ ] 1.6 Audit: logNotificationSent('prescription_sent', 'patient', 'prescription', prescriptionId)

### 2. Instagram Image Message

- [ ] 2.1 Check Instagram Messaging API for image
  - [ ] 2.1.1 API supports `attachment` with `type: image`, `payload: { url }` — URL must be publicly accessible or use Messenger attachment API
  - [ ] 2.1.2 Alternative: Upload image to temporary URL (signed URL with 1-hour expiry) — Meta may fetch; ensure HTTPS
  - [ ] 2.1.3 Document: Meta requires URL to be accessible when they fetch; signed URL must be valid
- [ ] 2.2 If URL not suitable: send text with link to view prescription (secure tokenised URL — V2) — V1: send text summary only for structured; for photo, try image URL or fallback to "Your prescription has been saved. The doctor will share it separately."
- [ ] 2.3 Decision: V1 scope — text summary always; if photo, include "Photo prescription attached" + attempt image send; fallback to text if image fails

### 3. API Endpoint

- [ ] 3.1 POST /api/v1/prescriptions/:id/send
  - [ ] 3.1.1 Auth required; doctor must own prescription
  - [ ] 3.1.2 Calls sendPrescriptionToPatient
  - [ ] 3.1.3 Response: { sent: boolean, channels?: { instagram?: boolean, email?: boolean } }
  - [ ] 3.1.4 404 if prescription not found; 403 if not owner
- [ ] 3.2 Wire from PrescriptionForm "Save & send" button
  - [ ] 3.2.1 After create/update prescription, call send endpoint
  - [ ] 3.2.2 Show success: "Prescription saved and sent to patient"
  - [ ] 3.2.3 Show partial: "Saved. DM not sent (no Instagram link)." if applicable

### 4. Error Handling

- [ ] 4.1 No patient link: respond { sent: false, reason: 'no_patient_link' }
- [ ] 4.2 No Instagram token: skip DM, log; maybe send email only
- [ ] 4.3 DM send failure: log; do not set sent_to_patient_at; return { sent: false }
- [ ] 4.4 Partial success: if DM sent but email failed, still set sent_to_patient_at; return { sent: true, channels: { instagram: true, email: false } }

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

- [ ] **Data touched?** (Y — prescription update)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Instagram, email)
  - [ ] **Consent + redaction confirmed?** (Y — patient already consented via booking; no new data shared beyond prescription)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can send prescription to patient
- [ ] Patient receives DM (when Instagram linked)
- [ ] Patient receives email (when email available)
- [ ] sent_to_patient_at updated
- [ ] Audit log entry for notification_sent

---

## 🔗 Related Tasks

- [e-task-2: Prescription API](./e-task-2-prescription-service-api.md)
- [e-task-4: Prescription form UI](./e-task-4-prescription-form-ui.md)

---

**Last Updated:** 2026-03-27
