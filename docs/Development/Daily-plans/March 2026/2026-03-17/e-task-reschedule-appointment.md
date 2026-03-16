# Task: Appointment Rescheduling
## Cancel & Reschedule Initiative — Part 2

---

## 📋 Task Overview

Implement the appointment rescheduling flow so patients can change the date/time of an upcoming appointment via the bot. When a patient says "reschedule" or "change my appointment", the bot identifies their appointments, lets them choose which one (if multiple), shows available slots, and updates the appointment to the new time.

**Estimated Time:** 5–7 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-17

**Change Type:**
- [ ] **Update existing** — Add reschedule intent, handler, and update logic. Extend booking token and slot-selection for reschedule mode. Follow [CODE_CHANGE_RULES.md](../CODE_CHANGE_RULES.md)

**Dependencies:** [e-task-cancel-appointment.md](./e-task-cancel-appointment.md) — Patient identification and list-upcoming pattern are reused.

**Current State:**
- ✅ **What exists:** `listAppointmentsForPatient`, `getAvailableSlots` (availability-service), `buildBookingPageUrl`, `processSlotSelectionAndPay`, `checkSlotConflict`, `cancelAppointmentForPatient` (after cancel task)
- ❌ **What's missing:** `reschedule_appointment` intent; `updateAppointmentDateForPatient` in appointment-service; reschedule handler in webhook; reschedule-aware token/booking page
- ⚠️ **Notes:** Reschedule = update existing appointment's `appointment_date`. No new payment. Slot picker can be reused with reschedule mode (token includes `appointmentId`).

**Scope Guard:**
- Expected files touched: ≤ 8
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../CODE_CHANGE_RULES.md)
- [FEATURE_PRIORITY.md](../../Business%20files/FEATURE_PRIORITY.md) §13 Appointment Rescheduling
- [e-task-cancel-appointment.md](./e-task-cancel-appointment.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Add Reschedule Intent

- [ ] 1.1 Add `reschedule_appointment` to `Intent` type in `backend/src/types/ai.ts`
- [ ] 1.2 Add to `INTENT_VALUES` array
- [ ] 1.3 Update `classifyIntent` prompt in ai-service: include "reschedule", "change my appointment", "move my appointment"
- [ ] 1.4 Update `generateResponse` fallback to suggest "reschedule appointment" when unclear

### 2. Backend: Update Appointment Date (Admin)

- [ ] 2.1 Add `updateAppointmentDateForPatient` in `appointment-service.ts`
  - [ ] 2.1.1 Signature: `(appointmentId: string, newSlotStart: Date, patientId: string, doctorId: string, correlationId: string) => Promise<Appointment>`
  - [ ] 2.1.2 Use `getSupabaseAdminClient()`
  - [ ] 2.1.3 Fetch appointment; validate `doctor_id === doctorId`, `patient_id === patientId`
  - [ ] 2.1.4 Validate status is `pending` or `confirmed`
  - [ ] 2.1.5 Check slot conflict (exclude current appointment from conflict check)
  - [ ] 2.1.6 Update `appointment_date` to newSlotStart; return updated row
  - [ ] 2.1.7 Audit log
- [ ] 2.2 Add `checkSlotConflictExcludingAppointment(doctorId, slotStart, slotEnd, excludeAppointmentId, correlationId)` or extend existing `checkSlotConflict` to accept exclude ID

### 3. Reschedule Token & Slot Selection

- [ ] 3.1 Extend `BookingTokenPayload` in `booking-token.ts`
  - [ ] 3.1.1 Add optional `appointmentId?: string`
  - [ ] 3.1.2 `generateBookingToken` accepts optional `appointmentId`
  - [ ] 3.1.3 `verifyBookingToken` returns `appointmentId` if present
- [ ] 3.2 Add `buildReschedulePageUrl(conversationId, doctorId, appointmentId)` in slot-selection-service
  - [ ] 3.2.1 Generates token with `appointmentId`
  - [ ] 3.2.2 Returns same base URL as booking: `/book?token=...` (token encodes mode)
- [ ] 3.3 Add `processRescheduleSlotSelection` (or extend `processSlotSelection`) in slot-selection-service
  - [ ] 3.3.1 Verify token; extract `appointmentId` if present
  - [ ] 3.3.2 If appointmentId: call `updateAppointmentDateForPatient` instead of creating appointment
  - [ ] 3.3.3 Send confirmation DM: "Your appointment has been rescheduled to [date] at [time]."
  - [ ] 3.3.4 Notify doctor (optional: `sendAppointmentRescheduledToDoctor`)

### 4. API: Reschedule Slot Endpoint

- [ ] 4.1 Add `POST /api/v1/slots/reschedule` or extend existing slot selection route
  - [ ] 4.1.1 Accepts `{ token, slotStart }` (same as selectSlotAndPay)
  - [ ] 4.1.2 If token has appointmentId: call `updateAppointmentDateForPatient`, return success (no payment URL)
  - [ ] 4.1.3 If no appointmentId: existing flow (create + payment)
- [ ] 4.2 Frontend: `selectSlotAndPay` or new `rescheduleSlot` — detect from API response or token

### 5. Webhook: Reschedule Intent Handler

- [ ] 5.1 Add handler for `intentResult.intent === 'reschedule_appointment'`
- [ ] 5.2 **Patient identification:** Same as cancel (conversation.patient_id, lastBookingPatientId, bookingForPatientId)
- [ ] 5.3 **List upcoming:** Reuse cancel logic
  - [ ] 5.3.1 If 0: "You don't have any upcoming appointments. Say 'book appointment' to schedule one."
- [ ] 5.4 **Single appointment:**
  - [ ] 5.4.1 Set `step: 'awaiting_reschedule_slot'`, `rescheduleAppointmentId: upcoming[0].id`
  - [ ] 5.4.2 Build reschedule link: `buildReschedulePageUrl(conversationId, doctorId, appointmentId)`
  - [ ] 5.4.3 Reply: "Pick a new date and time: [Reschedule](${url})"
- [ ] 5.5 **Multiple appointments:**
  - [ ] 5.5.1 Set `step: 'awaiting_reschedule_choice'`, `pendingRescheduleAppointmentIds: string[]`
  - [ ] 5.5.2 Reply: "Which appointment would you like to reschedule? 1) [date] 2) [date] ..."

### 6. Webhook: Reschedule Choice Reply

- [ ] 6.1 **When `step === 'awaiting_reschedule_choice'`:**
  - [ ] 6.1.1 Parse "1", "2", etc.; map to appointment ID
  - [ ] 6.1.2 Set `step: 'awaiting_reschedule_slot'`, `rescheduleAppointmentId`
  - [ ] 6.1.3 Send slot link: "Pick a new date and time: [Choose new slot](${url})"

### 7. Conversation State: Reschedule Steps

- [ ] 7.1 Add to ConversationState: `rescheduleAppointmentId?: string`, `pendingRescheduleAppointmentIds?: string[]`
- [ ] 7.2 Steps: `awaiting_reschedule_choice`, `awaiting_reschedule_slot`
- [ ] 7.3 **Note:** `awaiting_reschedule_slot` means we've sent the link; user will pick on web. No further DM reply needed until they complete. On `processRescheduleSlotSelection` success, we send proactive DM. State can be cleared to `responded` after.

### 8. Frontend: Reschedule Mode on Booking Page

- [ ] 8.1 `getSlotPageInfo` (or equivalent) returns `mode: 'reschedule' | 'book'` when token has appointmentId
- [ ] 8.2 Booking page: when reschedule mode, show "Reschedule Appointment" instead of "Book Appointment"
- [ ] 8.3 On slot select: call reschedule API instead of selectSlotAndPay (or API handles both based on token)
- [ ] 8.4 Success: "Your appointment has been rescheduled." (no payment step)

### 9. Doctor Notification

- [ ] 9.1 Add `sendAppointmentRescheduledToDoctor` in notification-service (optional; can reuse or extend cancel notification)
- [ ] 9.2 Content: "Appointment rescheduled: [patient], from [old date] to [new date]"

### 10. Verification & Testing

- [ ] 10.1 Run typecheck
- [ ] 10.2 Manual test: 1 upcoming → reschedule → pick new slot → appointment updated
- [ ] 10.3 Manual test: 2+ upcoming → choose 1 → pick new slot → correct one updated
- [ ] 10.4 Manual test: slot conflict → error, suggest another slot
- [ ] 10.5 Unit test: `updateAppointmentDateForPatient` validates ownership, rejects conflict

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── appointment-service.ts    (UPDATE - updateAppointmentDateForPatient, conflict check)
│   ├── notification-service.ts   (UPDATE - sendAppointmentRescheduledToDoctor)
│   └── slot-selection-service.ts (UPDATE - buildReschedulePageUrl, processRescheduleSlotSelection)
├── types/
│   ├── ai.ts                     (UPDATE - reschedule_appointment intent)
│   └── conversation.ts           (UPDATE - reschedule steps, rescheduleAppointmentId)
├── utils/
│   └── booking-token.ts          (UPDATE - appointmentId in payload)
├── routes/                       (UPDATE - reschedule slot endpoint)
└── workers/
    └── webhook-worker.ts         (UPDATE - reschedule intent handler)

frontend/
├── app/book/page.tsx             (UPDATE - reschedule mode)
└── lib/api.ts                   (UPDATE - reschedule API call)
```

---

## 🧠 Design Constraints

- No PHI in logs
- Reschedule does not create new payment; existing payment stands
- Slot conflict must exclude the appointment being rescheduled
- Reuse booking page UX where possible (same date picker, slot list)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y)
  - [ ] **RLS verified?** (Y) — Admin client; validate ownership in code
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Patient can reschedule single upcoming appointment via slot link
- [ ] Patient can choose which appointment when multiple
- [ ] Appointment date updated in DB; no duplicate created
- [ ] Slot conflict prevented (cannot double-book)
- [ ] Doctor notified (optional)
- [ ] No PHI in logs

---

## 📝 Notes

### Alternative: DM-Only Reschedule (Simpler, No Frontend)

If reusing the booking page is too complex for initial delivery:

- **Phase 1:** In webhook, call `getAvailableSlots` for next 5–7 days. Format as numbered list: "1. Mon 14th 10am 2. Mon 14th 2pm 3. Tue 15th 9am...". User replies "2". We update appointment. Limit to ~15 slots to avoid message overflow.
- **Trade-off:** Less flexible than web picker; no date navigation. But zero frontend changes.

Document which approach is chosen in implementation notes.

---

## 🔗 Related Tasks

- [e-task-cancel-appointment.md](./e-task-cancel-appointment.md) — Part 1; must complete first for patient-ID pattern

---

**Last Updated:** 2026-03-17  
**Completed:** 2026-03-17  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../TASK_MANAGEMENT_GUIDE.md)
