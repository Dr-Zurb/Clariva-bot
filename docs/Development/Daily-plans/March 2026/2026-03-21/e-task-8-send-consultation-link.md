# Task 8: Send Consultation Link to Patient
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

When doctor starts consultation, send the patient join link via SMS, email, or Instagram DM (when conversation exists). Integrates with existing notification-service. Doctor can also copy link manually (from e-task-6); this task adds automated delivery.

**Estimated Time:** 3–4 hours  
**Status:** ⏳ **PENDING**  
**Completed:** (when completed)

**Change Type:**
- [ ] **Update existing** — Extend notification-service, startConsultation flow

**Current State:**
- ✅ **What exists:** notification-service (sendEmail, sendInstagramMessage); sendPaymentConfirmationDm; getDoctorEmail; Resend for email
- ✅ **What exists:** Twilio env for SMS (TWILIO_PHONE_NUMBER)
- ❌ **What's missing:** Send consultation link on start; SMS via Twilio
- ⚠️ **Notes:** Patient may have email (from slot selection) or phone; conversation may exist for Instagram DM. Prefer: SMS (phone), else email, else DM if conversation linked.

**Scope Guard:**
- Expected files touched: ≤ 5

**Reference Documentation:**
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) - No PHI in logs
- notification-service patterns
- Twilio SMS API

---

## ✅ Task Breakdown (Hierarchical)

### 1. Notification Service Extension
- [ ] 1.1 Add to `backend/src/services/notification-service.ts`
  - [ ] 1.1.1 `sendConsultationLinkToPatient(appointmentId, patientJoinUrl, correlationId)` — resolve patient contact (phone, email); send via best channel
  - [ ] 1.1.2 Resolve: appointment.patient_id → patients.phone, patients.email; or appointment.patient_phone, slot_selections email
  - [ ] 1.1.3 Priority: SMS (Twilio) if phone, else email (Resend) if email, else Instagram DM if conversation_id and platform instagram
  - [ ] 1.1.4 Message template: "Your video consultation with [Practice] is ready. Join here: {url}"
  - [ ] 1.1.5 Non-blocking: log on failure, don't fail startConsultation
- [ ] 1.2 Twilio SMS: use existing TWILIO_* or add sendSms helper
  - [ ] 1.2.1 Twilio REST: messages.create({ to, from, body })
  - [ ] 1.2.2 Handle 400/404 (invalid number) gracefully

### 2. Integration
- [ ] 2.1 In startConsultation (e-task-3): after creating room and storing, call sendConsultationLinkToPatient
  - [ ] 2.1.1 Pass appointmentId, patientJoinUrl, correlationId
  - [ ] 2.1.2 Await but catch; log failure; still return success to doctor
- [ ] 2.2 Optional: config per doctor (prefer SMS vs email) — defer to future

### 3. Verification & Testing
- [ ] 3.1 Run type-check
- [ ] 3.2 Unit test: sendConsultationLinkToPatient mocks (or integration with test credentials)
- [ ] 3.3 Manual: start consultation, check SMS/email/DM received

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── notification-service.ts      (UPDATE - sendConsultationLinkToPatient)
│   ├── consultation-room-service.ts or appointment-service (UPDATE - call send)
│   └── (optional) twilio-sms-service.ts if new
└── config/
    └── env.ts                       (TWILIO_* already exist for SMS)
```

**Existing Code Status:**
- ✅ notification-service - EXISTS
- ✅ Twilio config - EXISTS
- ❌ sendSms / Twilio SMS - May need to add
- ❌ sendConsultationLinkToPatient - MISSING

---

## 🧠 Design Constraints

- No PHI in logs (appointment_id, channel sent)
- Audit: notification_sent with type consultation_link
- Fail gracefully: doctor still gets link to copy
- Respect patient channel preference if stored (future)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — reads appointment, patients, slot_selections)
  - [ ] **RLS verified?** (N/A — service role in worker/start flow)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Twilio SMS, Resend, Instagram)
  - [ ] **Consent + redaction confirmed?** (Patient expecting consultation; link is not PHI)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] When doctor starts consultation, patient receives link via SMS or email (when available)
- [ ] If no phone/email, no error; doctor can copy link
- [ ] Message content: clear CTA, no PHI

---

## 🔗 Related Tasks

- [e-task-3-consultation-api](./e-task-3-consultation-api.md)
- [e-task-6-frontend-appointment-video](./e-task-6-frontend-appointment-video.md)
- [e-task-7-patient-join-page](./e-task-7-patient-join-page.md)

---

**Last Updated:** 2026-03-21
