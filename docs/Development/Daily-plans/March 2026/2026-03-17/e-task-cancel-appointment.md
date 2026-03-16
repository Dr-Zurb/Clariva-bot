# Task: Appointment Cancellation
## Cancel & Reschedule Initiative — Part 1

---

## 📋 Task Overview

Implement the appointment cancellation flow so patients can cancel upcoming appointments via the bot (Instagram DM). When a patient says "cancel" or "cancel my appointment", the bot identifies their appointments, lets them choose which one (if multiple), confirms, updates status to `cancelled`, and notifies the doctor.

**Estimated Time:** 4–6 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-17

**Change Type:**
- [ ] **Update existing** — Add cancel handler to webhook-worker; add admin cancel function to appointment-service; extend conversation state. Follow [CODE_CHANGE_RULES.md](../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `cancel_appointment` intent in `backend/src/types/ai.ts`; AI classifies it; `updateAppointmentStatus(id, status, correlationId, userId)` in appointment-service (doctor-only, uses supabase user client); `listAppointmentsForPatient(patientId, doctorId, correlationId)`; `check_appointment_status` flow in webhook-worker (lists upcoming, formats dates)
- ❌ **What's missing:** Webhook handler for `cancel_appointment`; conversation steps (`awaiting_cancel_confirmation`, `awaiting_cancel_choice`); admin-side cancel function (no userId, for webhook worker); doctor notification on cancel
- ⚠️ **Notes:** `updateAppointmentStatus` requires `userId` (doctor JWT). Webhook worker has no user context; needs admin client variant that validates appointment belongs to doctor + patient before updating.

**Scope Guard:**
- Expected files touched: ≤ 6
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../CODE_CHANGE_RULES.md)
- [FEATURE_PRIORITY.md](../../Business%20files/FEATURE_PRIORITY.md) §12 Appointment Cancellation
- [APPOINTMENT_BOOKING_FLOW.md](../../Reference/APPOINTMENT_BOOKING_FLOW.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend: Admin Cancel Function

- [x] 1.1 Add `cancelAppointmentForPatient` in `appointment-service.ts`
  - [ ] 1.1.1 Signature: `(appointmentId: string, patientId: string, doctorId: string, correlationId: string) => Promise<Appointment>`
  - [ ] 1.1.2 Use `getSupabaseAdminClient()` (no user JWT)
  - [ ] 1.1.3 Fetch appointment; validate `appointment.doctor_id === doctorId` and `appointment.patient_id === patientId`
  - [ ] 1.1.4 Validate status is `pending` or `confirmed` (cannot cancel already cancelled/completed)
  - [ ] 1.1.5 Update `status` to `cancelled`; return updated row
  - [ ] 1.1.6 Audit log: `logDataModification(correlationId, undefined, 'update', 'appointment', id, ['status'])` (system operation)
- [x] 1.2 Add `getAppointmentByIdForWorker` usage or new `getAppointmentByIdForCancel` if needed (validate ownership)

### 2. Conversation State: Cancel Steps

- [x] 2.1 Extend `ConversationState` in `backend/src/types/conversation.ts`
  - [ ] 2.1.1 Add `cancelAppointmentId?: string` — appointment ID when user has chosen which one to cancel
  - [ ] 2.1.2 Add `pendingCancelAppointmentIds?: string[]` — when multiple appointments, store IDs for "1", "2" mapping
- [x] 2.2 Add step values: `awaiting_cancel_choice` (user picks which appointment), `awaiting_cancel_confirmation` (user confirms Yes/No)

### 3. Webhook: Cancel Intent Handler

- [x] 3.1 Add handler for `intentResult.intent === 'cancel_appointment'` (before or after `check_appointment_status` block)
- [x] 3.2 **Patient identification:** Use same pattern as `check_appointment_status`
  - [x] 3.2.1 `patientIdsList = [conversation.patient_id]` plus `lastBookingPatientId`, `bookingForPatientId` if not self-only
  - [x] 3.2.2 Filter nulls from list before calling `listAppointmentsForPatient`
- [x] 3.3 **List upcoming appointments:** Reuse logic from check_appointment_status
  - [x] 3.3.1 `upcoming = appointments.filter(a => date >= now && (pending|confirmed))`
  - [x] 3.3.2 If `upcoming.length === 0`: reply "You don't have any upcoming appointments. Say 'book appointment' to schedule one." → `step: 'responded'`
- [x] 3.4 **Single appointment:**
  - [x] 3.4.1 Reply: "Your appointment is on [date] at [time]. Reply **Yes** to cancel, or **No** to keep it."
  - [x] 3.4.2 Set `step: 'awaiting_cancel_confirmation'`, `cancelAppointmentId: upcoming[0].id`
- [x] 3.5 **Multiple appointments:**
  - [x] 3.5.1 Reply: "Which appointment would you like to cancel? 1) [date] 2) [date] ..."
  - [x] 3.5.2 Set `step: 'awaiting_cancel_choice'`, store `pendingCancelAppointmentIds: string[]` (or similar) in state

### 4. Webhook: Cancel Choice & Confirmation Replies

- [x] 4.1 **When `step === 'awaiting_cancel_choice'`:**
  - [x] 4.1.1 Parse reply as "1", "2", etc.; map to appointment ID from `pendingCancelAppointmentIds`
  - [x] 4.1.2 If valid: "Cancel appointment on [date]? Reply **Yes** or **No**." → `step: 'awaiting_cancel_confirmation'`, `cancelAppointmentId`
  - [x] 4.1.3 If invalid: "Please reply 1, 2, or 3." (retry)
- [x] 4.2 **When `step === 'awaiting_cancel_confirmation'`:**
  - [x] 4.2.1 Parse "Yes"/"No" (case-insensitive; "cancel", "confirm" → Yes; "no", "keep" → No)
  - [x] 4.2.2 If Yes: call `cancelAppointmentForPatient(cancelAppointmentId, patientId, doctorId, correlationId)`
  - [x] 4.2.3 Send confirmation to patient: "Your appointment on [date] has been cancelled."
  - [x] 4.2.4 Notify doctor (see 5.x)
  - [x] 4.2.5 Clear `cancelAppointmentId`, set `step: 'responded'`
  - [x] 4.2.6 If No: "No problem. Your appointment is still scheduled." → `step: 'responded'`

### 5. Doctor Notification on Cancel

- [x] 5.1 Add `sendAppointmentCancelledToDoctor` in `notification-service.ts`
  - [x] 5.1.1 Similar to `sendNewAppointmentToDoctor`; content: "An appointment has been cancelled: [date]. Appointment ID: [id]" (no PHI)
  - [x] 5.1.2 Audit log; no PHI in logs
- [x] 5.2 Call from webhook after successful cancel (4.2.4)

### 6. AI Prompt: Cancel Intent

- [x] 6.1 Ensure `classifyIntent` prompt includes `cancel_appointment` with examples ("cancel", "cancel my appointment", "I need to cancel")
- [x] 6.2 Verify `generateResponse` fallback suggests "cancel appointment" when unclear

### 7. Edge Cases

- [ ] 7.1 **User in collection flow says "cancel":** Treat as cancel intent; exit collection (or allow—design choice: cancel takes precedence)
- [ ] 7.2 **Cancellation policy:** `cancellation_policy_hours` in doctor_settings—optional: warn if within policy window ("Cancelling within X hours may incur a fee. Still cancel?")
- [ ] 7.3 **Payment/refund:** Out of scope for this task; document as future work

### 8. Verification & Testing

- [ ] 8.1 Run `pnpm typecheck` (or equivalent)
- [ ] 8.2 Manual test: 1 upcoming → cancel → confirm Yes → status cancelled, doctor notified
- [ ] 8.3 Manual test: 2+ upcoming → choose 1 → confirm Yes → correct one cancelled
- [ ] 8.4 Manual test: confirm No → appointment unchanged
- [ ] 8.5 Unit test (optional): `cancelAppointmentForPatient` validates ownership, rejects wrong patient/doctor

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── appointment-service.ts   (UPDATE - add cancelAppointmentForPatient)
│   └── notification-service.ts (UPDATE - add sendAppointmentCancelledToDoctor)
├── types/
│   └── conversation.ts         (UPDATE - add cancel steps, cancelAppointmentId)
└── workers/
    └── webhook-worker.ts       (UPDATE - cancel intent handler, choice/confirmation replies)
```

**Existing Code Status:**
- ✅ `appointment-service.ts` — updateAppointmentStatus (doctor-only), listAppointmentsForPatient
- ✅ `notification-service.ts` — sendNewAppointmentToDoctor, sendPaymentReceivedToDoctor
- ✅ `conversation.ts` — ConversationState, PatientCollectionStep
- ✅ `webhook-worker.ts` — check_appointment_status flow, intent branching

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Admin cancel must validate appointment belongs to (doctorId, patientId) before update
- Use existing patterns: formatAppointmentStatusLine, doctor timezone from settings
- Conversation state: no PHI in metadata (only IDs)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y)
  - [ ] **RLS verified?** (Y) — Admin client bypasses RLS; we validate ownership in code
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (Y for classifyIntent/generateResponse)
  - [ ] **Consent + redaction confirmed?** (Y — existing flow)
- [ ] **Retention / deletion impact?** (N — status update only)

---

## ✅ Acceptance & Verification Criteria

- [ ] Patient can cancel single upcoming appointment via DM
- [ ] Patient can choose which appointment to cancel when multiple
- [ ] Confirmation step (Yes/No) prevents accidental cancel
- [ ] Doctor receives email notification on cancel
- [ ] Appointment status set to `cancelled` in DB
- [ ] No PHI in logs

---

## 🐛 Issues Encountered & Resolved

(To be filled during implementation)

---

## 📝 Notes

- **Reschedule** depends on this task (same patient identification, similar flow). See [e-task-reschedule-appointment.md](./e-task-reschedule-appointment.md).
- **Refund handling** (Razorpay/PayPal) is out of scope; document for future task.

---

## 🔗 Related Tasks

- [e-task-reschedule-appointment.md](./e-task-reschedule-appointment.md) — Part 2 of Cancel & Reschedule initiative

---

**Last Updated:** 2026-03-17  
**Completed:** 2026-03-17  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../TASK_MANAGEMENT_GUIDE.md)
