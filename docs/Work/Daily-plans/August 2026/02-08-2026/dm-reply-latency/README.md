# DM reply latency

> A patient sends a DM and waits **~12 seconds** for the first word back. Half of that is avoidable without touching reply quality: a flagship model doing a tiny JSON classification, a Graph API call that is guaranteed to fail before the real one, and DB reads that queue up behind each other for no reason.

**Task prefix:** `lat`
**Depends on:** existing DM pipeline (`webhook-controller` → BullMQ → `instagram-dm-webhook-handler` → `run-conversation-turn`). No new channel work, no schema change in p1.

---

## The measurement

Local dev, `hey hallo` on a fresh conversation — the cheapest possible turn (greeting, no booking state, no extraction):

```
Webhook accept + enqueue     1411 ms   (includes one-time BullMQ connect)
classifyIntent   (LLM #1)    2070 ms
generateResponse (LLM #2)    3178 ms
other pre-send work          ~2241 ms  (handlerPreSendMs 7489 − both LLM calls)
igSendMs                     1924 ms
post-send bookkeeping        ~1214 ms  (job durationMs 10627 − pre-send − send)
─────────────────────────────────────
job total                    10627 ms
```

Source: `webhook_instagram_dm_pipeline_timing` (RBH-12) + `webhook_job_worker_success` on 2026-08-02.

### What the numbers say

1. **Intent classification runs on the flagship.** `getOpenAIConfig()` returns `OPENAI_MODEL` (`gpt-5.2`), and `classifyIntent` passes it straight through (`ai-service.ts:1310-1313`) for a `max_completion_tokens: 140` bounded-JSON answer. The codebase already tiers *four* other bounded-JSON calls onto `gpt-4o-mini` (complaint parse, diagnosis resolve, investigation resolve, medicine parse) with comments saying "never route this through the flagship". Intent is the one that never got it.
2. **Every send pays for a call that cannot succeed.** `sendMessageAPI` posts to `graph.facebook.com` first, takes error code 190, then retries `graph.instagram.com` (`instagram-service.ts:853-875`). Instagram-Login tokens will never work on the Facebook host, so this failure is deterministic, not occasional.
3. **Pre-send DB work is sequential.** `resolvePatientForChannelSender` → `findConversationByPlatformId` → `maybeLinkCommentLeadAfterDm` → `loadReturningPatientProfile` → `getConversationState` → `getRecentMessages` → `getDoctorSettings` each await the previous one, though several are independent. The profile-enrichment block at `run-conversation-turn.ts:351-389` already shows the fire-and-forget pattern.
4. **Nothing tells the patient anything is happening.** No typing indicator, no read receipt. Twelve seconds of silence reads as "broken", not "thinking".

---

## Execute in order

| Phase | Folder | Theme | Status |
|-------|--------|-------|--------|
| **p1** | [`p1-quick-wins/`](./p1-quick-wins/) | Model tier, dead Graph hop, sequential reads, history size. **No behavior change, no quality trade.** | 🟡 lat-01…05 eng done; `lat-06` gate needs real-IG segments |
| **p2** | [`p2-perceived-latency/`](./p2-perceived-latency/) | Typing indicator so the thread looks alive in ~1s. | 🔒 Blocked on p1 numbers |
| **p3** | [`p3-single-llm-turn/`](./p3-single-llm-turn/) | Collapse two sequential LLM round trips into one. The last big chunk, and the only risky one. | 🔒 Blocked on p1 numbers |

p1 alone should roughly halve the wait. Do it first and re-measure before committing to p2/p3 — the ranking below may change once the cheap wins land.

---

## Decision lock (program-level)

| ID | Decision | Rationale |
|----|----------|-----------|
| **LAT-D1** | **Never trade patient-facing reply quality for speed.** The reply stays on the flagship model. Only bounded, internal, machine-read outputs (intent JSON) may move to a cheaper tier. | The reply is the product. A faster worse answer is a regression, not a win. |
| **LAT-D2** | **No interim "please wait" message bubble.** Perceived-latency work uses a typing indicator only. | Already assessed and deferred: two bubbles fight dedupe, throttles, and the conversation lock. See [`deferred-instagram-dm-interim-please-wait-2026-04.md`](../../../../capture/features/messaging-bot/deferred-instagram-dm-interim-please-wait-2026-04.md). |
| **LAT-D3** | **Idempotency, conversation locks, send throttles, and retry/backoff are untouchable.** No latency change may weaken them. | These are the load-bearing correctness guarantees of the webhook path. Duplicate DMs to a patient are worse than a slow DM. |
| **LAT-D4** | **Measure before and after, every task, with the existing metric.** `webhook_instagram_dm_pipeline_timing` is the scoreboard; no task closes on "feels faster". | RBH-12 already shipped the instrumentation. Using it is free. |
| **LAT-D5** | **Targets:** p1 → job total **≤ 5 s**. p2 → first visible signal **≤ 1.5 s**. p3 → job total **≤ 3.5 s**. | Concrete numbers so a gate can pass or fail. Revisable once real traffic data exists. |
| **LAT-D6** | **The greeting fast path stays removed.** No reinstating a hardcoded greeting to dodge an LLM call. | Deliberately removed by [`task-02-greeting-via-llm`](../../../April%202026/14-04-2026/task-02-greeting-via-llm.md); `greetingFastPath` is hard-`false` at `run-conversation-turn.ts:284`. Undoing it would re-break greeting quality. |
| **LAT-D7** | **Timing logs carry metadata only** — durations, model ids, correlation ids. Never message text, never PHI. | `.cursor/rules/00-agent-contract.mdc`; unchanged from RBH-12. |
| **LAT-D8** | **No new external dependency and no infra change in p1.** Render/Redis tuning stays an ops item. | Keeps p1 shippable in one reviewable PR. |

---

## Task index

| Task | Phase | Title | Model |
|------|-------|-------|-------|
| lat-01 | p1 | Harness timing readout + recorded baseline | Sonnet |
| lat-02 | p1 | Intent classification onto a mini model tier | Sonnet |
| lat-03 | p1 | Stop the guaranteed-failing Graph host hop | Sonnet |
| lat-04 | p1 | Parallelize independent pre-send reads | **Opus** |
| lat-05 | p1 | `AI_MAX_HISTORY_PAIRS` size vs latency | Sonnet |
| lat-06 | p1 | Close gate p1 | Composer / Founder |
| lat-07 | p2 | Typing indicator (`sender_action`) | Sonnet |
| lat-08 | p2 | Close gate p2 | Composer / Founder |
| lat-09 | p3 | Design spike — merged call vs speculative parallel | **Opus** |
| lat-10 | p3 | Implement the chosen approach | **Opus** |
| lat-11 | p3 | Close gate p3 | Composer / Founder |

---

## Scope / risk

Per [`.cursor/rules/00-agent-contract.mdc`](../../../../../../.cursor/rules/00-agent-contract.mdc): `lat-04` reorders the spine of `run-conversation-turn.ts`, and `lat-09`/`lat-10` restructure how the receptionist thinks — all three are **Opus**. `lat-02`, `lat-03`, `lat-05`, `lat-07` are contained single-concern changes.

No PHI columns, no RLS change, no payments or consent logic. `lat-03` is expected to need **no migration** — if it turns out to need a persisted column, stop and re-scope it as Opus.

Prior art: [`RBH-12 — DM latency`](../../../March%202026/2026-03-25/Receptionist%20Bot%20improvements/Tasks/e-task-rbh-12-dm-latency-faster-replies.md) shipped the metrics, the 140-token intent cap, and a greeting fast path that has since been removed. Its §2.3 (history tuning), §3.1 (typing/ack), §3.2 (merged call), and §4.1 (infra) rows are still open — this program picks up exactly those.

---

**Created:** 2026-08-02.
**Status:** p1 eng mostly done (lat-01…05). Harness e2e p50 6857→4874. Real-IG segment re-measure still open for lat-06.
**One-liner:** Stop paying flagship prices for a yes/no, stop calling an endpoint that always fails, and stop waiting on reads that could run together.
