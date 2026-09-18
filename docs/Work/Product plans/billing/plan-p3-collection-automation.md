# Plan P3 — Collection automation (stop invoicing by hand)

## UPI AutoPay mandates, month-close, and what happens when a doctor does not pay

> **Read-order:** [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) → [`plan-00-billing-roadmap.md`](./plan-00-billing-roadmap.md) → [`plan-p1-meter-and-sell.md`](./plan-p1-meter-and-sell.md) → [`plan-p2-trust-and-rails.md`](./plan-p2-trust-and-rails.md) → **this file**.
>
> **Status:** **Parked 2026-08-22.** Founder asked why AutoPay exists; it is not the same thing as auto-refund. Write-up: [`NOTE-autopay-vs-autorefund.md`](./NOTE-autopay-vs-autorefund.md). Trigger to *reopen*: **~25 paying doctors** *and* a new founder ask, or the first month where hand-invoicing costs more than half a day.
>
> **Blocked on:** **B-Q6** (mandate failure cadence and grace period). It is a term in the pilot agreement, so it must be answered *before* anyone signs — not before P3 is coded.
>
> **Why this is its own session:** it is the only phase where **we** debit **someone else's** account. Migration **202**.
>
> **Effort:** ~1.5–2 weeks, most of it edge cases and mandate-failure states, not the happy path.

---

## Why this is last, and why that is not laziness

Ten doctors is roughly 30 minutes of invoicing a month. Automating that first would be two weeks of work to save six hours a year, and it would bake in guesses about behaviour nobody has observed yet.

The sequencing argument is sharper than "it is not urgent":

- **A mandate is a promise about a number you have never actually charged.** UPI AutoPay mandates are created with a *maximum* debit amount. Setting that ceiling before you have seen a real month of real doctors' volume means guessing, and a mandate ceiling that is too low fails silently at the worst moment.
- **Dunning policy should be written from observed non-payment, not imagined non-payment.** The first three doctors who pay late will teach more than any flowchart.
- **The cap is what makes the mandate possible at all.** ₹12,499 + 18% GST = ₹14,749, under the ₹15,000 UPI AutoPay ceiling — with ₹251 of headroom. That is not a coincidence; it is why the cap is that number. **Any future price increase above the cap breaks the collection rail**, which is the strongest structural argument against raising it.

---

## Decisions LOCKED for this phase

| ID | Decision | Implication |
|----|----------|-------------|
| **P3-D1** | **The mandate ceiling is always ₹14,749** (cap + 18% GST), regardless of the doctor's actual volume. | A doctor whose bill grows from ₹1,179 to ₹8,000 must never need a new mandate. Re-authorising a mandate is a conversation and a drop-off point. Set the ceiling once, at the maximum the sheet can ever produce. |
| **P3-D2** | **Debit only what the invoice says.** The mandate authorises up to ₹14,749; the debit is the invoice total to the rupee. | The ceiling is a limit, not an amount. Debiting the ceiling is the kind of error that ends a pilot. |
| **P3-D3** | **The invoice is issued before the debit, always, with the doctor notified.** Never debit-then-explain. | The panel showed the number climbing all month (B5); the invoice confirms it; the debit follows. A surprise debit destroys everything P2 built. |
| **P3-D4** | **Non-payment pauses new bookings only. Existing appointments always complete.** | A patient who already booked must never be collateral in a billing dispute. This is also the humane reading and the defensible one. |
| **P3-D5** | **Custom plans collect by e-NACH, not UPI AutoPay.** Ladder amounts past 500 consults can exceed ₹15,000. | Do not attempt to split a custom bill across two UPI mandates. Different rail, cleanly separated. |
| **P3-D6** | **The month-close worker is idempotent and re-runnable.** Running it twice for the same period produces one invoice and one debit attempt. | Same doctrine as `modality-refund-retry-worker`: guarded UPDATEs, per-attempt idempotency keys, permanent-failure sentinel. |
| **P3-D7** | **Automation never invents a charge.** If the ledger and the reconciliation query disagree, the worker refuses to issue and alerts a human. | Cross-cutting principle 3, at its highest stakes: this is the one phase where an over-count becomes an actual unauthorised debit. |

---

## Items

### P3.1 — Migration 202: mandates + collection attempts

**File:** `backend/migrations/202_billing_mandates.sql` — **STOP item. Do not write until approved.**

`doctor_payment_mandates`:

| Column | Notes |
|---|---|
| `id`, `doctor_id`, `created_at` | |
| `rail` | `upi_autopay` \| `enach` (P3-D5) |
| `gateway` | `razorpay` |
| `gateway_mandate_id`, `gateway_customer_id` | External references |
| `max_amount_minor` | `1_474_900` for UPI AutoPay (P3-D1) |
| `status` | `pending` \| `active` \| `paused` \| `revoked` \| `failed` |
| `authorised_at`, `revoked_at` | |
| `last_debit_at`, `consecutive_failures` | Drives P3.4 |

`invoice_collection_attempts` — append-only, one row per debit attempt:

`id`, `invoice_id`, `mandate_id`, `attempt_number`, `idempotency_key` (UNIQUE), `amount_minor`, `status` (`pending` \| `succeeded` \| `failed`), `gateway_reference`, `failure_code`, `failure_reason`, `attempted_at`.

The `UNIQUE (idempotency_key)` constraint is the structural guarantee against double-debiting. Build the key from `invoice_id + attempt_number` so it is reproducible rather than random — a retry after a timeout must reuse the same key, not mint a new one.

RLS: doctor `SELECT` own (they should be able to see their own collection history), no doctor writes. No secrets in either table.

### P3.2 — Mandate creation flow

**Files:** `backend/src/services/billing/mandate-service.ts` (new), `backend/src/adapters/razorpay-mandate-adapter.ts` (new), `frontend/app/dashboard/settings/billing/page.tsx` (extend P2's panel), `backend/src/routes/api/v1/billing.ts`.

**Spec.** This is the one place we use **our own** merchant account — collecting our own subscription revenue from the doctor. Keep it visibly separate from the doctor-credential path built in P2.3; a single file that could resolve either set of keys is how a patient payment eventually gets captured into our account by mistake.

Flow: doctor authorises → mandate `pending` → gateway webhook confirms → `active`. Set up in the billing panel, at signup or first invoice.

Copy discipline: this authorises a **software subscription**, and the doctor should understand the ceiling is a limit, not a charge. *"You are authorising up to ₹14,749 per month. We debit only what your invoice says — most months that is far less."*

### P3.3 — Month-close worker

**Files:** `backend/src/workers/billing-month-close-cron.ts` (new), `backend/src/routes/cron.ts` (new route), `backend/src/services/billing/invoice-service.ts` (extend), `backend/src/services/billing/collection-service.ts` (new).

**Spec.** Follow the Render-Cron HTTP pattern already in `routes/cron.ts` (auth via `CRON_SECRET`) rather than the in-process interval pattern — month-close is a once-a-month job and should be triggerable by hand.

Order of operations, per doctor, on the 1st at a quiet IST hour:

1. Run **P1.7's reconciliation query**. If it is non-empty → **do not issue.** Alert and stop for that doctor (P3-D7). This is the safety interlock and it is the most important step in the phase.
2. Issue the invoice for the closed period (P2.8 logic, unchanged).
3. Notify the doctor: invoice available, amount, debit date. Give at least a couple of days before the debit (P3-D3).
4. On the debit date, attempt collection through the mandate with a reproducible idempotency key.

Per-doctor failures must not abort the batch. Cap the batch and log a per-doctor summary — the pattern `auto-no-show-worker.ts` uses (batch cap, per-row guards, tick never throws) is the right reference even though the lifecycle differs.

### P3.4 — Failure handling and dunning (**B-Q6**)

**Files:** `backend/src/services/billing/collection-service.ts`, `backend/src/services/billing/dunning-service.ts` (new), `backend/src/services/doctor-settings-service.ts` (the booking-pause flag), `backend/src/services/slot-selection-service.ts` (honour the pause).

**Spec if the plan-00 default holds.** 3 retries over 7 days, then new bookings pause, existing appointments unaffected, doctor notified at every step.

What pausing means concretely, and the part that is easy to get wrong: `slot-selection-service.ts` stops offering new slots, and the DM flow says something true and non-punitive — the patient must never learn that their doctor has a billing problem. A generic *"online booking is temporarily unavailable, please contact the clinic"* is the correct patient-facing message.

Distinguish failure classes before retrying. A revoked mandate is not a temporary failure and must not be retried three times — it needs a re-authorisation conversation. Insufficient funds is temporary. Treating them identically wastes the grace period on a mandate that will never succeed.

**B-Q6 must be in the pilot agreement before anyone signs**, because "what happens if I do not pay" is a term, not a setting. If P1/P2 doctors signed a version without it, they get the old terms until they agree to new ones — which is an argument for answering it now rather than at P3.

### P3.5 — Custom-plan collection (e-NACH)

**Files:** `backend/src/services/billing/mandate-service.ts`, `backend/src/adapters/razorpay-mandate-adapter.ts`.

**Spec.** Only reachable once a custom plan exists, which **B8 blocks until Gate 1 ships** (ladder rates of ₹18–25 are below today's ₹36.46 cost per consult). Build this when the first custom doctor is real, not speculatively. Until then the ladder is a sales conversation with a manual bank transfer behind it.

### P3.6 — In-product no-show nudge

**Files:** `frontend/app/dashboard/page.tsx` or `frontend/app/dashboard/insights/page.tsx`, `backend/src/services/billing/...` (read-only).

**Spec.** Once there is a month of data, a `bookings_only` doctor with a meaningful no-show rate gets **one** contextual, dismissible prompt: *"14 of your 90 bookings last month did not show up. Doctors who collect payment at booking see far fewer."* Then never again (P2-D8).

This is the only growth-flavoured item on the roadmap, and it earns its place by being true and specific to that doctor's own numbers. If the data is not there, do not ship a generic version of it.

---

## Tests

| File | What it covers |
|---|---|
| `backend/tests/unit/services/billing/collection-service.test.ts` (new) | Same invoice + attempt number reuses the idempotency key. A duplicate attempt never produces a second debit. The debit amount equals the invoice total, never the ceiling (P3-D2). |
| `backend/tests/unit/services/billing/mandate-service.test.ts` (new) | Ceiling is always ₹14,749 regardless of volume. Revoked mandates are not retried. |
| `backend/tests/unit/services/billing/dunning-service.test.ts` (new) | Retry cadence per B-Q6. Pause blocks new bookings and leaves existing appointments untouched (P3-D4). |
| `backend/tests/unit/workers/billing-month-close-cron.test.ts` (new) | A non-empty reconciliation result blocks issuance for that doctor (P3-D7). Re-running the period produces one invoice and one attempt. One doctor's failure does not abort the batch. |
| `backend/tests/unit/services/slot-selection-service.test.ts` | Paused doctor offers no new slots; existing appointments still complete. |

---

## DO NOT TOUCH

- The ledger's billable definition (P1) — automation reads it, never redefines it
- Per-doctor gateway credentials (P2.3) — that is the **patient** money path; this phase is the **doctor** money path. They must not share a resolution helper
- The refund rail — refunds are patient↔doctor; our subscription debit is doctor↔us. Different rails, no shared code
- The published sheet, the cap, and `billing-levels.ts` values — raising the cap breaks P3-D1 and the mandate rail with it
- Emergency detection, safety copy, `reason_for_visit`
- Patient-facing DM copy beyond the single neutral booking-unavailable line

---

## Verification gate

1. Typecheck + lint + full unit suite.
2. Migration 202 additive; `UNIQUE (idempotency_key)` present on collection attempts; RLS enabled with no doctor writes.
3. `rg 'max_amount_minor|1474900' backend/src` → the ceiling is derived from `billing-levels.ts`, not typed as a literal in two places.
4. Manual on the gateway's sandbox: create a mandate → issue an invoice → debit → confirm the debited amount equals the invoice total, not the ceiling.
5. Manual: force a debit failure → confirm the retry cadence, the pause, the patient-facing copy, and that an existing appointment still completes end to end.
6. Manual: run month-close twice for the same period → one invoice, one attempt, no second debit.

---

## After this ships

Billing is hands-off, and the roadmap's original question — "can a doctor sign, use the product for a month, and receive a correct invoice they believe?" — is answered by machine rather than by the founder's Sunday evening.

What follows is not more billing. It is the things billing was blocking: self-serve signup with card-on-file, annual prepay for doctors who ask, seat pricing on the base when staff arrive, and the Gate 1 cost work that makes the custom ladder profitable enough to sell.

---

**Created:** 2026-08-22.
**Owner:** Founder.
**Last reviewed:** 2026-08-22.
