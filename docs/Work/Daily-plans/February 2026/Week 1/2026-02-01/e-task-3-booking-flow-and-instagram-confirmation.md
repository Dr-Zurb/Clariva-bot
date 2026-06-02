# Task 3: Booking Flow & Instagram Confirmation
## February 1, 2026 - Week 3: Booking System & Payments Day 3

---

## 📋 Task Overview

Integrate appointment booking into the conversation flow: when a patient with consent and collected data says "book" or selects a slot, create the appointment and send confirmation via Instagram DM. Connect webhook worker to availability/booking services. Update doctor's calendar (block slot or record) and notify patient.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** _2026-01-30_

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Webhook worker; conversation state; collection-service (collected PHI); consent-service; patient-service; instagram-service (send message); availability-service; appointment-service; Task 1 (available slots); Task 2 (book API)
- ❌ **What's missing:** Intent/step for "select slot" or "confirm booking"; flow: collected data + consent → pick slot → book → send DM; integration of booking into webhook-worker; DM confirmation template
- ⚠️ **Notes:** Patient has consented; PHI in patients table or collected data. Use patient name/phone from consent flow. DEFAULT_DOCTOR_ID for MVP. instagram-service sends DM; use for confirmation.

**Scope Guard:**
- Expected files touched: ≤ 8
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - No PII in logs; asyncHandler; successResponse
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Services handle logic; worker orchestrates
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - No PII in logs; audit metadata only
- [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md) - Instagram rate limits, retries; Meta platform patterns
- [ERROR_CATALOG.md](../../Reference/engineering/development/ERROR_CATALOG.md) - ConflictError (409) for double-book; handle gracefully
- [TESTING.md](../../Reference/engineering/development/TESTING.md) - Fake placeholders (PATIENT_TEST, +10000000000) for tests
- [DEFINITION_OF_DONE.md](../../Reference/engineering/development/DEFINITION_OF_DONE.md) - Feature completion checklist

---

## ✅ Task Breakdown (Hierarchical)

### 1. Conversation Flow Extension
- [x] 1.1 Add step/state for "selecting_slot" (or "confirming_booking") after consent granted; transition from step "responded" to "selecting_slot" when user says "book" (isBookIntent)
- [x] 1.2 When in selecting_slot: show available slots (call getAvailableSlots); when user replies with slot choice (e.g. "1" or "2"), parse slot and proceed to book
- [x] 1.3 MVP slot parsing: user picks from numbered list ("1. Feb 5, 2:00 PM\n2. Feb 5, 2:30 PM") → reply "1" or "2"; map index to slot from getAvailableSlots; Phase 1: natural language ("tomorrow 2pm", ISO datetime)
- [x] 1.4 Date for slots: use env.DEFAULT_DOCTOR_ID; MVP default to tomorrow (YYYY-MM-DD) or ask "Which day?"; document Phase 1 AI parse for natural language

### 2. Booking Integration in Worker
- [x] 2.1 In webhook-worker: when state indicates "ready to book" (consent granted, slot selected): call appointment-service **bookAppointment** (not createAppointment) with BookAppointmentInput: doctorId, patientName, patientPhone, appointmentDate (ISO), notes
- [x] 2.2 Use service role for worker (no userId); patient name/phone from **patients table** via findPatientByIdWithAdmin(conversation.patient_id) — data persisted by persistPatientAfterConsent; do NOT use collected data (cleared after consent)
- [x] 2.3 On success: reply with confirmation message; send via sendInstagramMessage at end of flow
- [x] 2.4 On ConflictError (double-book): catch; send user-friendly message (e.g. "That slot was just taken. Here are available slots…"); do NOT persist partial state; do not retry immediately per EXTERNAL_SERVICES (non-idempotent)

### 3. Instagram Confirmation DM
- [x] 3.1 Create confirmation template: "Your appointment is confirmed for [date] at [time]. We'll send a reminder before your visit." — format date/time for readability (e.g. "Feb 5, 2026 at 2:00 PM")
- [x] 3.2 No PHI in template beyond what patient already knows (date/time); never log message content with PHI (EXTERNAL_SERVICES)
- [x] 3.3 Call sendInstagramMessage(recipientId, message, correlationId); recipientId = senderId (from webhook payload); handle rate limits per EXTERNAL_SERVICES

### 4. Block Slot / Update Calendar
- [x] 4.1 Phase 0: use appointments table only; getAvailableSlots (Task 1) excludes existing appointments; no blocked_times for booked slots
- [x] 4.2 Document: blocked_times reserved for manual blocks (doctor lunch, etc.)

### 5. Compliance & Logging
- [x] 5.1 No PII in logs (only correlationId, appointmentId, doctorId, resource IDs)
- [x] 5.2 Audit: log "appointment_booked" with metadata only; log "notification_sent" (type, recipient_id anonymized/hash if needed, no content)

### 6. Testing & Verification
- [x] 6.1 Unit tests for booking flow (mock instagram-service, appointment-service, availability-service, patient-service); use fake placeholders per TESTING.md
- [x] 6.2 Test ConflictError path: double-book → user message, no partial state
- [x] 6.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── workers/
│   └── webhook-worker.ts          (UPDATE - booking flow; slot selection; send confirmation)
├── services/
│   ├── instagram-service.ts       (USE - sendInstagramMessage)
│   ├── appointment-service.ts     (USE - bookAppointment, not createAppointment)
│   ├── availability-service.ts    (USE - getAvailableSlots)
│   └── patient-service.ts         (USE - findPatientById for name/phone after consent)
├── types/
│   └── conversation.ts            (UPDATE - add step 'selecting_slot')
└── (optional) utils/slot-parser.ts (parse "1"/"2" to slot; or inline in worker)
```

**Existing Code Status:**
- ✅ `webhook-worker.ts` - EXISTS; handles intent, collection, consent
- ✅ `instagram-service.ts` - EXISTS (sendInstagramMessage)
- ✅ `appointment-service.ts` - EXISTS (bookAppointment from Task 2; double-book check)
- ✅ `availability-service.ts` - EXISTS (getAvailableSlots from Task 1)
- ✅ `patient-service.ts` - EXISTS (findPatientById for patient name/phone)
- ❌ Booking flow in worker - MISSING (slot selection, bookAppointment call, confirmation)
- ❌ Confirmation DM - MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PII in logs (COMPLIANCE.md)
- Worker uses service role; no userId for bookAppointment (Task 2 supports optional userId)
- Validate patient exists and has consent (consent_status='granted') before booking
- Patient name/phone from patients table (findPatientById) — NOT collected data (cleared after consent)
- instagram-service: handle rate limits per EXTERNAL_SERVICES; never log message content

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y - appointments, messages) → [x] **RLS verified?** (Y - worker uses service role)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (Y - Instagram DM) → [x] **Consent + redaction confirmed?** (Y - no message content in logs)
- [x] **Retention / deletion impact?** (N)
- [x] **Auth/RLS:** Worker uses service role (no user JWT); bookAppointment called with no userId

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Patient with consent can complete booking via conversation (slot selection → book → confirm)
- [x] Confirmation DM sent to patient after successful book
- [x] ConflictError (double-book) handled gracefully: user-friendly message; no partial state; no retry
- [x] No PII in logs
- [x] Unit tests cover flow (mock instagram, appointment, availability, patient); fake placeholders per TESTING.md
- [x] Type-check and lint pass

---

## 🐛 Issues Encountered & Resolved

- Added findPatientByIdWithAdmin in patient-service for webhook worker (anon client RLS blocks reads without user JWT)
- Fixed stateToPersist to preserve selecting_slot state when in that branch

---

## 📝 Notes

- **Slot selection:** MVP: show numbered list from getAvailableSlots; user replies "1" or "2"; map index to slot. Phase 1: natural language ("tomorrow 2pm", "Feb 5 2pm").
- **Patient data:** After consent, persistPatientAfterConsent updates patients table and clears collected data. Use findPatientById for name/phone at booking.
- **DEFAULT_DOCTOR_ID:** Required for MVP; worker uses env.DEFAULT_DOCTOR_ID for doctorId in getAvailableSlots and bookAppointment.
- **Payment:** Task 4 adds payment; for MVP without payment, booking can be confirmed immediately.

---

## 🔗 Related Tasks

- [Task 2: Appointment Booking Logic](./e-task-2-appointment-booking-logic.md)
- [Task 4: Payment Integration](./e-task-4-payment-integration.md)
- [Task 5: Notifications System](./e-task-5-notifications-system.md)

---

**Last Updated:** 2026-02-01  
**Completed:** _2026-01-30_  
**Related Learning:** `docs/Archive/learning/2026-02-01/l-task-3-booking-flow-and-instagram-confirmation.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 1.1.0
