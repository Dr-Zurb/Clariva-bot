# P5.4 — Cancel prepaid booked (gateway refund status)

**Status:** Drafted 2026-08-30. Blocked on P5.1. Do **not** start until a real prepaid desk/bot booking needs it.  
**Parent:** [`plan-05-desk-day-ops.md`](./plan-05-desk-day-ops.md) (D5-3, D5-9, RQ10).  
**Acceptance:** Receptionist cancels a **booked** visit that has a gateway `payments` row. Appointment cancels. Desk shows refund **started / none / needs doctor** — no Razorpay keys on the desk.

---

## What to ship

Extend P5.1 cancel (same route or `?prepaid=1` — prefer **one** `desk-cancel` that branches):

- If **no** gateway payment: behaviour stays P5.1 (till-unrelated).  
- If gateway payment captured: run `resolveRefundPolicy` (`cancelledBy: 'patient'`, `hoursBeforeAppointment` from slot, `reasonClass: 'patient_cancel'`).  
  - 0% → cancel visit, show “No refund (policy).”  
  - 100% and not `requiresReview` → trigger the **existing** refund path used by bot/patient cancel (find it; do not write a new Razorpay adapter).  
  - `requiresReview` → cancel visit, show “Needs doctor” (RQ10). Do not guess.

Walk-in till rows: **never** enter this branch (D5-3).

### UI

- Today / Check-in: Cancel on a `booked` row. If prepaid, confirm copy names the policy result in one line (no percent editor).  
- Do not show Refund on Cash/UPI/Card till visits.

---

## Scope Guard — DO NOT TOUCH

- Till `visit_payments` / slice 3  
- New refund percents (edit `refund-policy.ts` only if founder reopens policy)  
- OAuth vs paste-keys (B-Q5) — if the existing path cannot refund, **stop and surface**; do not invent a desk-only refund.  
- Wrap-up, clinical GET  

---

## Tests

- Booked + captured payment + patient cancel + 24h+ → policy 100% path invoked (mock gateway).  
- No-show reason is **not** this task (desk cancel is patient-initiated).  
- Walk-in + till Cash → cancel must **not** call Razorpay.  
- Staff on another tenant → 404.

---

## Verify

Only against a **test** Razorpay booking. If no test booking exists, leave this task drafted.
