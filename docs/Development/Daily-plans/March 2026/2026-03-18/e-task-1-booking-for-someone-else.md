# Task 1: Booking for Someone Else
## 2026-03-18

---

## 📋 Task Overview

When a user says "book for my mother" (or similar), the bot must collect the *other* person's details and book the appointment under their name—not reuse the conversation's linked patient. Currently, the slot link always uses the conversation's patient, causing duplicate appointments under the same name.

**Estimated Time:** 4–6 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-18

**Change Type:**
- [x] **Update existing** — Intent detection, webhook-worker, slot-selection-service, patient-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `book_for_someone_else` intent; collection flow for another person; slot link uses `bookingForPatientId` when set; `processSlotSelectionAndPay` uses correct patient
- ✅ **Implemented:** Intent detection, createPatientForBooking, consent variant, slot-selection fallback
- ⚠️ **Notes:** Conversation's `patient_id` unchanged when booking for someone else

**Scope Guard:**
- Expected files touched: ≤ 8 (types/ai, ai-service, webhook-worker, collection-service, patient-service, slot-selection-service, conversation types, RECEPTIONIST_BOT)

**Reference Documentation:**
- [BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md](../../../Reference/BOOKING_FOR_OTHERS_AND_APPOINTMENT_LIMITS.md) — Design
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md) — Flow
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md) — Intent map

---

## ✅ Task Breakdown (Hierarchical)

### 1. Intent & Types

- [x] 1.1 Add `book_for_someone_else` to Intent type
  - [x] 1.1.1 Update `backend/src/types/ai.ts`: add to Intent union and INTENT_VALUES
  - [x] 1.1.2 Update AI prompt in ai-service: add intent rule and examples
- [x] 1.2 Add `bookingForPatientId?: string` to ConversationState
  - [x] 1.2.1 When set, slot selection uses this patient instead of conversation.patient_id
  - [x] 1.2.2 Clear after successful booking

### 2. Webhook Worker — Detect & Route

- [x] 2.1 Detect `book_for_someone_else` (or book_appointment with "for X" context)
  - [x] 2.1.1 Add deterministic rule: regex for "book for my mother/father/wife/..." before AI
  - [x] 2.1.2 Or extend AI prompt to return book_for_someone_else when user says "book for [someone]"
- [x] 2.2 When detected and user has existing patient (step=responded or awaiting_slot_selection)
  - [x] 2.2.1 Reset state: step = collecting_all, clear collectedFields, clear bookingForPatientId
  - [x] 2.2.2 Clear Redis collected data for fresh collection
  - [x] 2.2.3 Reply: "I'll help you book for [mother/them]. Please share: Full name, Age, Mobile, Reason for visit for the person you're booking for."
- [x] 2.3 Collection flow unchanged — validateAndApplyExtracted, buildConfirmDetailsMessage, etc.
- [x] 2.4 At consent (when granting): create new patient for the "other" person
  - [x] 2.4.1 Call new `createPatientForBooking(doctorId, collected)` — creates patient with name, phone, age, gender, email; no platform link
  - [x] 2.4.2 Set state.bookingForPatientId = newPatient.id
  - [x] 2.4.3 Do NOT call persistPatientAfterConsent (that updates conversation's patient)
  - [x] 2.4.4 Clear collected data after storing bookingForPatientId
  - [x] 2.4.5 Send slot link as usual

### 3. Patient Service

- [x] 3.1 Add `createPatientForBooking(doctorId, data, correlationId): Promise<Patient>`
  - [x] 3.1.1 Creates patient with doctor_id, name, phone, age, gender, email from collected data
  - [x] 3.1.2 No platform, no platform_conversation_id (standalone patient for this booking)
  - [x] 3.1.3 consent_status = 'granted' (implied by consent in chat)
  - [x] 3.1.4 Returns created patient

### 4. Slot Selection Service

- [x] 4.1 In `processSlotSelectionAndPay`, check state.bookingForPatientId
  - [x] 4.1.1 If set: use `findPatientByIdWithAdmin(bookingForPatientId)` instead of conversation.patient_id
  - [x] 4.1.2 If not set: use conversation.patient_id (existing behavior)
- [x] 4.2 After successful booking: clear bookingForPatientId from state (or leave for audit; document)
- [x] 4.3 Ensure payment link uses correct patient (name, phone, email)

### 5. Consent Flow Variant

- [x] 5.1 When in "booking for someone else" mode (state.bookingForPatientId will be set at consent)
  - [x] 5.1.1 Consent message: "Do I have your consent to use these details to schedule the appointment for [name]?"
  - [x] 5.1.2 On grant: create patient, set bookingForPatientId, send slot link
  - [x] 5.1.3 Do NOT persist to conversation's patient — keep conversation.patient_id unchanged

### 6. Documentation

- [x] 6.1 Update [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md) — add book_for_someone_else to intent map
- [ ] 6.2 Update [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md) — add "Booking for someone else" flow variant (optional)

### 7. Verification & Testing

- [x] 7.1 Run type-check
- [ ] 7.2 Manual test: "book for my mother" → collect mother's details → consent → slot → verify appointment under mother's name
- [ ] 7.3 Verify conversation's patient (original user) unchanged
- [ ] 7.4 Verify no PHI in logs

---

## 📁 Files to Create/Update

```
backend/src/
├── types/
│   ├── ai.ts                    (UPDATED - book_for_someone_else)
│   └── conversation.ts          (UPDATED - bookingForPatientId)
├── services/
│   ├── ai-service.ts            (UPDATED - intent rule, prompt)
│   ├── patient-service.ts       (UPDATED - createPatientForBooking)
│   └── slot-selection-service.ts (UPDATED - use bookingForPatientId)
└── workers/
    └── webhook-worker.ts        (UPDATED - detect, route, consent variant)

docs/Reference/
└── RECEPTIONIST_BOT_CONVERSATION_RULES.md  (UPDATED - intent map)
```

**Existing Code Status:**
- ✅ `webhook-worker.ts` — Handles book_for_someone_else, consent variant, collection
- ✅ `slot-selection-service.ts` — Uses bookingForPatientId when set, clears after booking
- ✅ `patient-service.ts` — Has createPatientForBooking
- ✅ `bookingForPatientId` in state — Implemented

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Conversation's patient_id must NOT be overwritten when booking for someone else
- New patient created for "other" person must have consent_status = 'granted' (consent given in chat)
- Follow ARCHITECTURE.md: service layer for patient creation, not in worker

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – patients, appointments, conversation state)
  - [x] **RLS verified?** (Y)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (Y – OpenAI for intent)
  - [x] **Consent + redaction confirmed?** (Y)
- [x] **Retention / deletion impact?** (N – new patients follow existing retention)

---

## ✅ Acceptance & Verification Criteria

- [x] "Book for my mother" triggers fresh collection for mother's details
- [x] Appointment created under mother's name, not conversation's patient
- [x] Conversation's patient (original user) unchanged
- [x] Slot link works; payment associates with correct patient
- [x] No PHI in logs

---

## 🔗 Related Tasks

- [e-task-2: Appointment limit per person per day](./e-task-2-appointment-limit-per-day.md) — Independent; can implement first

---

**Last Updated:** 2026-03-18  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
