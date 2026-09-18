# Execution order — p1 quick wins

> Batch: [`../plan-p1-quick-wins-batch.md`](../plan-p1-quick-wins-batch.md)

---

## Pre-flight (before any code)

- [ ] Read the measured breakdown in the [program README](../../README.md#the-measurement). Every task in this phase is justified by one row of that table — if your change does not move a row, it does not belong here.
- [ ] Confirm **LAT-D1** (reply quality is not for sale) and **LAT-D3** (locks/idempotency/throttles untouchable). These two kill most "clever" shortcuts before they cost you a day.
- [ ] Read [`RBH-12`](../../../../../March%202026/2026-03-25/Receptionist%20Bot%20improvements/Tasks/e-task-rbh-12-dm-latency-faster-replies.md) so you do not re-do phase 1 of it. The metric and the 140-token intent cap already shipped in March; its greeting fast path was later removed on purpose.
- [ ] Have `npm run dev` up and `npm run test:dm-language` passing 4/4 **before** you touch anything — that is your before-picture and your regression net.
- [ ] Skim the existing tiered-model accessors in `backend/src/config/openai.ts` (`getOpenAIComplaintParseConfig` and friends). `lat-02` copies that shape; do not invent a second pattern.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **0 — Scoreboard** | `lat-01` ✅ | Must land first. Everything after it closes on numbers, and without a readout you are guessing. Cheap. |
| **1 — Independent wins** | `lat-02` ✅, `lat-03` ✅ | Disjoint files (`ai-service`/`openai` config vs `instagram-service`). Safe to run in parallel; either can ship alone. |
| **2 — Spine** | `lat-04` ✅ | **Opus.** Reorders awaits in `run-conversation-turn.ts`. Do it after wave 1 so a regression here is not tangled with two other diffs. |
| **3 — Dial** | `lat-05` ✅ | Needs wave 1+2 landed, otherwise the LLM segment is still dominated by the mispriced model and the reading is meaningless. |
| **4 — Gate** | `lat-06` | Re-measure, compare to the recorded baseline, decide whether p2/p3 are still worth their risk. |

Waves 1 and 2 could technically overlap, but do not — `lat-04` is the only task here that can plausibly break correctness, and it deserves a clean diff.

---

## Task files

| # | File |
|---|------|
| 01 | [`task-lat-01-harness-timing-baseline.md`](./task-lat-01-harness-timing-baseline.md) |
| 02 | [`task-lat-02-intent-mini-model-tier.md`](./task-lat-02-intent-mini-model-tier.md) |
| 03 | [`task-lat-03-graph-host-hop.md`](./task-lat-03-graph-host-hop.md) |
| 04 | [`task-lat-04-parallelize-presend-reads.md`](./task-lat-04-parallelize-presend-reads.md) |
| 05 | [`task-lat-05-history-pairs-tuning.md`](./task-lat-05-history-pairs-tuning.md) |
| 06 | [`task-lat-06-close-gate-p1.md`](./task-lat-06-close-gate-p1.md) |

---

**Created:** 2026-08-02.
