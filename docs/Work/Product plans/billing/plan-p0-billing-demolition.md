# Plan P0 — Billing demolition (stop the wrong money rails)

## Take the platform-fee-on-patient-payment and doctor-payout stack offline before any new billing code is written

> **Read-order:** [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) → [`plan-00-billing-roadmap.md`](./plan-00-billing-roadmap.md) → **this file**.
>
> **Status:** `Executed` 2026-08-22. Stop-writes path shipped. Columns remain; `DROP` is P0.5.
>
> **Why this is its own session:** payments + a migration + 5+ files. Per `.cursor/rules/00-agent-contract.mdc` and `migrations.mdc`, do not fold this into a feature session. Next migration number is **198**.
>
> **Effort:** ~1 day if the stop-writes path is taken (recommended). Dropping columns is a later, optional P0.5.

---

## Why P0 is first

Two live rails implement models the decision log rules out:

1. **`config/platform-fee.ts` + `payment-service.ts`** still compute a **percentage-or-flat fee against the patient's payment** (env: `PLATFORM_FEE_PERCENT=5`, flat ₹25 under ₹500, GST on the fee, `doctor_amount_minor = gross − fee − GST`). That is fee-splitting signal #1 and the aggregator shape.
2. **`payout-service.ts`** + **`POST /cron/payouts`** still transfer money to doctors via Razorpay Route when `tryMarkVerified` fires and `payout_schedule = 'per_appointment'`. Holding / remitting patient funds is RBI PA activity. We cannot do it.

Building a usage ledger beside these is how you bill a doctor twice — once as a "platform fee" taken from the patient, once as a monthly invoice. **Stop the writes first. Drop the columns later.**

---

## Decisions LOCKED for this phase

| ID | Decision | Implication |
|----|----------|-------------|
| **P0-D1** | **Stop writes, do not drop columns in this session.** Migration 198 comments the 022 / 024 / 025 columns as deprecated and stops application writes. `DROP COLUMN` is a later additive reversal once nothing reads them. | Reversible. No backfill. No data loss if we have to roll the code back. |
| **P0-D2** | **`tryMarkVerified` keeps verifying consults.** Only the payout trigger comes out. Verification is still the raw signal P1's ledger will read. | Do not "simplify" verification in this session. The no-show / token-mode fix is P1 (Gate 2). |
| **P0-D3** | **Cron payout routes stay mounted but become no-ops that log and 200.** Deleting the routes in the same PR as the service change makes rollback harder. Remove the routes in P0.5 once the worker has been dark for a week. | Render / external cron can keep hitting the URL without 500s. |
| **P0-D4** | **Doctor-settings PATCH still accepts `payout_schedule` / `payout_minor` for one release, then ignores them.** Removing the keys from the Zod schema in the same PR as the service change breaks any UI still posting them. | Find and strip the settings UI in this session if it exists; keep the API keys as silently-ignored until P0.5. |

---

## Items

### P0.1 — Stop computing a platform fee on the patient's payment

**Files:** `backend/src/config/platform-fee.ts` (leave the file, stop calling it — or make it return `{0,0,amountMinor}` and mark deprecated), `backend/src/services/payment-service.ts` (the capture path that writes `platform_fee_minor` / `gst_minor` / `doctor_amount_minor`), `backend/src/config/env.ts` (keep the env keys one release; they become unused), `backend/.env.example` (comment that the keys are deprecated and must stay 0 if set).

**Spec.** New captures write `platform_fee_minor = 0`, `gst_minor = 0`, `doctor_amount_minor = amount_minor`. Do not start writing `NULL` — existing readers treat NULL as "old row". Zero is an honest "we took nothing." Existing historical rows are left untouched (P0-D1).

### P0.2 — Stop triggering payouts from verification

**Files:** `backend/src/services/consultation-verification-service.ts`.

**Spec.** Delete `triggerPerAppointmentPayout` and the `processPayoutForPayment` import. `tryMarkVerified` still stamps `verified_at` / duration / join times. Update the file header comment that currently says it "Triggers per-appointment payout". Do **not** change the four verification branches (P0-D2).

### P0.3 — Darken the payout service and cron

**Files:** `backend/src/services/payout-service.ts`, `backend/src/routes/cron.ts` (`POST /cron/payouts`, `POST /cron/payouts/schedule/:schedule`).

**Spec.** `processPayoutForPayment` and `processBatchedPayouts` return `{ success: true, skipped: 'deprecated' }` after a `logger.info` — they must not call Razorpay Route. Cron handlers call them, get the skip, return 200. Do not delete the functions in this PR (tests and cron mocks import them).

### P0.4 — Stop treating payout settings as live config

**Files:** `backend/src/services/doctor-settings-service.ts` (allow-list still includes the keys; writes persist so the row doesn't 500, but nothing reads them for money movement after P0.2/P0.3), `backend/src/utils/validation.ts` (keep the Zod keys), dashboard settings UI if any payout controls exist.

**Spec.** Grep the frontend for `payout_schedule` / `payout_minor` / `razorpay_linked_account_id`. If a settings control exists, hide it in this session. Do not add a replacement "connect Razorpay" UI here — that is P2.

### P0.5 — Migration 198 (comments only)

**File:** `backend/migrations/198_deprecate_platform_fee_and_payouts.sql` — **do not write this file until the session is approved.**

**Spec.** `COMMENT ON COLUMN` for:

- `payments.platform_fee_minor`, `payments.gst_minor`, `payments.doctor_amount_minor` (022)
- payout columns on `payments` from migration 024 (`payout_status`, `payout_id`, …) — confirm names against `024_*.sql` at execution time
- `doctor_settings.payout_schedule`, `payout_minor`, `razorpay_linked_account_id` (025)

Comment text: `DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+.`

No `DROP`. No backfill. No RLS change.

---

## Tests that must stay green (and what to change)

| File | Change |
|---|---|
| `backend/tests/unit/services/payout-service.test.ts` | Expect the deprecated skip, not a transfer. |
| `backend/tests/unit/services/consultation-verification-service.test.ts` | Already mocks `processPayoutForPayment`. After P0.2 the mock can go; tests must still cover the four verify branches. |
| `backend/tests/unit/utils/patch-doctor-settings-validation.test.ts` | Leave passing — keys still accepted (P0-D4). |
| Cron route tests that mock `processBatchedPayouts` | Still mock; handlers still 200. |

Do not add a new billing ledger test in this session.

---

## DO NOT TOUCH

- `tryMarkVerified` branch logic, `MIN_VERIFIED_CONSULTATION_SECONDS`, join-time stamps
- `payment-gateway.interface.ts` / adapters / webhook signature verification / `createPaymentLink`
- `modality-billing-service.ts` and `modality-refund-retry-worker.ts` (those refunds are patient↔doctor on a modality downgrade — a different rail, reused in P2)
- `slot-selection-service.ts` bookings-only `paymentUrl: null` path
- Frontend booking / consult / EHR surfaces
- Any new `subscriptions` / `invoices` / `usage_ledger` table — that is P1
- `/pricing` (already shipped) and `PILOT_AGREEMENT.md`

---

## Verification gate for this phase

1. `rg processPayoutForPayment backend/src` → only the darkened function body, no callers that transfer.
2. `rg calculatePlatformFee\|PLATFORM_FEE_PERCENT backend/src` → no live percent taken from a patient payment.
3. Typecheck + unit tests for the files above.
4. Migration 198 is comments-only (`grep DROP` against it is empty).

---

## After this ships

P1 is unblocked: usage ledger + Gate 2 (billable ≠ verified). B-Q1 was answered 2026-08-22 — full rate on every completed consult, including follow-ups the doctor gives free. Do not start P1 in the same session.

---

**Created:** 2026-08-22.
**Owner:** Founder.
**Last reviewed:** 2026-08-22.
