# Plan P2 — Trust + rails (make the invoice believable and the money flow legal)

## Show the doctor the meter, move patient payments onto the doctor's own account, and build the refund rail

> **Read-order:** [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) → [`plan-00-billing-roadmap.md`](./plan-00-billing-roadmap.md) → [`plan-p1-meter-and-sell.md`](./plan-p1-meter-and-sell.md) → **this file**.
>
> **Status:** **P2a shipped 2026-08-22.** **P2b rails shipped 2026-08-22.** Prepaid webhook secret shipped (migration **204**). **P2.6 DM auto-refund is parked** (founder 2026-08-22 — see [`NOTE-autopay-vs-autorefund.md`](./NOTE-autopay-vs-autorefund.md)). Do not wire `confirm_cancel` to money from a "next".
>
> **B-Q4:** implemented as the plan-00 default (encrypted column). **B-Q5:** still open; refund *execution* uses the doctor's pasted key secret (not OAuth). The policy function exists; the DM cancel path still flips status only.
>
> **Why this is its own session — twice over:** per-doctor payment credentials is a secrets-handling change to the money path, and the refund engine moves real rupees. **Split it: P2a = trust surfaces (P2.1–P2.2, P2.8), P2b = money rails (P2.3–P2.7).** P2a is migration **202** (200/201 were taken by clinic staff / `patients_registered_via`). P2b credentials will be 203+.
>
> **Effort:** ~1 week for P2a, ~1–1.5 weeks for P2b, and P2b has an external dependency that is not on your calendar.

---

## What P2 is actually for

Two unrelated things share this phase because both are exercised by the same doctor at the same moment — the end of month one:

1. **Trust.** The first invoice is a conversation, and it goes badly if the number is a surprise. A doctor who watched the count climb all month arrives at the invoice already agreeing with it. That is B5, and it is infrastructure, not polish.
2. **Rails.** P1.0 forced every doctor onto scanner mode because the platform Razorpay account is the only one that exists. P2 builds the doctor-owned alternative so prepaid bookings can be sold at all — and prepaid bookings is the no-show pitch, which is the reason a doctor upgrades.

Invoice *automation* is deliberately not here. Ten doctors is 30 minutes a month. P3.

---

## Decisions LOCKED for this phase

| ID | Decision | Implication |
|----|----------|-------------|
| **P2-D1** | **Halo Aid never holds a rupee of patient money.** Prepaid bookings work by calling the **doctor's own** gateway account with the doctor's own credentials. No Route, no linked accounts, no sub-merchant under us. | The whole reason P0 existed. If a design needs money to land with us first, it is wrong regardless of how much easier it is. |
| **P2-D2** | **Refund amounts come from a rules table, never from AI.** Same input, same rupee, explainable months later (cross-cutting principle 4). The AI may classify a cancellation *reason*; it never picks an amount. | The refund policy table already exists in the decision log. P2.6 implements that table literally. |
| **P2-D3** | **Four refunds are 100%, automatic, and not doctor-configurable:** doctor cancelled, emergency detected, platform failure, duplicate charge. | This is the floor already written into [`PILOT_AGREEMENT.md`](../../../Reference/business/PILOT_AGREEMENT.md) clause 3b. Code must not let a doctor set a policy that undercuts a signed clause. |
| **P2-D4** | **Reschedule is offered before refund, every time.** Money that never moves costs nothing and keeps the patient. | Razorpay does not return its own transaction fee on a refund — every refund is a real loss to the doctor. Reschedule-first is a product decision with a rupee behind it. |
| **P2-D5** | **Invoices are immutable once issued.** Issuing latches `invoiced_at` on the ledger rows it covers (P1-D3). Post-issue corrections are `billing_adjustments` rows that land on the *next* invoice. | B4. Also the only way a founder can safely re-run a rollup. |
| **P2-D6** | **A subscription row can freeze its own price levels.** `levels_locked_until` + a stored copy of the level set that applied. | Cross-cutting principle 8 — the founding-ten 12-month lock is a data field, not a promise in a markdown file. |
| **P2-D7** | **Invoice wording is technology, never commission.** "Platform subscription and usage — N consultations, {month}". Enforced by a test, not by memory. | Cross-cutting principle 5. This is the fee-splitting exposure surface; a careless PDF string is the evidence someone would quote. |
| **P2-D8** | **Bookings-only is a permanent first-class mode, not a degraded one.** No nag banners, no locked features. | Many doctors will genuinely prefer their own GPay scanner forever. The upsell is the no-show argument, made once, in context. |

---

## P2a — Trust surfaces

### P2.1 — Migration 202: subscriptions + invoices

**File:** `backend/migrations/202_billing_subscriptions_and_invoices.sql` — shipped 2026-08-22. Apply on Supabase.

`doctor_subscriptions` — one active row per doctor:

| Column | Notes |
|---|---|
| `id`, `doctor_id`, `created_at` | Standard |
| `status` | `active` \| `paused` \| `cancelled` |
| `plan_kind` | `standard` \| `custom` — custom is the published ladder past 500 (B8: no custom quote before Gate 1) |
| `base_minor`, `included_consults`, `per_consult_minor`, `cap_minor` | Copy of the level set that applied at signup (P2-D6). Defaults from `billing-levels.ts`, not hardcoded in SQL |
| `base_waived_until` | The founding-ten 3-month base waiver |
| `levels_locked_until` | The 12-month price lock |
| `started_at`, `cancelled_at` | |

`doctor_invoices`:

| Column | Notes |
|---|---|
| `id`, `doctor_id`, `created_at` | |
| `billing_period` | `DATE`, first of month IST — matches the ledger, resolves **B-Q3** to calendar-month |
| `invoice_number` | Human-facing, gap-free per financial year (GST expectation). Generate in a transaction or from a sequence — **not** `count(*) + 1` |
| `billable_count`, `not_billed_count` | The counts the doctor can audit against the panel. `not_billed_count` covers no-shows and same-encounter continuations; follow-ups are never in it (P1-D8) |
| `base_minor`, `metered_minor`, `subtotal_minor`, `adjustments_minor`, `gst_minor`, `total_minor` | Every intermediate stored, so the PDF is a render of stored numbers and never a recomputation |
| `cap_applied` | `BOOLEAN` — the doctor will ask |
| `status` | `draft` \| `issued` \| `paid` \| `void` |
| `issued_at`, `paid_at`, `payment_reference` | `payment_reference` is free text in P2 — the founder types how it arrived. P3 fills it from the mandate |

Also: add `invoice_id UUID REFERENCES doctor_invoices(id)` to `billable_consults` (deferred from P1-D7).

RLS: same shape as P1-D2 — doctor `SELECT` own, no doctor writes. **No patient-readable path to either table, ever.**

### P2.2 — Doctor billing panel (B5)

**Files:** `frontend/app/dashboard/settings/billing/page.tsx` (new), `frontend/app/dashboard/settings/page.tsx` (add the entry), `backend/src/routes/api/v1/billing.ts` (extend P1's admin routes with doctor-scoped ones), `backend/src/controllers/billing-controller.ts`, `backend/src/services/billing/billing-rollup-service.ts`.

**Spec.** Follow the existing settings-page structure (`settings/account`, `settings/integrations` are the closest shapes). Shows, for the current period:

- Completed consults this month, and **which ones** — a list the doctor can check against their own memory. This is the whole point: an unauditable number is a disputed number.
- Current bill: base, metered, GST, total. Quote GST-inclusive (B7).
- Distance to the cap, and a plain sentence when it is reached: *"You have hit the monthly maximum. Every further consult this month is free."* That sentence is the single best retention artifact in the product — it should not be buried.
- Consults **not** billed, with the reason: patient no-show, same-encounter continuation, voided. Showing what we chose not to charge for is worth more than showing what we charged. Note follow-ups are **not** on this list — they bill at full rate (P1-D8), so the panel must never imply otherwise.
- Past invoices, once P2.8 exists.

**Copy discipline:** never "commission", never a share of their fee, never a number derived from their consultation price (cross-cutting principle 2). The panel must not display the doctor's own revenue anywhere — we do not compute it and should not look like we do.

### P2.8 — Invoice generation (PDF), collected by hand

**Files:** `backend/src/services/billing/invoice-service.ts` (new), `backend/src/services/billing/invoice-pdf.ts` (new), `backend/src/routes/api/v1/billing.ts`.

**Spec.** `issueInvoice({ doctorId, billingPeriod })`:

1. Read the ledger rows for the period, apply `computeMonthlyBill`, apply any `billing_adjustments`.
2. Insert the invoice row, then latch `invoiced_at` + `invoice_id` on exactly those ledger rows (P2-D5). Re-running for an already-issued period returns the existing invoice — idempotent, never a second document.
3. Render the PDF: our GST number, the doctor's name and GSTIN if they gave one, `"Platform subscription and usage — N consultations, {month}"` (P2-D7), ex-GST subtotal + 18% GST line + total.

**No PII/PHI.** Counts and periods only — never a patient name, reason for visit, or appointment time (cross-cutting principle 6). Worth a test that asserts the rendered text contains no patient identifiers.

Delivery is manual in P2 — the founder downloads and emails. Automated send is P3.

Check for an existing PDF path before adding a dependency: `prescriptions` are already rendered somewhere, and reusing that pipeline is better than introducing a second one.

---

## P2b — Money rails

### P2.3 — Per-doctor gateway credentials (**B-Q4**)

**Files:** `backend/migrations/201_doctor_payment_credentials.sql` (STOP item), `backend/src/services/doctor-gateway-credentials-service.ts` (new), `backend/src/config/payment.ts`, `backend/src/adapters/razorpay-adapter.ts`, `backend/src/adapters/payment-gateway.interface.ts`, `backend/src/services/payment-service.ts`, `backend/src/services/refund-service.ts`.

**Spec.** This is the change that makes P2-D1 true in code.

Today `razorpay-adapter.ts:41` constructs its client from `razorpayConfig`, which reads `env.RAZORPAY_KEY_ID` / `KEY_SECRET` — one account for the whole platform. Every caller must instead resolve **the doctor's** credentials and pass them in. That means the gateway interface gains a credentials parameter, and `config/payment.ts` stops being the source of keys (it can keep `selectGatewayByCountry`, which is routing logic and still correct).

Storage (**B-Q4** — plan-00 default is an encrypted column): `doctor_payment_credentials` with `doctor_id`, `gateway`, `key_id` (readable, it is semi-public), `key_secret_encrypted`, `connected_at`, `last_verified_at`, `status`. Reuse `backend/src/utils/encryption.ts` — AES-256-GCM with `ENCRYPTION_KEY`, already the pattern for the dead-letter queue's PHI. RLS: **no doctor read policy on the secret column.** Service-role only. The doctor sees "connected" and the masked key id, never the stored secret back.

Hard rules that are easy to violate here: never log a key or a secret, never return a secret from an API, never put one in an error message or a Sentry breadcrumb.

**Verification on connect:** make a cheap authenticated call against the doctor's keys before marking `status='connected'`. A typo'd secret must fail at setup, in front of the doctor, not silently at the first patient's payment.

### P2.4 — Connect flow + payment mode

**Files:** `frontend/app/dashboard/settings/payments/page.tsx` (new), `backend/src/routes/api/v1/payments.ts` (extend), `backend/src/services/doctor-settings-service.ts`, `backend/src/utils/validation.ts`, `backend/src/services/slot-selection-service.ts`.

**Spec.** `payment_collection_mode` on `doctor_settings` (migration 201): `bookings_only` (default) \| `prepaid`. This replaces P1.0's global `PREPAID_BOOKINGS_ENABLED` env flag — remove the flag in this item so there is exactly one switch, and it is per doctor.

`prepaid` requires a verified credentials row. Switching to `prepaid` without one is a `ValidationError` from the controller (Zod-validated, per the agent contract), not a silent downgrade at booking time.

`slot-selection-service.ts` reads the mode: `bookings_only` → the existing `paymentUrl: null` branch at line 757. `prepaid` → payment link against the doctor's credentials.

**The upgrade pitch, stated once in the UI:** *"Patients who pay when they book show up. Connect your own Razorpay account and we will send the payment link automatically. The money goes straight to you — it never touches Halo Aid."* Then stop asking (P2-D8).

**Q16 stays a non-goal.** Razorpay Partner Program sub-merchant onboarding is a later item; P2 ships paste-your-keys, with an assisted-signup doc if a doctor wants hand-holding. We are not their sponsor and should not imply we are.

### P2.5 — `refund` on the gateway interface

**Files:** `backend/src/adapters/payment-gateway.interface.ts`, `backend/src/adapters/razorpay-adapter.ts`, `backend/src/adapters/paypal-adapter.ts`, `backend/src/services/refund-service.ts`.

**Spec.** The interface currently defines `createPaymentLink` and webhook parsing but **no refund** — plan-00 already flagged this. Add `refund({ gatewayPaymentId, amountMinor, idempotencyKey }, credentials)`.

`refund-service.ts` already refunds via the platform client (`refundAppointment`, best-effort, swallows failures). Rewire it onto per-doctor credentials. Keep its swallow-and-log behaviour for the *cancel* path — a cancellation must still succeed when a refund fails — but the failure has to land somewhere a human sees it, which is what P2.7 is for.

`modality-billing-service.ts` + `modality-refund-retry-worker.ts` already implement the retry doctrine we want: per-attempt idempotency keys, backoff, permanent-failure sentinel, `admin_payment_alerts` (`refund_stuck_24h`), patient DM copy. **Reuse that shape. Do not invent a second one.**

### P2.6 — Refund policy engine (**gated on B-Q5**)

**Files:** `backend/src/services/billing/refund-policy.ts` (new), `backend/src/workers/dm/stages/cancel-reschedule-status.ts`, `backend/src/services/action-executor-service.ts` (`confirm_cancel`).

**Spec.** A pure function: `(cancelledBy, hoursBeforeAppointment, reasonClass) → { refundPercent, requiresReview }`. Transcribe the refund table from the decision log exactly — this file is the implementation of a written commercial policy, so any disagreement belongs in the decision log, not here.

The four 100%-automatic cases (P2-D3) are checked first and cannot be overridden by doctor settings.

The DM cancel flow (`cancel-reschedule-status.ts` → `confirm_cancel`) currently flips appointment status and moves no money. Adding refunds to it means the **reschedule-first** offer (P2-D4) goes in ahead of the cancel confirmation, and the patient sees the refund amount *before* confirming — never after.

**Parked 2026-08-22.** The pure function `resolveRefundPolicy` is written and tested. Nothing on the DM cancel path calls it. Do not wire it until B-Q8 is answered *and* B-Q5 is settled. A refund we promise and cannot execute is worse than one we never promised. Fallback if we ever reopen: notify the doctor with a deep link to their own Razorpay refund screen.

### P2.7 — Policy disclosure + failure visibility

**Files:** `frontend/app/book/page.tsx`, `backend/src/utils/dm-copy.ts`, `frontend/app/dashboard/alerts/page.tsx`.

**Spec.** The cancellation and refund policy must be visible on the booking page **before** the patient pays — this is consumer-law hygiene and it is also the thing that prevents the dispute. Localised, same locales as the rest of `dm-copy.ts` (en / hi / hi-Latn / pa-Latn).

Stuck refunds surface on the existing alerts page via `admin_payment_alerts`, reusing the `refund_stuck_24h` pattern. A refund that silently fails is the single worst outcome in this phase — worse than not offering refunds — because the patient believes money is coming.

**Do not touch** the safety-net copy or emergency-escalation lines while editing `dm-copy.ts`. That file carries live safety behaviour and its own test suite; refund copy is additive and must not restructure the paragraph assembly that `dm-copy.snap.test.ts` and `safety-messages.test.ts` assert on.

---

## Tests

| File | What it covers |
|---|---|
| `backend/tests/unit/services/billing/invoice-service.test.ts` (new) | Issuing latches `invoiced_at` on exactly the period's rows. Re-issue returns the same invoice. Adjustments land on the total. `cap_applied` is true past 255. |
| `backend/tests/unit/services/billing/invoice-pdf.test.ts` (new) | Rendered text contains the technology wording (P2-D7) and **no** patient identifiers. |
| `backend/tests/unit/services/doctor-gateway-credentials-service.test.ts` (new) | Secret round-trips through encryption. No API shape returns a decrypted secret. Nothing secret reaches the logger. |
| `backend/tests/unit/services/billing/refund-policy.test.ts` (new) | Every row of the decision-log table. The four 100% cases ignore doctor settings. |
| `backend/tests/unit/services/slot-selection-service.test.ts` | `bookings_only` → `paymentUrl: null`, zero gateway calls. `prepaid` without credentials → `ValidationError`, not a silent downgrade. |
| `backend/tests/unit/services/payment-service.test.ts` | Payment links are created with the **doctor's** credentials, never the platform's. |
| `backend/tests/unit/utils/dm-copy.snap.test.ts`, `safety-messages.test.ts` | Must stay green untouched — proof the refund copy did not disturb safety copy. |

---

## DO NOT TOUCH

- The P1 ledger's billable definition and its four call sites — P2 reads the ledger, it does not redefine it
- `tryMarkVerified`, `MIN_VERIFIED_CONSULTATION_SECONDS`, join stamps
- Emergency detection, safety-net lines, `safety-messages.ts` — live safety behaviour, adjacent to the file you are editing
- Anything P0 darkened: no reviving Route, linked accounts, `payout_schedule`, or a platform fee on a patient payment
- The published sheet — `/pricing`, `PILOT_AGREEMENT.md`, `billing-levels.ts` values
- Mandates, AutoPay, dunning, month-close automation — P3
- `reason_for_visit` collection and the service-catalog matcher (pricing depends on it; unrelated to billing us)

---

## Verification gate

1. Typecheck + lint + full unit suite.
2. `rg 'razorpayConfig' backend/src` → only `selectGatewayByCountry`-style routing and the connect-verification helper. **No payment or refund path builds a client from platform env keys.**
3. `rg -i 'commission|% of.*fee|share of' backend/src frontend` → nothing in any billing artifact (P2-D7).
4. No secret in any log line, error, or API response — read the diff for this specifically, twice.
5. Migration **202** is additive, RLS enabled, **no doctor write policy** on billing tables, no patient-readable path. P2b credentials will be 203+.
6. Manual, on a test Razorpay account that is **not** ours: connect keys → book prepaid → pay → confirm the money is in the doctor's account and not ours → cancel → confirm the refund lands from the doctor's account.
7. Manual: a `bookings_only` doctor completes a full booking with zero gateway calls.

---

## After this ships

The founding ten can be invoiced with a document they can audit, and the doctors who want prepaid bookings can have them on their own rails. P3 becomes worth doing when hand-invoicing stops being 30 minutes a month — around 25 doctors. Before opening P3, answer **B-Q6** (mandate failure cadence) and get it into the pilot agreement, because it is a term a doctor signs, not a setting.

---

**Created:** 2026-08-22.
**Owner:** Founder.
**Last reviewed:** 2026-08-22.
