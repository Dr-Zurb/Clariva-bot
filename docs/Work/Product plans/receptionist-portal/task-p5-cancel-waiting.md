# P5.1 — Cancel waiting / booked (desk)

**Status:** Implemented 2026-08-30. Same-day lock already skips cancelled (`findBlockingAppointmentOnSessionDate` uses pending/confirmed/completed only).  
**Parent:** [`plan-05-desk-day-ops.md`](./plan-05-desk-day-ops.md) (D5-1, D5-2, D5-6, D5-10).  
**Acceptance:** Receptionist cancels a not-yet-seen visit from Today or the Check-in card in one tap + confirm. Row leaves the open day list. Doctor OPD no longer shows them as waiting.

---

## What to ship

`POST /api/v1/appointments/:id/desk-cancel` (`allowStaff` + `resolveActingDoctor`).

Body (Zod): optional `reason` max ~200, no PHI required. V1 reason unused for refunds (slice 4).

Service: new `cancelAppointmentForDesk(id, doctorId, actorId, correlationId)` — **do not** call `cancelAppointmentForPatient` (that requires `patientId` and is the webhook path).

Rules:

- Appointment `doctor_id` = acting doctor. Else 404.  
- Status `pending` or `confirmed` only. `completed` / `cancelled` / `no_show` → ValidationError.  
- **Arrived + paid** is **out of this task** (slice 3). If `patient_checked_in_at` is set, refuse with a clear message (“Use Left” once 3 ships; until then “Already checked in”).  
- Set `status = cancelled`. Existing queue sync should mark the queue row cancelled/removed the same way wrap-up/cancel already does — reuse `syncOpdQueueEntryOnAppointmentStatus` if that is what cancel-for-patient uses.  
- Audit actor, not doctor-as-self. Field names only.

Response: lean `{ appointment: { id, status, opd_token_number } }` — no `clinical_notes`.

### UI

- Today row (waiting / booked only): **Cancel**. Confirm: “Remove from today’s list?”  
- Check-in card when `todayVisit` is waiting: same.  
- No Collect. No refund copy.

Notify: **booked** origin may reuse desk booking notifier as a cancel SMS later — **out of this task** (RQ7 walk-ins stay silent; don’t invent a new template here).

---

## Scope Guard — DO NOT TOUCH

- `cancelAppointmentForPatient`, Razorpay, `payments`, `billable_consults`  
- `visit_payments` / collect / hisab  
- Wrap-up, `PATCH /appointments/:id` (doctor)  
- New migration  
- Arrive-from-Today, Due, Collect  

---

## Tests

- Staff + acting doctor: pending/confirmed → cancelled.  
- Staff cannot cancel another doctor’s row (404).  
- Completed / already cancelled refused.  
- Checked-in refused (until slice 3).  
- Doctor create/list/wrap-up tests unchanged.  
- Frontend: cancel hidden on seen / no payment dialog.

---

## Verify

Typecheck + lint + unit tests. Manual: book ahead → Today → Cancel → gone from open list; Check-in no longer shows “already on today” lock for a new walk-in the same day (same-day lock ignores cancelled — confirm `findBlockingAppointmentOnSessionDate` already skips cancelled; if it does not, **stop and ask**).
