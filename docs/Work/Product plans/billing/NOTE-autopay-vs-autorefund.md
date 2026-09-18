# AutoPay vs auto-refund — they are not one thing

> Founder asked 2026-08-22: *"auto pay auto refunds and all? why?"*
> This note is the write-up. It does not change the locked sheet.

They share the word **auto**. They are opposite directions of money. **Neither is live in product.**

| | Money moves | Who it serves | Status 2026-08-22 |
|---|---|---|---|
| **UPI AutoPay** (P3) | Doctor → Halo Aid | Us — collect the monthly GST invoice without chasing | **Not built.** Deferred to ~25 doctors. |
| **Auto-refund in DMs** (P2.6) | Doctor's Razorpay → patient | Prepaid patients — money back without the doctor opening Razorpay | **Not wired.** Policy table exists as a pure function. `confirm_cancel` still only flips appointment status. |

Bookings-only doctors never need the refund rail: there is nothing to refund. Prepaid doctors can refund by hand in their own Razorpay dashboard until we decide otherwise.

---

## Why they were on the roadmap

**AutoPay.** Hand-invoicing ten doctors is ~30 minutes a month. The cap is ₹12,499 because ₹12,499 + 18% GST = ₹14,749, which fits under the ₹15,000 UPI AutoPay ceiling. That is a collection-rail reason, not a product reason to build mandates now.

**Auto-refund.** A prepaid patient who cancels still paid. Someone has to send the money back. The decision log (2026-08-21) said we can initiate that on the doctor's account without holding the money. The risk is the opposite of AutoPay: a refund promised in a DM and not executed is worse than never promising one.

---

## Why neither ships now

1. **No observed need.** No founding doctor has asked to stop paying by invoice, and no prepaid patient has needed a bot-initiated refund.
2. **Asymmetric failure.** AutoPay debiting the wrong amount is an unauthorised collection. Auto-refund promising ₹X that never arrives is a consumer-law problem.
3. **B-Q5 is still open** for any OAuth path. Pasted keys *can* refund via API; we still have not promised that in a patient DM.
4. **Founder challenged the "why"** on 2026-08-22. Until that is reopened, treat both as **parked**, not next.

---

## What is already enough

- Meter + billing panel + hand invoice (P1 / P2a).
- Doctor-owned Razorpay keys + webhook secret + bookings-only vs prepaid (P2b / 203 / 204).
- Booking-page cancel/refund copy (disclosure only).
- `resolveRefundPolicy` — table only, no executor on the cancel path.
- `refundAppointment` — used by OPD overrun (`opd-overrun-service.ts`), not by Instagram cancel.

Do **not** start P3 or wire DM auto-refund from a "next" without a new founder ask.

---

## Open (promote on review, do not execute from this file)

**B-Q8.** Keep AutoPay and DM auto-refund as deferred roadmap items, or kill them until a named doctor needs them?

Default if unanswered: **stay parked.** Killing them is a decision-log edit, not a code session.

---

**Created:** 2026-08-22.
**Owner:** Founder.
