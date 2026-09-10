# Plan p1 — Quick wins, no quality trade (batch)

> **Status:** 🟡 eng done (lat-01…05); gate `lat-06` open for real-IG segment re-measure.
> **Program:** [`../README.md`](../README.md) · Prefix `lat` · Tasks `lat-01`…`lat-06`
> **One-line intent:** Take roughly half the wait out of a DM reply by fixing three things that are pure waste — a flagship model answering a yes/no, an API call that is guaranteed to 190, and independent DB reads standing in a queue.

---

## Why this phase

Everything in p1 is waste removal. Not one item changes what the patient reads, which is why it can ship as a single reviewable PR and why the acceptance gate is a stopwatch rather than a copy review.

The reason to do it before anything cleverer: the two genuinely interesting ideas — a typing indicator (p2) and collapsing the two LLM round trips (p3) — are both **worth less** once p1 lands. A typing indicator on a 4-second reply is nice; on a 12-second reply it is a bandage. And merging two LLM calls is a much easier trade to judge when one of them is no longer a mispriced 2-second flagship call. Measure, then decide.

**Not in this phase:** typing indicators or any user-visible signal (p2), merging or parallelizing the LLM calls (p3), Render/Redis tuning (LAT-D8, ops backlog).

---

## Decision lock

Inherit program **LAT-D1…D8**. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **LAT1-D1** | Intent classification gets its **own config accessor** (`getOpenAIIntentClassifyConfig()`), mirroring `getOpenAIComplaintParseConfig()`. It does not read `OPENAI_MODEL` directly. | Four other bounded-JSON calls already work this way. Consistency beats a special case, and it makes the tier switchable per environment. |
| **LAT1-D2** | The mini tier must be **quality-gated, not assumed.** `lat-02` ships only if the cheap model matches flagship intent labels on a recorded fixture set. | Intent drives branch routing. A faster wrong branch is worse than a slow right one (LAT-D1). |
| **LAT1-D3** | Graph host selection is **derived or remembered, never guessed twice.** No persisted schema change — in-process/Redis memo or derivation from the stored connection is enough. | A column would make this a migration and an Opus task for no benefit; the mapping is stable per doctor and cheap to re-derive on restart. |
| **LAT1-D4** | The failing-host fallback **stays in place** as a fallback. p1 only stops it being the *default first* attempt. | Token types can change when a doctor reconnects. Removing the fallback would trade latency for an outage. |
| **LAT1-D5** | Parallelizing reads may not change **observable ordering** — writes, audit events, and lock acquisition keep their current sequence. | `lat-04` touches the DM spine. Only genuinely independent reads move. |
| **LAT1-D6** | `AI_MAX_HISTORY_PAIRS` is tuned by **measurement on a fixed scenario set**, and the default only moves if reply quality holds. | RBH-12 §2.3 left this open precisely because it is a context-vs-latency trade, not a free win. |

---

## Scope guard

- **DO NOT** change the reply model, reply prompt, or `OPENAI_MAX_TOKENS` (LAT-D1).
- **DO NOT** weaken or reorder idempotency, `tryAcquireConversationLock`, send throttles, or retry/backoff (LAT-D3).
- **DO NOT** add a user-visible message, ack, or indicator — that is p2 and it is gated (LAT-D2).
- **DO NOT** reinstate the greeting fast path (LAT-D6).
- **DO NOT** add a migration. If `lat-03` seems to need one, stop and re-scope.
- **DO NOT** log message text in any new timing line (LAT-D7).

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lat-01` | Harness timing readout + recorded baseline | S | Sonnet |
| `lat-02` | Intent classification onto a mini model tier | M | Sonnet |
| `lat-03` | Stop the guaranteed-failing Graph host hop | S | Sonnet |
| `lat-04` | Parallelize independent pre-send reads | M | **Opus** |
| `lat-05` | `AI_MAX_HISTORY_PAIRS` size vs latency | S | Sonnet |
| `lat-06` | Close gate p1 | S | Composer / Founder |

---

## Acceptance gate

- [ ] Job total for a greeting turn **≤ 5 s** (from 10.6 s), measured with `lat-01`'s readout on the same scenario.
- [ ] `intentMs` **≤ 700 ms** p50.
- [ ] `igSendMs` **≤ 1.1 s** p50, and no `Page token invalid for graph.facebook.com` line on the happy path.
- [ ] Non-LLM pre-send time (`handlerPreSendMs` − LLM segments) **≤ 1.2 s**.
- [ ] Intent labels unchanged vs the flagship on the `lat-02` fixture set.
- [ ] Reply text for the four language scenarios is unchanged in meaning and language (`npm run test:dm-language` still passes 4/4).
- [ ] Typecheck + lint + backend suite green.

---

**Created:** 2026-08-02.
