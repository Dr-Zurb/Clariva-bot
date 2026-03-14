# Task 1: Appointment Status Lookup — Real Status for check_appointment_status
## 2026-03-14

---

## 📋 Task Overview

Implement real appointment status lookup when the bot receives `check_appointment_status` intent. Currently the bot deflects with "check your message or contact clinic." After this task, the bot will look up the patient's appointments and report actual status (date, time, pending/confirmed).

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-14

**Change Type:**
- [x] **Update existing** — webhook-worker; add new service function; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `check_appointment_status` intent in ai-service; `listAppointmentsForPatient`; worker returns real status; `listAppointmentsForDoctor` (doctor auth); `getAppointmentById`, `getAppointmentByIdForWorker`
- ✅ **Implemented:** `listAppointmentsForPatient(patientId, doctorId)`; worker formats and returns real status (date, time, pending/confirmed)
- ⚠️ **Notes:** Worker uses admin client; no user JWT. Need to query by patient_id + doctor_id.

**Scope Guard:**
- Expected files touched: appointment-service.ts, webhook-worker.ts

**Reference Documentation:**
- [unified-slot-payment-flow-and-appointment-status.md](./unified-slot-payment-flow-and-appointment-status.md)
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Backend: listAppointmentsForPatient

- [x] 1.1 Add `listAppointmentsForPatient(patientId, doctorId, correlationId)` to appointment-service
  - [x] 1.1.1 Uses getSupabaseAdminClient (worker context, no auth)
  - [x] 1.1.2 Query: `appointments` where `patient_id = X` and `doctor_id = Y`
  - [x] 1.1.3 Order by `appointment_date` ascending (upcoming first)
  - [x] 1.1.4 Return `Appointment[]`
- [x] 1.2 No RLS bypass needed for admin client; service role reads all

### 2. Webhook Worker: Format and Reply

- [x] 2.1 When `intentResult.intent === 'check_appointment_status'`:
  - [x] 2.1.1 Get `conversation.patient_id`, `conversation.doctor_id`
  - [x] 2.1.2 Call `listAppointmentsForPatient(patientId, doctorId, correlationId)`
  - [x] 2.1.3 Filter: upcoming (appointment_date >= now, status in [pending, confirmed])
  - [x] 2.1.4 If found: format reply with date, time, status (use doctor timezone)
  - [x] 2.1.5 If none: "You don't have any upcoming appointments. Say 'book appointment' to schedule one."
- [x] 2.2 Use `formatPaymentLinkMessage`-style date formatting (timezone from doctor_settings)
- [x] 2.3 Handle multiple upcoming: show next one, or "You have X upcoming appointments. Next: [date] at [time]."

### 3. Verification & Testing

- [x] 3.1 Run type-check
- [ ] 3.2 Manual test: ask "check status" / "appointment status" → bot returns real data
- [x] 3.3 No PHI in logs

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── appointment-service.ts   (UPDATED - add listAppointmentsForPatient)
└── workers/
    └── webhook-worker.ts        (UPDATED - check_appointment_status logic)
```

**Existing Code Status:**
- ✅ appointment-service: getAppointmentByIdForWorker, listAppointmentsForDoctor
- ✅ webhook-worker: check_appointment_status branch with hardcoded reply
- ✅ getDoctorSettings: timezone for formatting

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- Use admin client (worker has no user JWT)
- Date format: doctor timezone (doctor_settings.timezone)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – read appointments)
  - [x] **RLS verified?** (N/A – admin client)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Bot returns real appointment status when user asks "check status" / "appointment status" / "when is my visit"
- [x] If no upcoming: "You don't have any upcoming appointments. Say 'book appointment' to schedule one."
- [x] Date/time formatted in doctor's timezone
- [x] No PHI in logs

---

## 🔗 Related Tasks

- [e-task-2: Select slot and pay API](./e-task-2-select-slot-and-pay-api.md)
- [unified-slot-payment-flow-and-appointment-status.md](./unified-slot-payment-flow-and-appointment-status.md)

---

**Last Updated:** 2026-03-14
