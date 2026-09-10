# Plan 00 — Billing roadmap (master index for phases P0–P3)

## Turn the locked pricing model into a system that can invoice a real doctor, and a website that can sell it

> **Commercial reference:** [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) — the locked structure, the ruled-out options, and the four preconditions. **This roadmap does not re-litigate pricing.** If a phase item seems to need a different price shape, that is a signal to stop and raise it against the decision log, not to improvise here.
>
> **The sheet being implemented (as of 2026-08-21):** ₹999/month including the first 20 completed consults · ₹49 per completed consult after · the bill can never exceed ₹12,499/month (cap binds at ~255 consults) · custom plans from the published ladder past 500. Doctor pays us on a separate monthly GST invoice. We are never in the patient's money flow.
>
> **Why this folder exists now:** the company was registered 2026-08-20, which unblocks GST registration, our own merchant account, and the pilot paper. Nothing in P1 can be *collected* before that paper exists.

---

## Goal

Get from "pricing is decided in a markdown file" to **"a doctor signs, uses the product for a month, and receives a correct invoice they believe."**

The make-or-break framing:

> You can invoice by hand. You cannot reconstruct a month that already passed.

Metering is the hard blocker; billing automation is not. Every sequencing call in this roadmap follows from that one sentence.

---

## Decisions LOCKED at roadmap creation (2026-08-22)

| ID | Decision | Implication |
|----|----------|-------------|
| **B1** | **Count from day one, collect by hand at first.** The usage ledger ships in P1. UPI AutoPay mandates, month-close automation, and dunning wait for P3 (~25 doctors). | Ten founding doctors is ~30 minutes of manual invoicing a month. Automating that first is weeks of work for no learning. |
| **B2** | **`billable` is its own definition, never an alias of `verified`.** `billable = verified AND patient_joined_at IS NOT NULL`; async equivalent is the **doctor** sending a clinical reply. | `tryMarkVerified` branch 1 (patient no-show) intentionally marks `verified` — correct for the old payout model, wrong as a meter. The meter reads the ledger, never the appointment status directly. |
| **B3** | **The old monetisation model is demolished before the new one is built** — platform-fee-on-patient-payment (migration 022) and doctor payouts (`payout-service.ts`, migration 025) come out in P0. | Both implement models the decision log rules out; payouts are RBI PA activity we cannot perform. Leaving them live risks a real rupee moving on a wrong rail. |
| **B4** | **One usage row per consult, idempotent, immutable once invoiced.** Reconnects collapse to one row. Corrections are new adjustment rows, never edits. | Follows the existing `modality-refund-retry-worker` doctrine (per-attempt idempotency keys, guarded UPDATEs). An invoice that can silently change is an invoice a doctor stops trusting. |
| **B5** | **The doctor can always see the meter.** Running consult count, current bill, and distance to the cap are visible in-product before the first invoice is ever sent. | Trust infrastructure, not a nice-to-have. A doctor who cannot audit our count will dispute the total. |
| **B6** | **The pricing page is the worked-examples table.** No feature-gating grid, no fake tiers, no "contact sales" for the standard plan. | Per the decision log: tiers as illustration, meter as mechanism. Published tiers are in Ruled out. |
| **B7** | **Quote GST-inclusive numbers to doctors** (₹1,179 · ₹58 · ₹14,749) while invoices stay standard ex-GST + GST line. | Medical services are GST-exempt, so the doctor cannot claim input credit — they experience the gross number. |
| **B8** | **No custom quote until Gate 1 ships.** Ladder rates (₹18–25) are below today's ₹36.46 cost per consult. | Applies to sales conversations as much as code. A signed custom plan on today's stack loses money on every consult. |

---

## What's already shipped (so the phase plans don't re-propose it)

Verified against the codebase 2026-08-22.

| Capability | Where | Notes |
|------------|-------|-------|
| Raw consult-completion signal | `consultation-verification-service.ts` → `tryMarkVerified` | "Who left first" rule, not a flat duration gate. Four branches; branch 1 is the no-show defect B2 addresses. `MIN_VERIFIED_CONSULTATION_SECONDS` is floored at 60 by `Math.max` in `env.ts` — lowering the number is not the lever. |
| Payment link creation + webhook parsing | `payment-gateway.interface.ts`, `razorpay-adapter.ts`, `paypal-adapter.ts`, `webhook-worker.ts` | Gateway-agnostic interface with two live adapters. **No `refund` method** — that is a P2 item. |
| Refund execution pattern | `modality-billing-service.ts`, `modality-refund-retry-worker.ts` | Inline attempt → backoff retry with per-attempt idempotency keys → permanent-failure sentinel → `admin_payment_alerts` (`refund_stuck_24h`) → patient DM copy. The general refund rail reuses this shape rather than inventing one. |
| Booking with no payment link | `slot-selection-service.ts` → `processSlotSelectionAndPay` | Returns `paymentUrl: null` and still books when `amountMinor` is 0/unset. This is the bookings-only ("scanner mode") seam. |
| DM cancel / reschedule flow | `workers/dm/stages/cancel-reschedule-status.ts` + `confirm_cancel` in `action-executor-service.ts` | End to end: intent → list → numeric pick → confirm. **Flips appointment status only; no money moves.** |
| Marketing site + kit | `frontend/app/page.tsx`, `components/marketing/` | `MarketingNav`, `Hero`, `HowItWorks`, `FeatureGrid`, `TrustBand`, `FinalCtaBand`, `MarketingFooter`. `/terms` and `/privacy` exist. **No `/pricing` route and no nav link to one.** |
| AI cost telemetry | `logAIClassification` → `audit_logs` where `action = 'ai_classification'` | Already writes model + token counts from 7 services. Gate 3 is a query against existing data, not new instrumentation. |

**What does NOT exist anywhere:** doctor subscriptions, invoices, a usage/billable ledger, mandate storage, or any notion of a monthly bill to a doctor. A search of all 197 migrations finds one `subscription` table — `111_web_push_subscriptions.sql`, unrelated. The doctor-billing system is entirely net-new.

---

## Phase overview

| Phase | Theme | Items | Schema work | Blocks selling? | Status |
|-------|-------|-------|-------------|-----------------|--------|
| **P0 — Demolition** | Remove platform-fee-on-patient-payment (migration 022 columns + the `payment-service.ts` fee computation) and the payout stack (`payout-service.ts`, `razorpay_linked_account_id`, `payout_schedule`, `DEFAULT_PAYOUT_SCHEDULE`, per-appointment trigger in `tryMarkVerified`). | ~4 | 198 (comments only) | **Yes** — wrong rails are live | `Executed` 2026-08-22 — [`plan-p0-billing-demolition.md`](./plan-p0-billing-demolition.md). Apply migration 198. |
| **P1 — Meter + sell** | **P1.0 close the money-rail hole (see below)**; usage ledger (B2/B4); no-show exclusion + token-mode explicit-end (Gate 2 / Q10); async-reply billable signal; same-encounter protection; month rollup + reconciliation; `/pricing` + paper (shipped). | ~9 | 199 (ledger + adjustments) | **Yes** | [`plan-p1-meter-and-sell.md`](./plan-p1-meter-and-sell.md). `/pricing` + paper + **P1.0 + ledger + Gate 2 shipped 2026-08-22.** Apply migration 199. |
| **P2 — Trust + rails** | Split **P2a** (subscriptions + invoices schema, doctor billing panel, invoice PDF) and **P2b** (per-doctor gateway credentials, connect flow + payment mode, adapter `refund`, refund policy engine, policy disclosure). | ~8 | **202** · **203** · **204** (webhook secret) | No | **P2a + P2b + prepaid webhooks shipped 2026-08-22.** Apply **199, 202, 203, 204**. P3 deferred. — [`plan-p2-trust-and-rails.md`](./plan-p2-trust-and-rails.md). |
| **P3 — Automation** | UPI AutoPay mandate creation + debit execution; month-close worker with a reconciliation interlock; dunning + non-payment behaviour (B-Q6); e-NACH for customs; in-product no-show nudge. | ~6 | TBD after P2b (was 202) | No | **Parked 2026-08-22** (founder: why AutoPay / auto-refunds). See [`NOTE-autopay-vs-autorefund.md`](./NOTE-autopay-vs-autorefund.md). Trigger remains ~25 doctors *and* a new ask. — [`plan-p3-collection-automation.md`](./plan-p3-collection-automation.md) |

**Next free billing migration after 204 is 205+.** Every migration above is a STOP item — see Scope guard.

### ⚠️ Correction to the P0 status: patient money now has no exit

Found while planning P1, 2026-08-22, and it changes what P1 does first.

Every Razorpay call in the codebase authenticates with the **single platform account** from env (`config/payment.ts` → `razorpay-adapter.ts:41`, and `refund-service.ts`). There is no per-doctor credential path anywhere. The old design captured patient money into the Halo Aid account and used Razorpay Route to transfer it onward. **P0 correctly darkened the transfer and left the capture live** — so a patient payment today lands with us and never leaves. That is the aggregator shape *plus* the doctor not being paid.

It is almost certainly a design hole rather than a live incident (the company was registered 2026-08-20; there should be no real captures), but that must be **verified, not assumed**. P1.0 gates prepaid bookings off behind an env flag so every doctor is on bookings-only until doctor-owned credentials exist in P2.3. Details in [`plan-p1-meter-and-sell.md`](./plan-p1-meter-and-sell.md).

---

## Sequencing recommendation

```
Now                    Before first invoice        At ~25 doctors
 │                          │                           │
 ▼                          ▼                           ▼
P0 → P1                  P2                          P3
demolish, then      trust + payment rails       collection automation
meter + price page   (invoice by hand)

Parallel, not code: GST registration · our Razorpay account · Gate 1 (cost-cut stack) · Gate 3 (AI cost query) · lawyer sign-off
```

Rationale:

- **P0 first, always.** It is not cleanup — `payout-service.ts` can move real money on a rail we are not licensed to operate, and `payment-service.ts` still computes a 5%-or-flat fee against the patient's payment. Building the new meter beside live wrong rails is how you end up billing twice.
- **P1 is the actual "can we sell" gate**, and it is smaller than it looks: a ledger, a defect fix, one marketing page, and paper. Note the paper is the hard dependency, not the code — no signature without [`PILOT_AGREEMENT.md`](../../../Reference/business/PILOT_AGREEMENT.md) and lawyer sign-off on the fee-splitting reading.
- **P2 while the founding ten onboard.** The billing panel (B5) matters more than invoice automation: the first invoice is a conversation, and the doctor needs to have been watching the number climb all month. The refund rail lands here because it is only exercised by doctors who connected a gateway.
- **P3 when manual invoicing hurts.** Ten doctors do not justify mandate plumbing; thirty do. Deferring also means the mandate is built after Q4/Q6 are settled by real behaviour.
- **Gate 1 runs alongside everything.** At ₹49 the pre-migration marginal margin is 26%, and past ~343 consults the cap zone loses money on today's stack (₹36.46/consult). P0–P2 can ship without it; the first invoice should not. See [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) § Cost inputs.

---

## Cross-cutting principles (apply to every phase)

These flow from the LOCKED decisions. Phase plans reference this section rather than restating it.

1. **Never in the patient's money flow (locked #2 in the decision log).** Our revenue moves doctor → us on a separate rail. Nothing we bill is ever deducted from a patient payment. Any design that nets our fee out of a consult fee is wrong by construction, however convenient.
2. **The meter is our own count, not the doctor's revenue.** We count consults in our DB. We never read, infer, or store what the doctor charged in order to price. This is the decisive reason percentage pricing was ruled out — do not reintroduce it through a "helpful" analytics feature, and do not reintroduce it through the follow-up door either: a consult the doctor gave away free still bills ₹49 (B-Q1, resolved). The billing services must not import `followup_policy`, `care_episodes`, or `consultation-fees`.
3. **Under-bill rather than look dishonest.** Errored sessions, ambiguous reconnects, and anything the ledger cannot confidently classify → `void` + flagged for review. A missed ₹49 is cheap; a disputed invoice is not.
4. **Deterministic amounts, never AI-decided.** Same input, same rupee, explainable months later. Applies to the meter, the cap, and refund policy alike (see the refund rules table in the decision log).
5. **Invoice wording is technology, not commission.** "Platform subscription and usage — N consultations, {month}". Never "commission" or any share-of-revenue phrasing, in code, PDFs, emails, or UI copy.
6. **No PII/PHI in billing artifacts.** Invoices carry counts and periods, never patient names, reasons for visit, or diagnoses. Billing logs carry IDs and totals only.
7. **Additive, reversible migrations.** Follow [`MIGRATIONS_AND_CHANGE.md`](../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) exactly. New tables mirror the established doctor-ownership RLS shape (`doctor_id` + CRUD policies keyed on `auth.uid() = doctor_id`); invoice and ledger rows are doctor-readable, never patient-readable.
8. **Founding-ten price lock is a data field, not a promise in a doc.** Whatever P2 stores for a subscription must be able to hold "this doctor's levels are frozen until {date}" so a future price change cannot silently reprice them.

---

## Non-goals (explicitly NOT on this roadmap)

- Collecting the patient's consult fee and paying doctors out — ruled out (RBI PA licence). P0 removes the existing implementation.
- Any percentage-of-consultation-fee component, including hybrids and "percentage above a threshold".
- Published feature-gated tiers (Starter/Growth/Practice) — ruled out; B6 holds.
- Self-serve checkout and card-on-file signup. Founding ten sign in conversations; self-serve is post-pilot.
- Patient-facing cancellation charges at launch — ruled out in the refund domain.
- Razorpay Partner Program sub-merchant onboarding (Q16) — P2 ships paste-your-keys or assisted signup; partner pre-fill is a later item.
- Instant refunds (₹8–15 add-on) — normal refunds are free and sufficient.
- Multi-doctor seats and staff pricing — priced on the **base** as add-ons when they arrive, never on the meter. Not in P0–P3.
- Annual prepay discounts and prepaid volume plans — doctor-initiated, after month 3, once their own volume is known.
- Dunning sophistication beyond "existing appointments keep working, new bookings pause, doctor notified" (Q6 leaning).

---

## Open questions (must be answered before the phase that needs them)

| # | Question | Needed by | Default if unanswered |
|---|----------|-----------|----------------------|
| B-Q1 | ~~Free follow-ups~~ **Resolved 2026-08-22 — full ₹49 on every completed consult, whatever the doctor charged.** The meter never reads `followup_policy` or `care_episodes`. What *does* get built is the narrower same-encounter rule (P1.6). `free_followup_of` stays in the schema, dormant, as the reversibility hedge. | — | — |
| B-Q2 | ~~Ledger granularity~~ **Resolved** in P1-D1: row per consult (`UNIQUE (appointment_id)`) + append-only `billing_adjustments`. | — | — |
| B-Q3 | ~~Invoice period boundary~~ **Resolved** in P1.1: calendar month, `Asia/Kolkata`, stored as `billing_period`. The ledger had to pick one, so it did. | — | — |
| B-Q4 | Where do per-doctor gateway credentials live — encrypted column, Supabase Vault, or an external secret store? | P2 | Encrypted column with app-level encryption, keyed per doctor. Revisit if a doctor's compliance team asks. |
| B-Q5 | Does Razorpay OAuth scope include refunds (decision-log Q8)? | P2 | Unknown — **confirm with Razorpay before building the refund engine.** Fallback: deep-link the doctor to their own refund screen. |
| B-Q6 | Mandate failure handling — retry cadence and grace period before bookings pause (decision-log Q6)? | P3 | 3 retries over 7 days, then new bookings pause, existing appointments unaffected, doctor notified at each step. Must be in the pilot agreement before anyone signs. |
| B-Q7 | Custom-plan outreach trigger (decision-log Q17) — keep 300+ sustained, or move to ~400 now that the cap binds at ~255? | P2 (copy), before the first such doctor | Keep 300 but frame the call as a 500-fair-use heads-up with no quote unless the doctor asks. |
| B-Q8 | Keep UPI AutoPay and DM auto-refund as deferred items, or kill until a named doctor needs them? Founder asked 2026-08-22. | Before any P3 / P2.6 session | **Parked.** Do not implement from "next". Write-up: [`NOTE-autopay-vs-autorefund.md`](./NOTE-autopay-vs-autorefund.md). |

---

## ⚠️ Scope guard — read before writing any code

Per [`.cursor/rules/00-agent-contract.mdc`](../../../../.cursor/rules/00-agent-contract.mdc) and [`migrations.mdc`](../../../../.cursor/rules/migrations.mdc), this roadmap is wall-to-wall STOP territory:

- **Every phase touches payments.** P0 removes live money-movement code.
- **Every phase needs a migration** (next is 198). Migrations are a hard-rule STOP — surface and confirm the approach before writing the file. Do not guess RLS or backfills.
- **P0 alone is a 5+ file change** across `payment-service.ts`, `payout-service.ts`, `consultation-verification-service.ts`, `doctor-settings-service.ts`, types, validation, and their tests.

So: **one phase per session, each with its own plan file and its own DO-NOT-TOUCH list.** Do not fold P0 demolition into a P1 feature session — the whole point of doing them separately is that the payment pipeline gets opened deliberately, once per phase, with tests green in between.

**Do not start any phase before** the four decision-log gates are honestly assessed. Gate 1 (cost-cut stack) and Gate 4 (mandate + paper + lawyer sign-off) are the two that can silently invalidate a shipped phase.

---

## How to use this roadmap

1. Read [`PRICING_MODEL_DECISIONS.md`](../../../Reference/business/PRICING_MODEL_DECISIONS.md) end to end — at minimum the locked structure, "The plan", and the whole Ruled-out section. This roadmap assumes it.
2. Read this file. Confirm the phase table and the sequencing rationale.
3. **Verify the money-rail hole above** (are `RAZORPAY_*` keys set in the deployed env, and is there any `payments` row with `status = 'captured'`?). If a real rupee was captured, reconcile it by hand before writing any code.
4. ~~Answer B-Q1~~ — **done 2026-08-22.** Full rate on every consult; nothing in P1 is blocked now.
5. Open a session for **P1.0 only** — the env-flag gate. It is a few hours and it closes the hole.
6. Then a session for the rest of **P1**: [`plan-p1-meter-and-sell.md`](./plan-p1-meter-and-sell.md). Approve its Scope guard and migration 199 before any code.
7. Start asking Razorpay about **B-Q5** (does OAuth scope include refunds) now. It gates P2.6 and the answer does not depend on us.

Phase files: [P0](./plan-p0-billing-demolition.md) · [P1](./plan-p1-meter-and-sell.md) · [P2](./plan-p2-trust-and-rails.md) · [P3](./plan-p3-collection-automation.md) · [AutoPay vs auto-refund](./NOTE-autopay-vs-autorefund.md)

If you want to argue with the pricing: the argument belongs in the decision log, not here. If you want to argue with the build order: argue in the phase plan, not in this file.

---

**Created:** 2026-08-22.
**Owner:** Founder.
**Last reviewed:** 2026-08-22.
