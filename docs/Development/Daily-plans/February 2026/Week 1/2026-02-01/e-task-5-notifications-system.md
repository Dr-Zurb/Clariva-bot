# Task 5: Notifications System
## February 1, 2026 - Week 3: Booking System & Payments Day 6–7

---

## 📋 Task Overview

Create notification service for doctor and patient notifications. **Doctor:** new appointment email, payment received email. **Patient:** payment confirmation DM after payment webhook (booking-time DM with payment link already exists from Task 3/4). Set up email service (SendGrid or Resend); create notification-service; audit log all notification events. Phase 0: booking-related and payment confirmations only; appointment reminders (24h before) and payment receipt (separate artifact) are Phase 1.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **DONE**
**Completed:** 2026-02-01

**Change Type:**
- [x] **New feature** — Add notification-service, email service, and integration points
- [ ] **Update existing** — Will touch webhook-worker and payment webhook flow to call notification-service (no behavior removal)

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** instagram-service (send DM); webhook-worker sends booking DM with payment link + fee (Task 3/4); payment webhook updates appointment to confirmed but does **not** send any DM to patient or email to doctor.
- ❌ **What's missing:** Email service (SendGrid/Resend); notification-service; doctor emails (new appointment, payment received); payment confirmation DM to patient (after payment webhook); notification audit; templates (inline for Phase 0).
- ⚠️ **Notes:** COMPLIANCE: no PII in logs; TLS 1.2+ for email; audit all notification events. Doctor email: from auth.users (Supabase Auth) or env DEFAULT_DOCTOR_EMAIL for MVP. **Payment confirmation DM:** need to resolve patient for appointment (e.g. appointment.patient_id or conversation/sender at booking) to send Instagram DM after webhook — see "Design / dependency" below.

**Scope Guard:**
- Expected files touched: ≤ 10 (notification-service, email config, worker integration, templates, tests)
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - No PII in logs; asyncHandler
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Services handle logic
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - No PII in logs; TLS; audit; audit logging
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md) - Retry, rate limits; email provider patterns
- [ERROR_CATALOG.md](../../Reference/ERROR_CATALOG.md) - Notification failures must not block booking/payment
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - appointments, payments, conversations (resolve patient for DM)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Email Service
- [x] 1.1 Choose provider: SendGrid or Resend; add env vars (API key)
- [x] 1.2 Create email send helper (or use provider SDK)
- [x] 1.3 TLS 1.2+ for transmission (provider default; document)

### 2. Notification Service
- [x] 2.1 Create `notification-service.ts`: sendPaymentConfirmationToPatient (DM), sendNewAppointmentToDoctor (email), sendPaymentReceivedToDoctor (email)
- [x] 2.2 Patient: use instagram-service for DM; doctor: use email service
- [x] 2.3 Templates: inline for Phase 0 (payment confirmation DM, new appointment email, payment received email)
- [x] 2.4 Audit: log each notification with metadata only (type, recipient_type, resource_id; no PII/content)

### 3. Doctor Notifications
- [x] 3.1 New appointment: email doctor when appointment is booked (webhook-worker after bookAppointment)
- [x] 3.2 Payment received: email doctor when payment webhook succeeds (after processPaymentSuccess)
- [x] 3.3 Doctor email: from Supabase auth.users (admin lookup by doctor_id) or env DEFAULT_DOCTOR_EMAIL for MVP

### 4. Patient Notifications
- [x] 4.1 Booking-time DM: already sent by Task 3/4 (DM with fee + payment link); no change unless consolidating copy
- [x] 4.2 Payment confirmation: Instagram DM after payment webhook ("Payment received. Your appointment on [date] is confirmed."); requires resolving patient → conversation/sender for appointment (see Design constraints)
- [x] 4.3 Payment receipt: Phase 0 = same as payment confirmation DM; separate receipt artifact (e.g. email) = Phase 1

### 5. Integration
- [x] 5.1 Booking flow: after bookAppointment (and payment link sent), call sendNewAppointmentToDoctor(doctorId, appointmentId, …)
- [x] 5.2 Payment webhook: after processPaymentSuccess, call sendPaymentConfirmationToPatient(…) and sendPaymentReceivedToDoctor(…)
- [x] 5.3 Fire-and-forget or await; handle failures (log, don't block booking/payment); follow EXTERNAL_SERVICES retry/rate limits for email

### 6. Compliance & Logging
- [x] 6.1 No PII in logs (only correlationId, notification type, resource IDs)
- [x] 6.2 Audit: log "notification_sent" with metadata only per COMPLIANCE D

### 7. Testing & Verification
- [x] 7.1 Unit tests for notification-service (mock email/Instagram)
- [x] 7.2 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/
├── src/
│   ├── services/
│   │   ├── notification-service.ts    (NEW)
│   │   └── instagram-service.ts       (USE - send DM)
│   ├── config/
│   │   └── email.ts                   (NEW - provider API key, send helper)
│   └── workers/
│       └── webhook-worker.ts         (UPDATE - call notification-service)
├── migrations/
│   └── (optional) 010_appointments_patient_id.sql  — if resolving patient for payment DM via patient_id
└── tests/unit/services/
    └── notification-service.test.ts  (NEW - mock email/Instagram)
```

**Existing Code Status:**
- ✅ `instagram-service.ts` - EXISTS (sendInstagramMessage)
- ✅ webhook-worker - Sends booking DM with payment link + fee (Task 3/4); does not send DM or email after payment webhook
- ✅ payment-service.processPaymentSuccess - Updates appointment to confirmed; does not trigger notifications
- ❌ `notification-service` - MISSING
- ❌ Email service (SendGrid/Resend) - MISSING
- ❌ Notification templates - MISSING (use inline strings for Phase 0)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PII in logs (COMPLIANCE.md)
- Audit all notification events (COMPLIANCE D)
- Secure email transmission (TLS 1.2+; provider default)
- Handle failures gracefully (don't block booking/payment)
- **Payment confirmation DM:** To send Instagram DM after payment webhook, we must resolve "patient for this appointment" to an Instagram sender ID. Options: (a) add `patient_id` to appointments at booking (worker has patient.id) and resolve conversation by doctor_id + patient_id to get platform_external_id / sender for Instagram, or (b) store conversation_id or instagram_sender_id on appointment when booking. Document choice; implement in this task or a small prerequisite.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N - sends only; may read appointments/payments/conversations for recipient resolution) → [x] **RLS verified?** (N/A for service-role reads)
- [x] **Any PHI in logs?** (MUST be No — only metadata: type, resource_id, correlation_id)
- [x] **External API or AI call?** (Y - email provider, Instagram) → [x] **Consent + redaction confirmed?** (Y - no PII in email logs; patient/doctor contact used only for delivery)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Doctor receives email when appointment is booked and when payment is captured
- [x] Patient receives payment confirmation DM after payment webhook (in addition to existing booking-time DM with link)
- [x] No PII in logs (only metadata)
- [x] Audit logs all notification events (notification_sent with type, resource_id)
- [x] Notification failures do not block booking or payment flow
- [x] Unit tests cover notification-service (mock email/Instagram)
- [x] Type-check and lint pass

---

## 🐛 Issues Encountered & Resolved

- **Patient resolution for payment DM:** Implemented via migration 010 (`appointments.patient_id`). Worker sets `patient_id` at booking; payment webhook resolves patient → `platform_external_id` (Instagram) and sends DM.
- **Doctor email:** Resolved via Supabase auth.admin.getUserById(doctorId); fallback to env DEFAULT_DOCTOR_EMAIL.
- **Unit test types:** Used `as never` for mockResolvedValue in notification-service.test.ts (Jest typing).

---

## 📝 Notes

- Phase 0: booking-related and payment confirmations only (doctor emails + payment confirmation DM)
- Phase 1: appointment reminders (24h before); payment receipt as separate artifact (e.g. email)
- SMS optional; document if deferred
- Email provider: SendGrid or Resend; choose one and document in EXTERNAL_SERVICES
- Inline templates for Phase 0; file-based or i18n later

---

## 🔗 Related Tasks

- [Task 3: Booking Flow & Instagram Confirmation](./e-task-3-booking-flow-and-instagram-confirmation.md)
- [Task 4: Payment Integration](./e-task-4-payment-integration.md)
- [Task 4.1: Per-Doctor Payment Settings](./e-task-4.1-per-doctor-payment-settings.md)

---

**Last Updated:** 2026-02-01  
**Completed:** _YYYY-MM-DD_ (if applicable)  
**Related Learning:** `docs/Learning/2026-02-01/l-task-5-notifications-system.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 1.1.0
