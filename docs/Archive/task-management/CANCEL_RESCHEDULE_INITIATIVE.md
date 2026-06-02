# Cancel & Reschedule Initiative

**Purpose:** Enable patients to cancel or reschedule upcoming appointments via the AI receptionist bot (Instagram DM).

**Business Context:** [FEATURE_PRIORITY.md](../Business%20files/FEATURE_PRIORITY.md) §12–13 — P0 problems: Time Consumption. Reduces doctor admin and improves patient experience.

---

## Overview

| Phase | Task | Description |
|-------|------|-------------|
| 1 | [e-task-cancel-appointment](./tasks/e-task-cancel-appointment.md) | Cancel flow: list appointments → choose (if multiple) → confirm Yes/No → update status → notify doctor |
| 2 | [e-task-reschedule-appointment](./tasks/e-task-reschedule-appointment.md) | Reschedule flow: list appointments → choose (if multiple) → slot link → update date → confirm |

**Order:** Complete cancel first. Reschedule reuses patient identification and list-upcoming logic.

---

## Shared Design Decisions

### Patient Identification

Same pattern as `check_appointment_status`:

- `conversation.patient_id` (primary)
- `state.lastBookingPatientId` (recent booking for someone else)
- `state.bookingForPatientId` (booking for another person)

Filter nulls before calling `listAppointmentsForPatient`. If no patient IDs, reply: "You don't have any upcoming appointments."

### Admin vs User Client

Webhook worker has no doctor JWT. Use `getSupabaseAdminClient()` for:

- `cancelAppointmentForPatient` — validate `(doctorId, patientId)` ownership, then update status
- `updateAppointmentDateForPatient` — same validation, update `appointment_date`

### Conversation Steps

| Step | Meaning |
|------|---------|
| `awaiting_cancel_choice` | User has multiple appointments; waiting for "1", "2", etc. |
| `awaiting_cancel_confirmation` | User chose one; waiting for "Yes" or "No" |
| `awaiting_reschedule_choice` | Same as cancel choice |
| `awaiting_reschedule_slot` | Sent slot link; user picks on web; no DM reply expected until done |

---

## Out of Scope (Future)

- **Refund handling:** Razorpay/PayPal refund when cancelling paid appointment
- **Cancellation policy fee:** Warn if cancelling within `cancellation_policy_hours` (optional enhancement)
- **Anonymous users:** If conversation has no linked patient (edge case), could ask for phone to look up — defer to later

---

## Task Files

- [e-task-cancel-appointment.md](./tasks/e-task-cancel-appointment.md)
- [e-task-reschedule-appointment.md](./tasks/e-task-reschedule-appointment.md)

---

**Last Updated:** 2026-03-28
