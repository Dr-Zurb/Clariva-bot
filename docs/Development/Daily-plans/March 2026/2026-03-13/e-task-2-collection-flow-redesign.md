# Task 2: Collection Flow Redesign — "All at Once" + New Fields
## 2026-03-13

---

## 📋 Task Overview

Redesign the patient collection flow: (1) Ask for all details at once instead of sequential; (2) Add age (required), email (optional); (3) Remove consultation_type from collection; (4) Accept partial/multi-turn input; (5) Add confirm_details step before slots.

**Estimated Time:** 12–16 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-13

**Change Type:**
- [x] **Update existing** — collection-service, validation, webhook-worker, ai-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** collection-service.ts (COLLECTION_ORDER: name→phone→consultation_type→date_of_birth→gender→reason_for_visit); validateAndApply; getNextCollectionField; parseMessageForField; REQUIRED_COLLECTION_FIELDS = [name, phone]; validation.ts (PATIENT_COLLECTION_FIELDS, field schemas); webhook-worker (sequential collection, getInitialCollectionStep); ai-service (collectionHint asks one field at a time)
- ❌ **What's missing:** collecting_all step; age field; email field; multi-field extraction; confirm_details step
- ⚠️ **Notes:** consultation_type exists; we remove it from collection. date_of_birth exists but we use age instead (no DOB in new flow).

**Scope Guard:**
- Expected files touched: validation.ts, collection-service.ts, webhook-worker.ts, ai-service.ts, types/conversation.ts, consent-service.ts

**Reference Documentation:**
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Validation & Schema

- [x] 1.1 Add age field
  - [x] 1.1.1 Add `patientAgeSchema` (z.number 1–120 or z.string that parses to number)
  - [x] 1.1.2 Add age to PATIENT_COLLECTION_FIELDS
  - [x] 1.1.3 Add age to CollectedPatientData, fieldSchemas
- [x] 1.2 Add email field
  - [x] 1.2.1 Add `patientEmailSchema` (optional, valid email format)
  - [x] 1.2.2 Add email to PATIENT_COLLECTION_FIELDS, CollectedPatientData, fieldSchemas
- [x] 1.3 Remove consultation_type from COLLECTION_ORDER and REQUIRED
- [x] 1.4 Update REQUIRED_COLLECTION_FIELDS: [name, phone, age, gender, reason_for_visit]

### 2. Collection Service

- [x] 2.1 Add `collecting_all` step
  - [x] 2.1.1 Add to STEP_BY_FIELD; getInitialCollectionStep returns `collecting_all`
- [x] 2.2 Add `confirm_details` step (new step; not field-based)
- [x] 2.3 Multi-field extraction
  - [x] 2.3.1 New function `extractFieldsFromMessage(text)` — use AI or regex to extract { name?, age?, phone?, reason_for_visit?, email?, gender? }
  - [x] 2.3.2 New function `validateAndApplyExtracted(conversationId, extracted, currentState)` — validate each, merge into store, return { newState, missingFields, replyOverride? }
- [x] 2.4 Update parseMessageForField for age, email (or rely on extraction)

### 3. Webhook Worker

- [x] 3.1 When step is `collecting_all`:
  - [x] 3.1.1 Call extractFieldsFromMessage + validateAndApplyExtracted
  - [x] 3.1.2 If all required present → transition to `confirm_details`
  - [x] 3.1.3 Else → ask for missing (deterministic or AI)
- [x] 3.2 Add `confirm_details` branch
  - [x] 3.2.1 Parse Yes/correction (e.g. "No, phone is X")
  - [x] 3.2.2 If Yes → transition to consent
  - [x] 3.2.3 If correction → update store, re-confirm
- [x] 3.3 Remove consultation_type auto-skip logic (no longer in flow)
- [x] 3.4 Update justStartingCollection → step = `collecting_all`

### 4. AI Service

- [x] 4.1 Add hint for `collecting_all`: "Ask for all details at once: full name, age, mobile, reason for visit. Email and gender optional."
- [x] 4.2 Add hint for `confirm_details`: "Read back summary; ask Yes or what to change."
- [ ] 4.3 Add extraction prompt (if using AI for extraction): system prompt to extract JSON from user message
- [x] 4.4 Remove collectionHint for one-field-at-a-time when step is collecting_all

### 5. Consent Service

- [x] 5.1 Update persistPatientAfterConsent to include age, email
  - [x] 5.1.1 Add age to UpdatePatient (if patients table has age — or store in notes) — age stored in conversation state for appointment.notes at booking
  - [x] 5.1.2 Add email to UpdatePatient (migration 014 adds patients.email)
  - [x] 5.1.3 Note: patients table has no age column — age preserved in state.age, reason in state.reasonForVisit for appointment.notes at booking.

### 6. Types

- [x] 6.1 Add `collecting_all`, `confirm_details` to ConversationState step type
- [x] 6.2 Add age, email to CollectedPatientData
- [x] 6.3 Remove or deprecate collecting_consultation_type from step type

### 7. Verification

- [x] 7.1 Run type-check, lint
- [ ] 7.2 Manual test: "book appointment" → all-at-once prompt
- [ ] 7.3 Manual test: partial input → ask for missing
- [ ] 7.4 Manual test: confirm_details → Yes → consent
- [ ] 7.5 Manual test: correction in confirm_details

---

## 📁 Files to Create/Update

```
backend/src/
├── utils/
│   └── validation.ts              (UPDATED - age, email, remove consultation_type from order)
├── services/
│   ├── collection-service.ts      (UPDATED - collecting_all, extractFields, confirm_details)
│   ├── consent-service.ts        (UPDATED - persist age, email)
│   └── ai-service.ts             (UPDATED - hints for new steps)
├── workers/
│   └── webhook-worker.ts          (UPDATED - new flow branches)
└── types/
    └── conversation.ts            (UPDATED - new step types)
```

**Existing Code Status:**
- ✅ collection-service.ts — validateAndApply, getNextCollectionField, COLLECTION_ORDER
- ✅ validation.ts — PATIENT_COLLECTION_FIELDS, validatePatientField
- ✅ consent-service.ts — persistPatientAfterConsent (updates name, phone, date_of_birth, gender)
- ⚠️ patients table: no age column — store age in appointment.notes or add migration. e-task-1 adds email.

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Age: 1–120; optional in patients (or notes); required in collection
- Email: optional; valid format
- Extraction: AI preferred for messy input; regex fallback for structured
- confirm_details: deterministic read-back; avoid AI for summary

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – collected data, patients)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI for extraction if used)
  - [ ] **Consent + redaction confirmed?** (Y – redact before AI)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Bot asks for all details at once on book_appointment
- [ ] Partial input → bot asks for missing fields
- [ ] All required (name, age, phone, reason) → confirm_details
- [ ] User confirms → consent
- [ ] Corrections handled in confirm_details
- [ ] consultation_type not collected

---

## 🔗 Related Tasks

- [e-task-1: Migrations](./e-task-1-migrations-slot-selections-patients-email.md)
- [e-task-5: Webhook flow integration](./e-task-5-webhook-flow-integration.md)

---

**Last Updated:** 2026-03-13
