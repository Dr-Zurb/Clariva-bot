# Execution order — p6 translation arms

> Batch: [`../plan-p6-translation-arms-batch.md`](../plan-p6-translation-arms-batch.md)

---

## Pre-flight (before any code)

- [x] **Settle the strategy (LANG6-D2).** ✅ **B — build-time** (2026-08-03). Memo: [`../LANG6-D2-DECISION.md`](../LANG6-D2-DECISION.md).
- [ ] **Line up the reviewers.** A Hindi speaker and a Punjabi speaker, both able to judge *clinic-receptionist register* rather than grammar alone. This phase is reviewer-bound: engineering time is a fraction of the wall-clock. If no Punjabi reviewer exists, decide now to ship `pa` English with a marker (LANG6-D8) rather than discovering it at `lang-27`.
- [ ] **Confirm p5 closed.** p6 translates the families p5 assembled. Starting early means translating a moving target.
- [ ] **Read the PHI registry from LANG5-D3.** Under strategy A it is the masking input; under B it tells reviewers which strings carry patient data. Either way, an unset entry blocks the family.
- [ ] **Take the full `en` snapshot baseline.** Every `en` arm must be byte-identical at the end of the phase. Without a baseline, "we didn't touch English" is an assertion rather than a check.
- [ ] Read the register reference before drafting anything: the Roman-Hindi strings in `consultation-fees.ts` and `safety-messages.ts` are what "warm clinic receptionist" sounds like in this product (LANG6-D6). New arms should sound like they were written by the same person.

---

## The test inversion — read before `lang-26`

The suite currently **asserts** that Hindi equals English:

- `dm-copy-locale-invariants.test.ts:97-104` — `expect(hi).toBe(en)` for confirm-details
- `:138-148` — same for refund DMs
- `:159-166` — same for `formatReasonFirstAskMoreQuestion`
- `:194` — the sentinel guard skips any arm equal to English

So the first genuine translation turns the suite red, in a test named after LANG3-D4, and it will read as a regression.

Invert them **first**, in their own commit, before any translated string lands. `lang-26` §1 owns this. A red suite caused by a deliberate inversion is legible; a red suite discovered halfway through a 20-family translation diff is not.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Decide** | `lang-25` ✅ | LANG6-D2=B. Mechanism + `enByPolicy` + coverage guard + proof family `buildNonTextAckMessage` translated. |
| **2 — Flip the tests** | `lang-26` §1 ✅ | Inverted English-lock → reviewed-or-`enByPolicy`. |
| **3 — Booking critical** | `lang-26` §2+ ✅ eng | Funnel + cancel/status/system copy translated (provisional founder review; real LANG6-D5 reviewers still open). |
| **4 — Everything else** | `lang-27` ✅ eng | Notifications / OOB / leftovers translated; `enAllLocales(` call sites = 0. Provisional founder review. |
| **5 — Gate** | `lang-28` 🟡 | Eng/docs + `test:dm-language` ✅. Founder Meta-client Hinglish funnel + LANG6-D5 reviewers still open. |

**Reviewer batching:** send a whole family to the reviewer at once, not string by string. Reviewers catch register drift by reading a flow, and consistency across a flow is exactly what per-string review misses.

---

## Task files

| # | File |
|---|------|
| 25 | [`task-lang-25-translation-strategy-spike.md`](./task-lang-25-translation-strategy-spike.md) |
| 26 | [`task-lang-26-booking-critical-arms.md`](./task-lang-26-booking-critical-arms.md) |
| 27 | [`task-lang-27-notification-and-oob-arms.md`](./task-lang-27-notification-and-oob-arms.md) |
| 28 | [`task-lang-28-close-gate-p6.md`](./task-lang-28-close-gate-p6.md) |

---

**Created:** 2026-08-02.
