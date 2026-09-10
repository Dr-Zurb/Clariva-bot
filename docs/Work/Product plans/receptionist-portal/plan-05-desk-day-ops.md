# Plan 05 — Desk day-ops (cancel, reschedule, till reversal)

> **Parent:** [`plan-00-receptionist-portal-roadmap.md`](./plan-00-receptionist-portal-roadmap.md). R1–R7, R3 (`/desk` only), principle 6 (no clinical reads) stay locked.
>
> **Status:** P5.1–P5.3 implemented 2026-08-31. P5.4 still drafted. Not promoted to `Daily-plans/` yet.
>
> **One-liner:** Receptionist handles phone/counter visit changes. Doctor keeps wrap-up and chart. Till money and Razorpay money stay different words.

---

## Why this exists now

P4 got a patient onto the day board. Desk payments (check-in Cash / UPI / Card / No charge) closed the walk-in till gap. The desk still cannot **cancel**, **move a time**, or **put till money back** when someone leaves. Those are counter jobs. They are not on `/dashboard`.

Existing `cancelAppointmentForPatient` / `updateAppointmentDateForPatient` are **webhook / patient** helpers. They are not staff routes. Do not call them from the desk by faking a patient JWT.

---

## North star

A receptionist, without opening the clinical dashboard, can:

1. Cancel a **waiting / booked** visit (phone: “can’t come”).
2. Reschedule that visit to another clock slot or another day’s list.
3. Mark **left after check-in** (paid, walked out before the doctor).
4. Record a **till reversal** so today’s collection is honest.
5. Cancel a **prepaid online book** and see that a gateway refund was started or refused — not run a Razorpay console.

If any of those takes longer than a paper diary note, the phase failed.

---

## Decision locks (D5-1 … D5-10)

| ID | Decision | Implication |
|----|----------|-------------|
| **D5-1** | Day-ops live on **`/desk` only**. Not on doctor OPD as the primary path. | Doctor OPD may keep its own Arrive / no-show. Desk does not merge into `/dashboard/opd-today` (R3). |
| **D5-2** | **Pay at check-in** stays the walk-in rule. No Collect on Today. No Due badge. | Cancel/reschedule of *waiting* visits usually has **no till row**. Reversal only after a collect. |
| **D5-3** | Two money words. **Till reversal** = cash/QR/POS already in the clinic. **Online refund** = Razorpay (or later gateway) via existing `refund-policy.ts`. | Desk UI never says “Refund” for a Cash collect. Never open Razorpay for a walk-in till row. |
| **D5-4** | `visit_payments` stays **append-only**. A reversal is a **new row**, not UPDATE/DELETE. | CHECK / method union change is a **new migration → Opus**. Do not loosen `reject_visit_payments_mutation()`. |
| **D5-5** | V1 till reversal is **full amount, one shot**. No partials, no “correct the method.” | Wrong amount → reversal + new collect (later), or founder reopens this lock. |
| **D5-6** | Cancel / reschedule allowed when status is `pending` or `confirmed` and the visit is **not completed**. After wrap-up: hard no. | Seen today is the doctor’s. Desk does not un-complete. |
| **D5-7** | **Left after check-in** = cancel (or a dedicated `left` reason on cancel) **and** optional till reversal in the same sitting if a paid row exists. | Token/queue row must leave Arrived (cancel + existing queue sync). |
| **D5-8** | Reschedule of a **queue** visit keeps the patient, new `appointment_date`, **new token** for the new session day (same as `updateAppointmentDateForPatient` today). Same calendar day: define in the task — default **keep token** if still waiting and unpaid. | Founder can reopen “keep token” vs “new token” in `task-p5-reschedule.md` before build. |
| **D5-9** | Prepaid cancel uses **existing** refund policy (`cancelledBy: 'patient'` unless the desk marks clinic-caused). Desk does not invent percents. | `requiresReview` → show “Needs doctor,” do not silently refund 0 or 100. |
| **D5-10** | No new clinical surfaces. Staff still cannot `GET /appointments/:id` if that payload includes `clinical_notes` / Rx — use a **lean desk mutation** (id + status + token) or strip the select. | Principle 6. Prefer `POST /appointments/:id/desk-cancel` over opening doctor `PATCH`. |

---

## What is already true (do not re-propose)

| Fact | Where |
|------|--------|
| Staff create / list / check-in / vitals / collect | `routes/api/v1/appointments.ts` `allowStaff` |
| Get-by-id, patch, wrap-up | **Doctor-only** |
| Till ledger | `visit_payments` (migration 223), `collectVisitPayment` |
| Online refund percents | `services/billing/refund-policy.ts` |
| Patient cancel / reschedule helpers | `appointment-service.ts` (webhook context, `patientId` required) |
| Queue delete + re-token on patient reschedule | `updateAppointmentDateForPatient` |
| Desk UI | Check-in + Today only (`DeskTabBar`) |

---

## Phase slices (build in this order)

| # | File | Ships | Migration? |
|---|------|-------|------------|
| 1 | [`task-p5-cancel-waiting.md`](./task-p5-cancel-waiting.md) | Cancel waiting/booked from Today + Check-in card | No |
| 2 | [`task-p5-reschedule.md`](./task-p5-reschedule.md) | Move time / day from the same surfaces | No (unless token rule needs a column — default no) |
| 3 | [`task-p5-left-and-till-reversal.md`](./task-p5-left-and-till-reversal.md) | Left after check-in + full till reversal | **Yes — Opus** (method / amount sign) |
| 4 | [`task-p5-prepaid-cancel.md`](./task-p5-prepaid-cancel.md) | Cancel prepaid booked + refund status | No new gateway; wire policy only |

Each slice is demoable alone. Do not start 3 until 1 is in the founder’s hands.

---

## Explicitly out of scope (this program)

- Wrap-up, Rx, SOAP, chart, merge, doctor billing / SaaS invoices  
- Partial till refunds, receipts, day-end cash drawer count  
- Collect / Due / Arrive-from-Today (already removed)  
- Staff WhatsApp compose, waitlist, multi-doctor  
- Patient self-cancel UI (`/book` already has its own path)  
- Editing `payments` / `billable_consults` / Razorpay dashboard  

---

## Open questions

| ID | Question | Default if unanswered |
|----|----------|----------------------|
| **RQ8** | Same-day queue reschedule: keep token or issue the next number? | **Keep token** if still waiting and no till row; new token if the session **date** changes. |
| **RQ9** | After “left,” does Today show Cancelled (hidden from open list) or a Left chip? | **Drop from open Today** (`isOpenDeskAppointment` already drops `cancelled`). No new status enum. |
| **RQ10** | Clinic-caused cancel (doctor late / equipment) vs patient cancel — does the desk pick a reason? | **V1: patient cancel.** Add a “Clinic cancelled” toggle only in slice 4 if prepaid refunds need `cancelledBy: 'doctor'`. |

---

## How to execute

1. Do not expand this file with implementation dumps — put steps in the task file.  
2. Promote one task at a time into `Daily-plans/` per [`PHASED-PLANS-GUIDE.md`](../../process/PHASED-PLANS-GUIDE.md).  
3. Slice 3 migration + PHI-adjacent payment write → **switch to Opus**.  
4. Verify: staff JWT can cancel; doctor JWT unchanged; no PII in logs.

**Created:** 2026-08-30  
**Owner:** Founder (product)
