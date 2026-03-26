# Task RBH-12: DM latency — faster first & follow-up replies

## 2026-03-28 — Receptionist bot product quality

---

## 📋 Task Overview

**Problem:** First (and often consecutive) bot replies feel **slow**; users may abandon before a response. Today each DM typically pays for **sequential** work: BullMQ worker + **OpenAI `classifyIntent`** + **OpenAI `generateResponse`** (and sometimes extraction), plus DB and Instagram send.

**Goal:** Reduce perceived and actual time-to-reply **without** breaking idempotency, locks, or PHI rules.

**Estimated Time:** 1–3 days (depends on approach: tuning vs architectural)  
**Status:** ✅ **Phase 1 done (engineering)** — metrics + intent token cap + greeting fast path shipped **2026-03-28**. Remaining rows are **ops / optional / not started** (see legend below).  
**Completed (phase 1):** 2026-03-28  

**Change Type:**
- [x] **Update existing** — `ai-service.ts`, `instagram-dm-webhook-handler.ts`, `webhook-metrics.ts`, `OBSERVABILITY.md`

**Current State:**
- ✅ **Shipped (2026-03-28):** Pipeline timing log `webhook_instagram_dm_pipeline_timing` (`intentMs`, `generateMs`, `igSendMs`, `handlerPreSendMs`, `greetingFastPath`, `throttleSkipped`). Intent classification uses **`max_completion_tokens: 120`** (was full DM budget). **Greeting fast path** for idle conversations skips **`generateResponse`** (second OpenAI call).
- ⏳ **Remaining (see unchecked rows):** staging p95 doc (1.2); optional history tuning (2.3); typing/merged LLM (§3); Render/Redis tuning (4.1); manual latency sign-off (5.1).
- ⚠️ **Notes:** Any instant user-visible message must respect **duplicate/race** behaviour (Instagram + idempotency).

**Scope Guard:**
- Do not log raw message bodies; do not weaken webhook locks.

**Reference:**
- [RECEPTIONIST_BOT_ENGINEERING.md](../RECEPTIONIST_BOT_ENGINEERING.md) §2.2
- [MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md](../MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md) §8
- Code: `backend/src/services/ai-service.ts` (`classifyIntent`, `generateResponse`), `backend/src/workers/instagram-dm-webhook-handler.ts`

---

## Checkbox legend

| Symbol | Meaning |
|--------|--------|
| **[x]** | Done in code/docs/tests in this repo. |
| **[ ]** | **Not done** — left open on purpose until someone does that work (see reason in each row). |

**Why some boxes stay empty:** RBH-12 mixed **shipping instrumentation + quick wins** (done) with **operational baselines**, **optional product/UX**, and **infra** that were never part of the first PR—or need you/your team to run them (e.g. staging p95, manual “feels fast” sign-off).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Measure & baseline
- [x] 1.1 Add lightweight timing metrics (or structured logs): `intent_ms`, `generate_ms`, `ig_send_ms` (metadata only — no PHI). (`handlerPreSendMs` = wall time to pre-send.)
- [ ] **1.2 Ops / backlog** — Document baseline on staging (p50/p95) for cold vs warm. *(Requires running traffic on staging/prod and aggregating logs for `webhook_instagram_dm_pipeline_timing` — not something the codebase can “tick” by itself.)*

### 2. Low-risk wins
- [x] 2.1 Expand **deterministic fast paths** — **greeting** when `!inCollection` and step idle (`responded` / unset) skips `generateResponse`.
- [x] 2.2 Tune OpenAI: lower **`max_completion_tokens`** for **intent** classification only (120).
- [ ] **2.3 Optional** — Review `AI_MAX_HISTORY_PAIRS` / prompt size trade-offs (`env.ts`). *(No change made yet; do when you want to trade context vs latency.)*

### 3. Product / UX (optional — not implemented)
- [ ] **3.1 Backlog** — **Typing indicator** or **single short ack** (“One moment…”) — gated by feature flag; must not double-send on retries.
- [ ] **3.2 Backlog** — **Single combined** LLM call for intent+narrow reply where safe (design + tests).

### 4. Infra (not implemented)
- [ ] **4.1 Ops / backlog** — Worker concurrency / instance warmth (Render); Redis latency sanity check. *(Environment tuning, not committed as code in RBH-12 phase 1.)*

### 5. Verification
- [ ] **5.1 Manual QA** — Re-run [manual checklist](../MANUAL_TEST_CHECKLIST_INSTAGRAM_BOT.md); define a target (e.g. “p95 `handlerPreSendMs` &lt; X ms” or subjective “first reply &lt; Y s”). *(Needs human sign-off / product threshold.)*
- [x] 5.2 Unit/characterization tests — webhook mocks updated (`recordInstagramLastDmSuccess`, `logWebhookInstagramDmPipelineTiming`).

---

## 📁 Files to Create/Update (expected)

```
backend/src/services/ai-service.ts
backend/src/services/webhook-metrics.ts
backend/src/workers/instagram-dm-webhook-handler.ts
docs/Reference/OBSERVABILITY.md
backend/tests/unit/services/webhook-metrics.test.ts
backend/tests/unit/workers/webhook-worker.test.ts
backend/tests/unit/workers/webhook-worker-characterization.test.ts
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N — metadata-only logs
- [x] **Any PHI in logs?** N
- [x] **External API?** Y (OpenAI) — same compliance as today

---

## 🔗 Related Tasks

- **RBH-14** (context-aware intent) — may reduce wrong-branch LLM work.
- **RBH-02** — characterization tests.

---

**Last Updated:** 2026-03-28 — legend + why unchecked rows stay open  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
