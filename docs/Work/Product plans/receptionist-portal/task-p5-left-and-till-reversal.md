# P5.3 — Left after check-in + till reversal

**Status:** Implemented 2026-08-31. Apply migration **225** on the app DB.  
**Parent:** [`plan-05-desk-day-ops.md`](./plan-05-desk-day-ops.md) (D5-3, D5-4, D5-5, D5-7, RQ9).

**Acceptance:** Receptionist can take an **Arrived** walk-in off the board. If they had collected Cash/UPI/Card, today’s collection drops by that amount. UI says **Return**, not Refund.

---

## Product

- **Left** = cancel an arrived, not-completed visit. Open Today drops them (RQ9).  
- If visit hisab is `paid`: must record a **full till reversal** in the same request (or a two-step: Return amount shown, then Left). Prefer **one request** so collection cannot stay high after they vanish.  
- `no_charge` / no row: Left only, no money row.  
- V1 **full amount only** (D5-5). Method of return defaults to the last collected method; receptionist may pick Cash / UPI / Card (they handed cash back vs voided UPI).

---

## Data (Opus)

Append-only. Do **not** UPDATE/DELETE `visit_payments`.

Propose one of (pick in the Opus turn, don’t implement both):

- `method` gains `reversal` + `amount_minor` of the returned rupees + `reverses_payment_id`, **or**  
- signed `amount_minor` on a `reversal` row.

`deriveVisitPaymentStatus` / `getDeskHisab` totals must subtract reversals. `dueCount` stays unused on the desk UI.

RLS: same deny-all / service-role as 223.

Docs: `DB_SCHEMA.md`, `RLS_POLICIES.md`.

---

## API

`POST /api/v1/appointments/:id/desk-left` (`allowStaff`).

Body: `{ returnMethod?: 'cash'|'upi'|'card' }` required iff visit is paid.

Service:

1. Load appointment; must be acting doctor; `patient_checked_in_at` set; not completed.  
2. If paid and no returnMethod → ValidationError.  
3. Insert reversal row (after migration).  
4. Cancel appointment (same write path as P5.1).  
5. Audit both resources.

Alternatively split `POST .../visit-payments/reversal` then `desk-cancel` — only if one request is messy. Prefer one handler.

---

## UI

- Today Arrived row: **Left** (not Cancel). Confirm: “They left. Return ₹X via Cash?”  
- Check-in card if already arrived (edge): same.  
- Collection card: totals fall. Badge never says Due. Paid + reversal → dash or “Returned.”

---

## Scope Guard — DO NOT TOUCH

- Razorpay, `payments`, `refund-policy.ts`, `billable_consults`  
- Partial amounts, receipts  
- Wrap-up / un-complete  
- Loosening append-only trigger  
- Doctor OPD “no-show” semantics (this is left-after-arrive, not no-show)

---

## Tests

- Paid walk-in → left + reversal → hisab collected decreases by amount.  
- No-charge → left, no payment row.  
- Waiting (not arrived) → refuse (use P5.1 Cancel).  
- Completed → refuse.  
- Second left → refuse.  
- Hisab does not double-count.

---

## Verify

Founder applies the new migration. Manual: check in, Cash ₹10, Today shows ₹10 · Cash, Left, collection −₹10, patient gone from Arrived.
