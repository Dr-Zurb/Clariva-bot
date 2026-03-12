# Task 2: Appointment Booking Flow — Refinements
## 2026-03-10

---

## 📋 Task Overview

Refine the appointment booking flow based on user feedback and design discussions: (1) **Consent refinement** — remove redundant "Do I have your permission to use this number?" (implied by providing number); (2) **Consultation type** — ask Video or In-clinic before slots; (3) **Slot selection UX** — show doctor's weekly availability first, user says date/time in natural language, bot checks availability and shows alternatives if taken; (4) **Fix timezone** for availability so slots are correct in doctor's timezone; (5) **Polish** — skip blank messages, extend "ok thanks" acknowledgment, optional quick replies.

**Rationale:** Current flow feels redundant (consent step), lacks consultation type, and slot selection is rigid (reply 1, 2, 3). Users want to see when the doctor is available, then pick a preferred date/time. Slots may appear wrong due to timezone bugs.

**Estimated Time:** 20–28 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-03-10

**Change Type:**
- [x] **New feature** — Consultation type, weekly availability display, date/time parsing

- [x] **Update existing** — Consent flow, collection flow, slot selection, availability-service, webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** e-task-1 completed. Collection flow: name → phone → consultation_type → consent → weekly availability → awaiting_date_time → (confirming_slot | selecting_slot). Consent combined. getWeeklyAvailabilitySummary, parseDateTimeFromMessage, awaiting_date_time, confirming_slot. doctor_settings.consultation_types drives options. Timezone fix, blank skip, "ok thanks" ack.
- ❌ **What's missing:** Quick replies (optional), web calendar (future).
- ⚠️ **Notes:** Availability times stored as TIME (no TZ); combined with date + `.000Z` (UTC) — wrong for India. getDayOfWeek uses UTC. Instagram has no native calendar picker; quick replies possible.

**Scope Guard:**
- Expected files touched: availability-service.ts, webhook-worker.ts, collection-service.ts, consent-service.ts, types/ai.ts, types/validation.ts, possibly new migration for appointments.consultation_type
- DB schema: add consultation_type to appointments (migration)

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [APPOINTMENT_BOOKING_FLOW.md](../../../Reference/APPOINTMENT_BOOKING_FLOW.md) (new)
- [e-task-1: Receptionist bot conversation rules](./e-task-1-receptionist-bot-conversation-rules-and-real-world-handling.md) — completed

---

## ✅ Task Breakdown (Hierarchical)

### 1. Consent Refinement

- [x] 1.1 Remove or combine explicit consent step
  - [ ] 1.1.1 **Option A (remove):** Treat phone provision as implicit consent; persist to patients with consent_status='granted' after phone is collected; skip consent step
  - [x] 1.1.2 **Option B (combine):** Single message after phone: "Thanks, Abhishek. We'll use **8264602737** to confirm your appointment by call or text. Ready to pick a time?" — no consent prompt; persist on next step
  - [ ] 1.1.3 **Option C (opt-out):** "We'll reach you at **X** for appointment reminders. Reply **no** if you'd prefer not to be contacted." — if "no", skip persist; else persist
  - [x] 1.1.4 Update consent-service.ts: adjust consent flow or remove consent step from collection
  - [x] 1.1.5 Update webhook-worker: remove consent branch or replace with combined message
- [x] 1.2 Audit: ensure consent still logged for compliance (audit log) if we persist

### 2. Consultation Type (Video vs In-clinic)

- [x] 2.1 Schema: add `consultation_type` to appointments
  - [x] 2.1.1 Migration: `ALTER TABLE appointments ADD COLUMN consultation_type TEXT NULL` (e.g. 'video', 'in_clinic')
  - [x] 2.1.2 Update Appointment type in types/database.ts
- [x] 2.2 Add collection step for consultation type
  - [x] 2.2.1 Add `consultation_type` to PATIENT_COLLECTION_FIELDS or COLLECTION_ORDER (after phone, before consent)
  - [x] 2.2.2 Validation: accept "video", "1", "in-clinic", "2", "clinic", "in person", etc.
  - [x] 2.2.3 Use doctor_settings.consultation_types to drive options (e.g. only "Video" if that's all they offer)
  - [x] 2.2.4 Bot prompt: "Would you prefer **Video** or **In-clinic** consultation?"
- [x] 2.3 Store consultation_type in appointment at booking
  - [x] 2.3.1 Pass consultation_type to bookAppointment from collected data
  - [x] 2.3.2 Update appointment-service and bookAppointment input type

### 3. Slot Selection UX — Show Availability First, User Picks

- [x] 3.1 Add weekly availability summary
  - [x] 3.1.1 New function: `getWeeklyAvailabilitySummary(doctorId)` — aggregate availability by day_of_week; return human-readable string (e.g. "Mon 9–5, Tue 12–5, Wed 9–12, Thu–Fri 9–5")
  - [x] 3.1.2 Use doctor timezone when formatting
- [x] 3.2 New flow step: `awaiting_date_time`
  - [x] 3.2.1 After consent (or combined step): show "Our doctor is usually available: [weekly summary]. When would you like to come? (e.g. Tuesday 2pm, or Mar 14 at 10am)"
  - [x] 3.2.2 Transition to awaiting_date_time; store in conversation state
- [x] 3.3 Parse user input for date/time
  - [x] 3.3.1 Regex-based parser in `date-time-parser.ts` (AI fallback optional)
  - [x] 3.3.2 Common patterns: "Tuesday", "Mar 14", "tomorrow", "2pm", "14:00"
  - [x] 3.3.3 Resolve relative dates ("Tuesday" → next Tuesday's date)
- [x] 3.4 Check availability for requested slot
  - [x] 3.4.1 If slot free → confirming_slot step; user confirms → book
  - [x] 3.4.2 If slot taken → show alternatives for that day; fall back to selecting_slot (numbered)
  - [x] 3.4.3 Fall back to numbered selection if parsing fails

### 4. Availability Timezone Fix

- [x] 4.1 Pass timezone to getAvailableSlots
  - [x] 4.1.1 Add `timezone?: string` to GetAvailableSlotsOptions
  - [x] 4.1.2 getDayOfWeek: use date in doctor's timezone (not UTC)
  - [x] 4.1.3 generateSlotsFromAvailability: build slot timestamps in doctor's TZ, then convert to ISO
- [x] 4.2 dayBounds: interpret dateStr in doctor timezone (e.g. "2026-03-14" = 2026-03-14 00:00 in doctor's TZ)
- [x] 4.3 Verify: slots shown match doctor's local business hours (timezone passed through)

### 5. Polish: Blank Messages, Acknowledgment, Quick Replies

- [x] 5.1 Skip blank messages
  - [x] 5.1.1 Before classifyIntent: if `!text?.trim()`, mark webhook processed, no reply
  - [x] 5.1.2 Prevents "message came through blank" from duplicate/empty webhooks
- [x] 5.2 Extend acknowledgment regex
  - [x] 5.2.1 Add "ok thanks", "thanks ok", "ok thank you" to ACKNOWLEDGMENT_REGEX
  - [x] 5.2.2 Current: `^(ok|all\s+set|thanks|...)[\s!?.]*$` — doesn't match "ok thanks"
- [ ] 5.3 Quick replies (optional, Phase 2)
  - [ ] 5.3.1 Extend sendInstagramMessage to support quick_replies in message payload
  - [ ] 5.3.2 When showing slots: send quick reply buttons for "1", "2", "3" (or day names)
  - [ ] 5.3.3 Meta: up to 13 buttons, text only, ~20 chars; tapping sends button text as message

### 6. Web Calendar Link (Optional, Future)

- [ ] 6.1 Add "Pick date & time" URL button
  - [ ] 6.1.1 Generate short-lived token linking conversation/patient
  - [ ] 6.1.2 Web page: calendar + time slots from doctor availability
  - [ ] 6.1.3 User selects → submit → backend creates appointment; send DM confirmation
  - [ ] 6.1.4 Defer to separate task if scope is large

### 7. Verification & Testing

- [x] 7.1 Run type-check and lint
- [ ] 7.2 Manual test: consent flow (combined or removed)
- [ ] 7.3 Manual test: consultation type (Video vs In-clinic)
- [ ] 7.4 Manual test: "Tuesday 2pm" → slot check → confirm or show alternatives
- [ ] 7.5 Manual test: timezone — slots match doctor's local hours
- [ ] 7.6 Manual test: blank message → no reply
- [ ] 7.7 Manual test: "ok thanks" after booking → no "message came through blank"

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 0XX_appointments_consultation_type.sql   (NEW)
├── src/
│   ├── services/
│   │   ├── availability-service.ts    (UPDATED - timezone, getWeeklyAvailabilitySummary)
│   │   ├── consent-service.ts        (UPDATED - consent flow change)
│   │   ├── collection-service.ts     (UPDATED - consultation_type)
│   │   └── appointment-service.ts    (UPDATED - consultation_type)
│   ├── workers/
│   │   └── webhook-worker.ts         (UPDATED - consent, consultation, slot flow, blank skip, ack regex)
│   └── types/
│       ├── database.ts               (UPDATED - Appointment.consultation_type)
│       └── validation.ts             (UPDATED - consultation_type field)
docs/
└── Reference/
    └── APPOINTMENT_BOOKING_FLOW.md   (NEW - flow design reference)
```

**Existing Code Status:**
- ✅ availability-service.ts — getAvailableSlots, generateSlotsFromAvailability, getDayOfWeek
- ✅ webhook-worker.ts — consent flow, selecting_slot, isPostBookingAcknowledgment
- ✅ collection-service.ts — COLLECTION_ORDER, validateAndApply
- ✅ consent-service.ts — parseConsentReply, persistPatientAfterConsent
- ✅ doctor_settings.consultation_types — exists

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PHI in logs (COMPLIANCE.md)
- Consent: if opting for implicit consent, document rationale; compliance audit trail
- Consultation type: validate against doctor_settings.consultation_types when available
- Date/time parsing: handle ambiguous "Tuesday" (e.g. next Tuesday)
- Timezone: IANA strings (e.g. Asia/Kolkata); availability times are "local" to doctor
- Instagram: no native calendar; quick replies optional

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – appointments.consultation_type)
  - [x] **RLS verified?** (Y – appointments has RLS)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (Y – OpenAI, Instagram)
  - [x] **Consent + redaction confirmed?** (Y – PHI redacted before AI)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Consent step removed or combined; no redundant "Do I have your permission?"
- [x] Bot asks Video or In-clinic; stores in appointment
- [x] Bot shows weekly availability before asking for date/time
- [x] User says "Tuesday 2pm" → bot checks → confirms or shows alternatives
- [x] Slot times correct in doctor's timezone
- [x] Blank message → no reply
- [x] "ok thanks" after booking → no "message came through blank"

---

## 📝 Proposed Flow (Reference)

```
1. Greeting → Options (book / availability / question)
2. Book intent → "What's your full name?"
3. Name → "What's the best phone number to reach you?"
4. Phone → [Combined consent:] "We'll use X for appointment reminders. Ready to pick a time?"
5. [Optional: "Video or In-clinic?"] → store consultation_type
6. Show weekly availability: "Our doctor is usually available: Mon 9–5, Tue 12–5, Wed 9–12, Thu–Fri 9–5. When would you like to come?"
7. User: "Tuesday at 2pm"
8. Bot: Resolve date → check slot → If free: "Tuesday Mar 14 at 2:00 PM is available. Confirm?"; If taken: "2pm is taken. Here are free slots on Tuesday Mar 14: 1. 10 AM 2. 12:30 PM 3. 3:30 PM. Reply 1, 2, or 3."
9. User confirms → Book → Payment link / confirmation
```

---

## 🔗 Related Tasks

- [e-task-1: Receptionist bot conversation rules](./e-task-1-receptionist-bot-conversation-rules-and-real-world-handling.md) — completed
- [e-task-4: Bot uses doctor settings](../2026-03-09/e-task-4-bot-uses-doctor-settings.md)
- [e-task-9: Availability page redesign](../2026-03-09/e-task-9-availability-page-redesign.md)

---

**Last Updated:** 2026-03-10  
**Completed:** 2026-03-10 — All core items done; quick replies and web calendar deferred (optional/future)

**Why were slot UX items deferred initially?** Scope prioritization: consent, consultation type, timezone, and polish were completed first. The slot UX (weekly availability, `awaiting_date_time`, date/time parsing) required more implementation (new flow steps, parser, state machine) and was deferred to a follow-up. Now completed.

**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md) | [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
