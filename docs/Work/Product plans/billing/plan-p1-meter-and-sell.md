# Plan P1 — Meter + sell (count correctly from day one)

## Build the usage ledger, fix `billable ≠ verified`, and close the money-rail hole P0 left open

> **Read-order:** [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) → [`plan-00-billing-roadmap.md`](./plan-00-billing-roadmap.md) → [`plan-p0-billing-demolition.md`](./plan-p0-billing-demolition.md) → **this file**.
>
> **Status:** P1.0 + ledger + Gate 2 shipped 2026-08-22. Apply migration 199. Sell surface (`/pricing`, nav, pilot paper) shipped 2026-08-22 — see P1.8.
>
> **B-Q1 resolved 2026-08-22 — full ₹49 on every completed consult, including follow-ups the doctor gives free.** No remaining blockers. See P1-D8 and P1.6.
>
> **Why this is its own session:** payments + a migration + new RLS + 8 files. Next migration number is **199**.
>
> **Effort:** ~3–4 days. P1.0 is a few hours and should ship first, separately if possible.

---

## The one sentence that justifies this phase

> You can invoice by hand. You cannot reconstruct a month that already passed.

Ten founding doctors is ~30 minutes of manual invoicing a month — that is fine, and it is P3's problem. What is *not* recoverable is a month where nobody counted. Everything in P1 exists to make the count trustworthy before the first doctor signs.

---

## ⚠️ P1.0 first — P0 left patient money with no exit

Found while planning this phase, 2026-08-22. **Verify before anything else in P1.**

Every Razorpay call in the codebase authenticates with the **single platform account** from env:

- `backend/src/config/payment.ts` → `razorpayConfig = { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET }`
- `backend/src/adapters/razorpay-adapter.ts:41` → `new Razorpay({ key_id: razorpayConfig.keyId, key_secret: razorpayConfig.keySecret })`
- `backend/src/services/refund-service.ts:23` → same platform client

There is **no per-doctor credential path anywhere.** The old design was: capture into the Halo Aid account → Razorpay Route transfer to the doctor's linked account. P0 correctly darkened the transfer. The capture was left live.

So the current state is: **a patient payment lands in the Halo Aid Razorpay account and never leaves.** That is worse than the model P0 removed — it is the aggregator shape *plus* the doctor not getting paid.

**Do this before writing ledger code:**

1. Check whether `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are set in the deployed environment, and whether any `payments` row has `status = 'captured'` with a real amount. If the answer is "no keys, no captures" — which is likely, since the company was registered 2026-08-20 — this is a design hole, not an incident. Confirm it, then gate it.
2. If any real rupee was captured: stop, reconcile it by hand to the doctor, and record it. Do not paper over it with code.

### P1.0 — Force bookings-only until per-doctor credentials exist

**Files:** `backend/src/config/env.ts` (new flag), `backend/.env.example`, `backend/src/services/slot-selection-service.ts` (the quote → `amountMinor` path), `backend/tests/unit/services/slot-selection-service.test.ts` (or the nearest existing suite).

**Spec.** Add `PREPAID_BOOKINGS_ENABLED` (default `false`). When false, `processSlotSelectionAndPay` short-circuits to the existing bookings-only branch — `slot-selection-service.ts:757` already reads `if (!amountMinor || amountMinor <= 0)` and returns `paymentUrl: null` while still booking the slot. Force that branch before the quote is used, and log the reason once per call.

**Why an env flag and not a column.** The per-doctor `payment_collection_mode` column belongs with the connect flow that populates it (P2.4). A column here would ship a switch with nothing on the other side of it, and burn P1's one migration. The flag flips to `true` in P2 when doctor-owned credentials actually exist.

**What this means commercially:** every founding doctor is on **scanner mode** at signup. That is already how [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) describes onboarding — "connecting a gateway is optional and never blocks onboarding" — so this costs nothing in the pitch. Prepaid bookings become the P2 upsell.

**DO NOT** in this item: build a connect flow, add per-doctor keys, touch `razorpay-adapter.ts`, or delete the capture path. Gate it, don't gut it.

---

## Decisions LOCKED for this phase

| ID | Decision | Implication |
|----|----------|-------------|
| **P1-D1** | **The ledger is a table of billable consults, not an event stream.** One row per appointment (`UNIQUE (appointment_id)`), plus a separate append-only `billing_adjustments` table for corrections. Resolves **B-Q2** to its plan-00 default. | Reconnects, duplicate webhooks, and re-runs of the recorder collapse to one row by construction. No dedupe logic to get wrong. |
| **P1-D2** | **The doctor can read the ledger and nothing else.** RLS gives `SELECT` on `auth.uid() = doctor_id`; `INSERT` / `UPDATE` / `DELETE` are service-role only. | A **deliberate divergence** from the prescriptions-style doctor-CRUD pattern (cross-cutting principle 7). A doctor must be able to audit the count (B5) and must not be able to delete a consult off their own invoice. |
| **P1-D3** | **`invoiced_at` is an immutability latch.** Once set, the row is frozen — the recorder and the void path both refuse to modify it. Money corrections after invoicing are `billing_adjustments` rows. | B4. An invoice that can silently change is an invoice a doctor stops trusting. |
| **P1-D4** | **Prices live in exactly one file** — `backend/src/config/billing-levels.ts`. Base, included count, per-consult, cap, GST. Nothing else hardcodes a rupee. | The founding-ten lock (cross-cutting principle 8) becomes "which level set applied on this date", not a grep across the codebase. |
| **P1-D5** | **Doctor wrap-up is a first-class billable source, equal to duration-verified.** A 40-second token-mode follow-up that the doctor explicitly wrapped up is billable. Resolves the owner's Q10 objection. | The 60s floor in `MIN_VERIFIED_CONSULTATION_SECONDS` is `Math.max(60, …)` in `env.ts` — it cannot be lowered. So the fix is a second source, not a smaller threshold. |
| **P1-D6** | **Void, never delete.** Anything the recorder cannot confidently classify writes `status = 'void'` with a reason. | Cross-cutting principle 3: under-bill rather than look dishonest. A voided row is auditable; a missing row is not. |
| **P1-D7** | **No invoice table in P1.** The month rollup is a read-only query the founder runs. | Invoices are P2. Shipping an `invoices` table here means guessing at fields P2 will actually need. |
| **P1-D8** | **Every completed consult is billable at the full rate, including follow-ups the doctor gives away free.** The recorder never reads `followup_policy`, `care_episodes`, or any price the doctor set. Resolves **B-Q1**. | The doctor's follow-up config is rich enough to be an unbounded hole (`free` + `max_followups: 100` + a 3,650-day window is valid). Mirroring it would also make our revenue a function of their fee schedule — the coupling percentage pricing was ruled out for. Rationale and the worked numbers live in the decision log under "Follow-ups bill at full rate". |

---

## Items

### P1.1 — Migration 199: the usage ledger

**File:** `backend/migrations/199_billing_usage_ledger.sql` — **STOP item. Do not write until the session is approved.**

**Spec.** Two additive tables, no changes to existing ones.

`billable_consults`:

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `doctor_id` | `UUID NOT NULL` | FK to the same target existing doctor-owned tables use — confirm against `026_prescriptions.sql` at execution time |
| `appointment_id` | `UUID NOT NULL` | FK `appointments(id)`, `ON DELETE RESTRICT` — a billed consult must not vanish |
| `billing_period` | `DATE NOT NULL` | First day of the `Asia/Kolkata` calendar month. Resolves **B-Q3** early because the ledger has to pick something |
| `occurred_at` | `TIMESTAMPTZ NOT NULL` | The billable moment |
| `modality` | `TEXT NOT NULL` | `video` \| `voice` \| `text` \| `in_person` |
| `source` | `TEXT NOT NULL` | `verified_overlap` \| `doctor_wrapup` \| `wrapup_sweep` \| `async_reply` |
| `status` | `TEXT NOT NULL DEFAULT 'billable'` | `billable` \| `free_followup` \| `void` |
| `void_reason` | `TEXT` | Required when `status = 'void'`. `same_encounter_continuation` is the P1.6 case |
| `free_followup_of` | `UUID` | Self-FK. **Dormant at launch** — nothing writes it (P1-D8). Carried as the reversibility hedge if the follow-up concession is ever granted |
| `invoiced_at` | `TIMESTAMPTZ` | Immutability latch (P1-D3) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

Constraints: `UNIQUE (appointment_id)` (P1-D1). Indexes on `(doctor_id, billing_period)` — the rollup and the panel both read exactly that — and on `(status)` for the review queue.

`billing_adjustments`: `id`, `doctor_id`, `billing_period`, `amount_minor` (signed `INTEGER`; negative = credit to the doctor), `reason TEXT NOT NULL`, `created_by TEXT NOT NULL` (`system` \| `founder`), `created_at`. Append-only by convention and by RLS.

RLS on both: enable, doctor `SELECT` on `auth.uid() = doctor_id`, no doctor write policies (P1-D2). No `invoice_id` column yet — P2 adds it (P1-D7).

**No backfill.** Consults completed before this migration are not billable; nobody has signed yet.

### P1.2 — The single source of pricing truth

**File:** `backend/src/config/billing-levels.ts` (new).

**Spec.** Export the locked sheet as minor units, plus pure functions over it. Nothing reads `process.env` here — these are product constants, not configuration (per the agent contract, env access belongs in `config/env.ts`, and these are not env at all).

- `BASE_MINOR = 99_900` (₹999)
- `INCLUDED_CONSULTS = 20`
- `PER_CONSULT_MINOR = 4_900` (₹49)
- `CAP_MINOR = 1_249_900` (₹12,499)
- `GST_PERCENT = 18`
- `computeMonthlyBill({ billableCount })` → `{ baseMinor, meteredMinor, subtotalMinor, cappedMinor, gstMinor, totalMinor, capReached: boolean }`

Two invariants worth a test each: the cap binds at **255** billable consults (`(1_249_900 − 99_900) / 4_900 = 234.69` metered, `+ 20` included), and GST-inclusive display values round to ₹1,179 / ₹58 / ₹14,749 as B7 requires.

### P1.3 — The recorder

**Files:** `backend/src/services/billing/usage-ledger-service.ts` (new), `backend/src/types/billing.ts` (new).

**Spec.** One entry point:

```
recordBillableConsult({ appointmentId, doctorId, modality, source, occurredAt }, correlationId)
```

Behaviour:

- Idempotent via `UNIQUE (appointment_id)` — a conflict is a **success**, logged at debug, not an error. Callers fire it from several places on purpose.
- Resolves `billing_period` from `occurredAt` in `Asia/Kolkata` using `luxon` (already a dependency — see `payout-service.ts`, which keeps its date math for exactly this reason).
- Applies the same-encounter check (P1.6) to decide `billable` vs `void`. It does **not** consult the doctor's follow-up policy or fee schedule (P1-D8).
- Never throws into the caller's path. A consult must not fail because billing failed. Log, count, move on — the reconciliation query in P1.7 catches gaps.
- Writes an audit row via `logDataModification`, IDs and totals only (cross-cutting principle 6).

Also `voidBillableConsult(appointmentId, reason, correlationId)` — refuses when `invoiced_at IS NOT NULL` (P1-D3).

**Follow the `modality-refund-retry-worker` doctrine** referenced in plan-00: guarded UPDATEs that re-assert their predicate, so a concurrent run matches zero rows and no-ops.

### P1.4 — Gate 2: wire `billable ≠ verified`

**Files:** `backend/src/services/consultation-verification-service.ts`, `backend/src/services/appointment-service.ts` (`wrapUpAppointment`, ~line 1233), `backend/src/workers/auto-no-show-worker.ts` (the wrap-up sweep branch).

**Spec.** Three call sites, one rule.

`tryMarkVerified` has four branches (`consultation-verification-service.ts:480+`). Only three of them are billable:

| Branch | Condition | Billable? |
|---|---|---|
| 1 | `!patient_joined_at` — doctor joined, room ended, patient never came | **No.** This is the B2 defect. It marks `verified_at` + `status='completed'` because the old payout model wanted it to. Call `recordBillableConsult` with `source='verified_overlap'` **only when `patient_joined_at IS NOT NULL`.** |
| 2 | Patient left first | Yes |
| 3 | Doctor left first, overlap ≥ 60s | Yes |
| 4 | (remaining duration branch) | Yes — confirm the tail of the function at execution time |

`wrapUpAppointment` → `recordBillableConsult` with `source='doctor_wrapup'`. This is P1-D5, and it is the only path that bills in-person / OPD consults and sub-60s token-mode follow-ups. It already has the idempotency shape we need: it returns a no-op when `previousStatus === 'completed'` and re-asserts `status <> 'completed'` in the UPDATE, so the recorder is called at most once per real completion.

Auto wrap-up sweep → `source='wrapup_sweep'`. Note this path is **dark-shipped** behind `AUTO_WRAP_UP_SWEEP_ENABLED`. If it is off in production, a doctor who never opens the wrap-up dialog is never billed. That is the right failure direction (P1-D6) but the founder should know it, and the P1.7 reconciliation query should surface it.

**Do not** change any branch predicate, `MIN_VERIFIED_CONSULTATION_SECONDS`, or the join-time stamps. Record alongside; decide nothing new about verification.

**Surfaced, deliberately not fixed here:** branch 1 marking a patient no-show as `status='completed'` is also wrong for the *appointments* data model — it hides no-shows from the auto-no-show worker and from the doctor's own numbers. It is not a billing bug once P1.4 lands, so fixing it is a separate task against the patient-flow domain, not scope creep inside a billing session.

### P1.5 — Async / text consults

**Files:** `backend/src/services/text-session-supabase.ts` (the doctor-role send path, ~line 762 `senderRole: 'doctor' | 'patient' | 'system'`).

**Spec.** The billable moment for an async consult is **the doctor sending a clinical reply** (B2). First doctor-role message in a text session records the consult; the `UNIQUE (appointment_id)` constraint makes every subsequent message a no-op. `source='async_reply'`, `modality='text'`.

System messages and patient messages never bill. Confirm at execution time that a doctor-authored send is distinguishable from a bot-authored one on this path — if the bot can post as `doctor`, that distinction is load-bearing and needs an explicit check, not an inferred one.

### P1.6 — Same-encounter protection (**not** a follow-up exemption)

**Files:** `backend/src/services/billing/usage-ledger-service.ts`.

**B-Q1 is answered: follow-ups bill at full rate (P1-D8).** So there is no follow-up rule to build, and the recorder must not import anything from `care-episode-service.ts`, `consultation-fees.ts`, or `service-catalog-schema.ts`. A dependency on those files is the bug this decision exists to prevent.

What *does* need a rule is the different thing that gets confused with it: **one clinical encounter must never bill twice.**

| Situation | Billable rows | How |
|---|---|---|
| Patient reconnects after a dropped call, same appointment | 1 | Structural — `UNIQUE (appointment_id)` (P1-D1). No code. |
| Follow-up visit next week, new appointment | 2 | Correct. Distinct consult, distinct cost, full ₹49 (P1-D8). |
| **Doctor books a fresh slot to finish an interrupted consult** | **1** | **Needs this rule.** A new appointment row, so the constraint does not catch it. |

**Spec.** Before recording, if the same doctor + patient already has a `billable` row **today** (IST) whose consult ran under a short threshold — start at 120 seconds, put the number in `billing-levels.ts` — record the new row as `status = 'void'` with `void_reason = 'same_encounter_continuation'` rather than billing it.

Deterministic, no AI, no clinical judgement (cross-cutting principle 4). It errs toward under-billing by design: a genuine same-day second consult after a very short first one is rare, and losing that ₹49 is cheaper than a doctor spotting a double charge on invoice one (P1-D6).

**Keep `free_followup` and `free_followup_of` in the schema, dormant.** Nothing writes them at launch. They cost nothing to carry and mean that if founding doctors push back hard in month two, the concession is a status update instead of a backfill.

**Note:** matching "the same patient" needs the patient linkage on the appointment. Confirm the column at execution time and keep patient identifiers out of logs (PHI).

### P1.7 — Month rollup and reconciliation (read-only)

**Files:** `backend/src/services/billing/billing-rollup-service.ts` (new), `backend/src/routes/api/v1/billing.ts` (new, admin-scoped), `backend/src/controllers/billing-controller.ts` (new).

**Spec.** Two read-only queries behind the existing admin auth pattern (mirror `admin-doctors.ts` / `admin-verifications.ts`; validate params with Zod in the controller, no try/catch, `asyncHandler`, service does the DB work).

1. **Rollup:** for `{ doctorId?, billingPeriod }` → billable count, void count broken down by `void_reason`, and `computeMonthlyBill` applied. This is what the founder reads to raise ten invoices by hand. (Free-follow-up count is always 0 at launch — P1-D8.)
2. **Reconciliation:** appointments that reached `status='completed'` in the period with **no** ledger row, and ledger rows whose appointment is not completed. Both directions should be empty. This is the query that catches a missed call site — the thing that makes the count trustworthy rather than merely present.

No PDF, no email, no doctor-facing endpoint in P1 (that is P2.2 / P2.8).

### P1.8 — Sell surface (**shipped 2026-08-22**)

Recorded here so P2 does not re-propose it.

| Artifact | State |
|---|---|
| `frontend/app/pricing/page.tsx` | Shipped — worked-examples table, GST-inclusive numbers, "what is never billed", founding-ten terms (B6/B7) |
| `frontend/components/marketing/MarketingNav.tsx`, `MarketingFooter.tsx` | Shipped — `/pricing` linked from both |
| [`PILOT_AGREEMENT.md`](../../../Reference/business/PILOT_AGREEMENT.md) | Updated — clause 3 (price, 12-month lock), 3a (patient money), 3b (refund floor), clause 2 (bot is not triage) |

**Still open and not code:** GST registration, our own merchant account, and lawyer sign-off on the fee-splitting reading. Gate 4 in the decision log. **No doctor signs before that sign-off** — P1 shipping green does not change that.

---

## Tests

| File | What it covers |
|---|---|
| `backend/tests/unit/config/billing-levels.test.ts` (new) | Cap binds at 255. GST-inclusive rounding hits ₹1,179 / ₹58 / ₹14,749. Bill is monotonic in count and never exceeds the cap. |
| `backend/tests/unit/services/billing/usage-ledger-service.test.ts` (new) | Second call for the same appointment is a silent no-op. `billing_period` is IST, including a consult at 23:30 IST on the last day of a month. Void refuses after `invoiced_at`. Recorder failure never propagates to the caller. **A consult under a doctor's `free` follow-up policy records `billable` at full rate** (P1-D8). Same-day continuation after a sub-120s consult records `void`; a same-day second consult after a normal-length one records `billable`. |
| `backend/tests/unit/services/consultation-verification-service.test.ts` | Extend: branch 1 (no patient join) records **nothing**; branches 2–4 record exactly one row. The four verify branches must still pass unchanged. |
| `backend/tests/unit/services/appointment-service.test.ts` (nearest existing wrap-up suite) | Wrap-up records one row; the idempotent second wrap-up records none. |
| `backend/tests/unit/services/billing/billing-rollup-service.test.ts` (new) | Reconciliation catches a completed appointment with no ledger row, and a ledger row without a completed appointment. |

---

## DO NOT TOUCH

- `tryMarkVerified` branch predicates, `MIN_VERIFIED_CONSULTATION_SECONDS`, join-time stamps
- `payment-gateway.interface.ts`, `razorpay-adapter.ts`, `paypal-adapter.ts`, webhook signature verification
- `modality-billing-service.ts`, `modality-refund-retry-worker.ts` — patient↔doctor modality refunds, a different rail (reused in P2.6, unchanged here)
- Anything the P0 demolition darkened — no un-deprecating, no column drops (P0.5 owns that)
- Any `subscriptions`, `invoices`, `mandates` table, or doctor-facing billing UI — P2
- `frontend/app/pricing/page.tsx` and `PILOT_AGREEMENT.md` — shipped, and changing them means changing the sheet
- The `reason_for_visit` collection path and all safety-net copy — unrelated domain, live safety behaviour

---

## Verification gate

1. Typecheck + lint + the full unit suite (agent contract — never skip).
2. `rg 'recordBillableConsult' backend/src` → exactly the four intended call sites plus the service.
3. `rg '999|4900|12499' backend/src --glob '!**/billing-levels.ts'` → no rupee constants outside P1-D4's file.
4. `rg 'care-episode|consultation-fees|service-catalog-schema|followup_policy' backend/src/services/billing` → **empty.** The meter must not be able to see what the doctor charges (P1-D8).
5. Migration 199 is additive: no `DROP`, no `ALTER … TYPE`, no backfill, RLS enabled on both tables with **no doctor write policy** (P1-D2).
6. Manual: book → complete a consult on a local stack → exactly one `billable_consults` row. Book → doctor joins, patient never does → **zero** rows.
7. Manual: complete a consult on a service whose `followup_policy.discount_type = 'free'` → one `billable` row at full rate, and `paymentUrl` was `null` throughout (free follow-ups already take the no-payment branch, so payment presence is never a billability signal).
8. `PREPAID_BOOKINGS_ENABLED` unset → booking succeeds with `paymentUrl: null` and no Razorpay call is made.

---

## After this ships

P2 is unblocked: the doctor billing panel has a number to show (B5), and per-doctor gateway credentials have a reason to exist (P1.0's flag flips there). Answer **B-Q4** (where credentials live) and **B-Q5** (does Razorpay OAuth scope include refunds) before opening P2 — B-Q5 needs Razorpay, not code, so start asking now.

---

**Created:** 2026-08-22.
**Owner:** Founder.
**Last reviewed:** 2026-08-22.
