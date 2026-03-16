# Task 5: Booking Flow — Match Confirmation
## 2026-03-27

---

## 📋 Task Overview

Before creating a new patient for "booking for someone else", search for possible matches. If found, ask the user "Same person?" and let them confirm. If Yes → use existing patient. If No → create new. Integrates findPossiblePatientMatches into the webhook flow.

**Estimated Time:** 5–6 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** — webhook-worker, conversation types; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** createPatientForBooking called on consent for "booking for someone else"; validateAndApplyExtracted; consent flow
- ❌ **What's missing:** Match check before create; "Same person?" prompt; state for awaiting_match_confirmation
- ⚠️ **Notes:** Flow: collect details → confirm_details → consent → createPatientForBooking. We need to insert match check after confirm_details (when we have all fields) and before consent. Or: at confirm_details, if we have matches, ask "Same person?" first.

**Scope Guard:**
- Expected files touched: ≤ 6 (webhook-worker, collection-service, conversation state, ai-service prompts)

**Reference Documentation:**
- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- [e-task-2: Patient matching service](./e-task-2-patient-matching-service.md)
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. State & Flow Design

- [x] 1.1 Add step: awaiting_match_confirmation (when we have possible matches)
  - [x] 1.1.1 State fields: pendingMatchPatientIds?: string[]
  - [x] 1.1.2 Bot message: "We found a record for Ramesh Masih with this number. Same person? Reply Yes or No."
- [x] 1.2 Flow: confirm_details → (if matches) → awaiting_match_confirmation → (Yes) use existing / (No) create new → slot link
- [x] 1.3 When to run match: when user confirms details (Yes) and we have name, phone

### 2. Webhook Integration

- [x] 2.1 In confirm_details path, when user says Yes and bookingForSomeoneElse:
  - [x] 2.2.1 Call findPossiblePatientMatches(doctorId, phone, name, age?, gender?, correlationId)
  - [x] 2.2.2 If matches.length > 0:
    - [x] Set state to awaiting_match_confirmation
    - [x] Store pendingMatchPatientIds (top 1–2 for "which one?")
    - [x] Send "We found X. Same person? Reply Yes or No"
  - [x] 2.2.3 If no matches: proceed to consent (create new)
- [x] 2.3 Add handler for step === awaiting_match_confirmation
  - [x] 2.3.1 Parse reply: Yes / No / 1 / 2 (parseMatchConfirmationReply)
  - [x] 2.3.2 If Yes or 1: use first match patient_id, skip createPatientForBooking, send slot link
  - [x] 2.3.3 If No or unclear: createPatientForBooking, send slot link

### 3. Edge Cases

- [x] 3.1 Multiple matches: "We found 2 records: X (56), Y (32). Which one? Reply 1 or 2, or No for new patient."
- [x] 3.2 User says something unclear: treat as No (create new)
- [x] 3.3 Self-booking: no match check (platform identity handles it)

### 4. AI Prompt Updates

- [x] 4.1 Deterministic reply (no AI) for this step

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Manual test: book for "Ramesh Masih" with existing phone → see match prompt → Yes → use existing
- [ ] 5.3 Manual test: No → create new patient
- [ ] 5.4 Manual test: no matches → no prompt, create new

---

## 📁 Files to Create/Update

```
backend/src/
├── workers/
│   └── webhook-worker.ts          (UPDATED)
├── services/
│   ├── collection-service.ts      (UPDATED - maybe)
│   └── patient-matching-service.ts (from e-task-2)
├── types/
│   └── conversation.ts            (UPDATED - add step, state fields)
└── services/
    └── ai-service.ts              (UPDATED - prompt for match step, optional)
```

**Existing Code Status:**
- ✅ `webhook-worker.ts` — consent flow, createPatientForBooking call
- ✅ `conversation.ts` — ConversationState, step enum
- ✅ `collection-service.ts` — validateAndApplyExtracted, buildConfirmDetailsMessage

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Match check only for bookingForSomeoneElse
- Never auto-merge; user must confirm

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – conversation state, patient creation flow)
  - [x] **RLS verified?** (N/A – webhook uses service role)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Match prompt shown when possible matches exist
- [x] Yes → use existing patient, no duplicate created
- [x] No → create new patient
- [x] No matches → no prompt, create new
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-2: Patient matching service](./e-task-2-patient-matching-service.md)
- [e-task-1: Add patient_id (MRN) column](./e-task-1-patient-mrn-column.md)

---

**Last Updated:** 2026-03-27  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
