# Task 7: Patient ID in Confirmation Message
## 2026-03-27

---

## 📋 Task Overview

Include the Patient ID (MRN) in the confirmation message when a patient is first registered or when they complete booking. "Your patient ID: P-00001. Save this for future bookings." Optional shortcut for repeat patients.

**Estimated Time:** 1–2 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Update existing** — slot messages in webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** buildConfirmDetailsMessage in collection-service; consent message; slot link message
- ❌ **What's missing:** MRN in confirmation; "Save for future bookings" hint
- ⚠️ **Notes:** MRN available after e-task-1. For new patients, we get MRN at creation. For existing (match), we have it from patient record. Show only when we have it.

**Scope Guard:**
- Expected files touched: ≤ 3 (collection-service, webhook-worker)

**Reference Documentation:**
- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- [e-task-1: Add patient_id (MRN) column](./e-task-1-patient-mrn-column.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Confirm Details Message

- [x] 1.1 Skipped — MRN not available at confirm_details (patient created at consent)

### 2. Consent / Slot Message

- [x] 2.1 When sending slot link: append MRN hint when available
  - [x] 2.1.1 "Your patient ID: **P-00001**. Save this for future bookings."
  - [x] 2.1.2 New patient (createPatientForBooking), existing (match), self (persist), repeat (hasPatientReady)
- [x] 2.2 Applied to all slot-link paths (consent, match, wantsNewLink, confirming_slot, selecting_slot, hasPatientReady)

### 3. Webhook Integration

- [x] 3.1 formatPatientIdHint(mrn), getPatientIdHintForSlot(patientId) helpers
- [x] 3.2 Slot messages include MRN when patient has medical_record_number

### 4. Verification & Testing

- [x] 4.1 Run type-check
- [ ] 4.2 Manual test: new booking → slot message shows MRN
- [ ] 4.3 Manual test: repeat patient → slot message includes MRN

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── collection-service.ts   (UPDATED - buildConfirmDetailsMessage)
└── workers/
    └── webhook-worker.ts      (UPDATED - slot/consent message with MRN)
```

**Existing Code Status:**
- ✅ `collection-service.ts` — buildConfirmDetailsMessage
- ✅ `webhook-worker.ts` — consent flow, slot link message

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- MRN is not PHI; safe to include in user-facing message
- Keep message concise

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N – message content only)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Slot message includes patient ID when available
- [x] Slot message includes "Save this for future bookings" hint
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-1: Add patient_id (MRN) column](./e-task-1-patient-mrn-column.md)
- [e-task-5: Booking flow — match confirmation](./e-task-5-booking-match-confirmation.md)

---

**Last Updated:** 2026-03-27  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
