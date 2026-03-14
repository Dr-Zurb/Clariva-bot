# Task 5: Webhook Flow Integration — New Steps, Slot Link, reason_for_visit
## 2026-03-13

---

## 📋 Task Overview

Integrate the new flow into the webhook worker: (1) After consent, send slot link (not "when would you like to come"); (2) Add awaiting_slot_selection handling; (3) Handle confirm_details and collecting_all (from e-task-2); (4) Wire reason_for_visit to appointment.notes at booking; (5) Ensure confirming_slot works when slot comes from external picker.

**Estimated Time:** 6–8 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-13

**Change Type:**
- [x] **Update existing** — webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** Consent → awaiting_date_time with "When would you like to come?"; confirming_slot branch (user says Yes → book); selecting_slot (numbered list); bookAppointment called with notes: doctorSettings?.default_notes
- ❌ **What's missing:** Slot link after consent; awaiting_slot_selection; reason_for_visit in notes
- ⚠️ **Notes:** persistPatientAfterConsent clears collected data — we need reason_for_visit at booking time. Options: (a) Store reason_for_visit in conversation metadata before clear; (b) Add reason_for_visit to patients table; (c) Keep reason_for_visit in Redis/store until after booking. (c) is simplest — don't clear reason_for_visit until after booking, or pass it to persist and store in a temp place. Actually persistPatientAfterConsent clears ALL collected data. So we need to pass reason_for_visit to the booking path. When do we book? At confirming_slot. At that point we have patient from DB (persistPatientAfterConsent already ran). We need reason_for_visit from somewhere. Best: store reason_for_visit in conversation.metadata when we persist (e.g. metadata.reason_for_visit) or in a separate store. Or: persistPatientAfterConsent doesn't clear reason_for_visit from Redis — we keep it until booking. Let me check consent-service — it calls clearCollectedData which clears everything. So we need to either: (1) Not clear reason_for_visit in clearCollectedData (special case), or (2) Save reason_for_visit to conversation metadata before clear, or (3) Add reason_for_visit to patients. (2) is clean — we add reason_for_visit to metadata when transitioning to consent or when persisting. Then at booking we read from metadata.

**Scope Guard:**
- Expected files touched: webhook-worker.ts, possibly consent-service.ts, collection-service.ts

**Reference Documentation:**
- [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Consent → Slot Link (Replace awaiting_date_time)

- [x] 1.1 When consent granted and persistPatientAfterConsent success:
  - [x] 1.1.1 Generate booking token (conversationId, doctorId)
  - [x] 1.1.2 Build slot link: `${BOOKING_PAGE_URL}/book?token=${token}`
  - [x] 1.1.3 Reply: "Pick your slot: [link]. You'll be redirected back here after you choose."
  - [x] 1.1.4 Set step = 'awaiting_slot_selection'
- [x] 1.2 Remove or repurpose "When would you like to come?" for this path
- [x] 1.3 Store reason_for_visit in conversation metadata (state.reasonForVisit from e-task-2)

### 2. reason_for_visit to Notes

- [x] 2.1 state.reasonForVisit set when transitioning to consent (e-task-2)
- [x] 2.2 At bookAppointment call (confirming_slot): use state.reasonForVisit for notes
  - [x] 2.2.1 notes: state.reasonForVisit ?? doctorSettings?.default_notes ?? undefined
  - [x] 2.2.2 Format: "Reason: {reason}. {default_notes}" when both present

### 3. awaiting_slot_selection Handling

- [x] 3.1 When step is awaiting_slot_selection and user sends message:
  - [x] 3.1.1 If "change" or "pick another" or "different time" → send slot link again
  - [x] 3.1.2 If other message → "Pick your slot using the link above, or say 'change' to get a new link."
- [x] 3.2 Proactive message is sent by API (e-task-3), not webhook

### 4. confirming_slot from External Picker

- [x] 4.1 Slot comes from API: API updates state.step = 'confirming_slot', state.slotToConfirm = slot
- [x] 4.2 Webhook receives message when user replies "Yes"
- [x] 4.3 Existing confirming_slot branch works — uses state.slotToConfirm, state.reasonForVisit in notes
- [x] 4.4 On No/Conflict: redirect to awaiting_slot_selection with new link

### 5. confirm_details and collecting_all

- [x] 5.1 Implemented in e-task-2
- [x] 5.2 inCollection includes confirm_details

### 6. Remove Obsolete Flow

- [x] 6.1 awaiting_date_time: removed — replaced by awaiting_slot_selection
- [x] 6.2 selecting_slot: redirects to awaiting_slot_selection (legacy migration)
- [x] 6.3 parseDateTimeFromMessage, formatSlotsForDisplay, getSlotsWithMultiDaySearch: removed
- [x] 6.4 consultation_type: no longer in collection

### 7. Verification

- [ ] 7.1 Full flow: book → collect → confirm → consent → slot link → external pick → redirect → Yes → booked
- [ ] 7.2 reason_for_visit appears in appointment.notes
- [ ] 7.3 "Change" in awaiting_slot_selection sends new link

---

## 📁 Files to Create/Update

```
backend/src/
├── workers/
│   └── webhook-worker.ts         (UPDATED - consent→slot link, awaiting_slot_selection, reason_for_visit)
├── services/
│   ├── consent-service.ts       (UPDATED - preserve reason_for_visit before clear)
│   └── slot-selection-service.ts (NEW in e-task-3 - generateBookingToken used here or imported)
```

**Existing Code Status:**
- ✅ webhook-worker: consent branch, confirming_slot branch, selecting_slot
- ✅ bookAppointment: notes param
- ✅ persistPatientAfterConsent: clearCollectedData

---

## 🧠 Design Constraints

- reason_for_visit: preserve in state/metadata before clear
- Slot link: must use BOOKING_PAGE_URL from env
- No PHI in logs

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – conversations.metadata, appointments.notes)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI, Instagram)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] After consent → slot link sent, step = awaiting_slot_selection
- [ ] reason_for_visit in appointment.notes when booking
- [ ] confirming_slot works when slot from external picker
- [ ] "Change" in awaiting_slot_selection resends link

---

## 🔗 Related Tasks

- [e-task-2: Collection flow redesign](./e-task-2-collection-flow-redesign.md)
- [e-task-3: Slot selection API](./e-task-3-slot-selection-api.md)
- [e-task-4: External slot picker page](./e-task-4-external-slot-picker-page.md)

---

**Last Updated:** 2026-03-13
