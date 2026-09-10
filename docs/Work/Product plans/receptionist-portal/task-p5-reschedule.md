# P5.2 — Reschedule from the desk

**Status:** Implemented 2026-08-31.  
**Parent:** [`plan-05-desk-day-ops.md`](./plan-05-desk-day-ops.md) (D5-6, D5-8, RQ8).  
**Acceptance:** Receptionist moves a waiting/booked visit to another clock slot or another calendar day. Patient stays the same row (no second appointment). Check-in lock and Today update.

---

## What to ship

`POST /api/v1/appointments/:id/desk-reschedule` (`allowStaff`).

Body: `appointmentDate` ISO (same Zod as desk create). Optional `bookingOrigin` stays as-is unless moving a walk-in to a future clock slot — then set `booked` so RQ7 notify can apply later.

Service: new `rescheduleAppointmentForDesk` — **do not** call `updateAppointmentDateForPatient` from the controller (webhook `patientId` check). You may **extract** shared slot/queue internals if that stays inside `appointment-service.ts` without widening the webhook function’s contract.

Rules:

- Same ownership / status gates as cancel-waiting.  
- Checked-in → refuse (slice 3).  
- Past target → ValidationError.  
- **Queue, same session date, still waiting, no till row:** **keep token** (RQ8 default).  
- **Queue, new session date:** delete old queue row, new token on the new day (today’s patient-reschedule behaviour).  
- **Slot day + booked origin:** clock conflict check; walk-in-on-slot-day already skips clock (existing `enforcesClockSlot`).  
- Same-day lock: moving off today frees today; moving onto a day the patient already occupies → 409 `already_on_today`.

Response: lean appointment (id, date, status, token). No clinical join required.

### UI

- Today + Check-in card: **Move** next to Cancel.  
- Reuse desk slot date + available-slots list (same as Book a time).  
- Queue-only day with no clocks: date picker + “Move to that day’s list.”  
- After success: invalidate `queryKeys.desk.all`.

Notify: out of this task unless RQ7 path is a one-liner reuse of `sendDeskBookingConfirmationToPatient` for `booked` only — do not invent cancel/move copy.

---

## Scope Guard — DO NOT TOUCH

- Slice 3 reversal / left  
- Razorpay / `payments`  
- New migration (if you think you need `rescheduled_from` — **stop**, V1 is the same row)  
- Doctor wrap-up / OPD reschedule UI  
- `freeOfCost` force on staff create  

---

## Tests

- Same-day queue: token unchanged.  
- Next-day queue: new token, old day list empty for that id.  
- Slot conflict → 409.  
- Already on target day → 409 `already_on_today`.  
- Checked-in refused.  
- Staff cannot move another tenant’s appointment.

---

## Verify

Manual: phone book for tomorrow → Move to a later slot; walk-in waiting → Move to tomorrow’s list; Today counts update within one poll.
