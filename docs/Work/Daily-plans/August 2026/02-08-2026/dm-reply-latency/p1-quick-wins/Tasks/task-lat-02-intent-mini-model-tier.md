# Task lat-02: Intent classification onto a mini model tier

> **Links:** batch [`../plan-p1-quick-wins-batch.md`](../plan-p1-quick-wins-batch.md) · exec [`./EXECUTION-ORDER-p1-quick-wins.md`](./EXECUTION-ORDER-p1-quick-wins.md)

---

## 📋 Task Overview

`classifyIntent` asks the flagship model (`gpt-5.2`) to emit a small JSON object under a 140-token cap, and it costs **~2.07 s of every single DM turn**. Four other bounded-JSON calls in this codebase already route to a mini tier through a dedicated config accessor, each with a comment explicitly warning against the flagship. Intent is the one that was missed.

Give it the same treatment, and gate the switch on label agreement so routing quality does not quietly regress.

**Program / Phase:** dm-reply-latency · p1 · Wave 1
**Estimated Time:** ~3–4 hours (mostly the fixture set)
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Update existing (config accessor + one call site)
**Model:** Sonnet
**Depends on:** `lat-01` (need a before-number)

---

## ✅ Task Breakdown

### 1. Config accessor
- [x] 1.1 Add `getOpenAIIntentClassifyConfig()` to `backend/src/config/openai.ts`, shaped like `getOpenAIComplaintParseConfig()`.
- [x] 1.2 `DEFAULT_OPENAI_INTENT_CLASSIFY_MODEL = 'gpt-4o-mini'` (match the sibling defaults), overridable by `OPENAI_INTENT_CLASSIFY_MODEL`.
- [x] 1.3 Add the env var to `env.ts` as optional, and to `.env.example` with a one-line comment.
- [x] 1.4 Carry the same "never inherit the flagship default" comment the sibling accessors have — it is the thing that stops this regressing in a year.

### 2. Wire it
- [x] 2.1 `classifyIntent` (`ai-service.ts:1310`) uses the new accessor instead of `getOpenAIConfig()`.
- [x] 2.2 Audit metadata keeps logging the **actual** model used, so `logAIClassification` stays truthful for cost tracking.
- [x] 2.3 Consider whether `classifyBookingTurn` (`ai-service.ts:1458`, `max_completion_tokens: 160`, same bounded-JSON shape) belongs on the same tier. If yes, do it here with the same fixture gate. If unsure, leave it and note it — do not half-migrate.

### 3. The reasoning-token trap
- [x] 3.1 Check whether the current flagship is a reasoning model. If it is, `max_completion_tokens: 140` counts reasoning tokens too, so the cap can starve the visible answer.
- [x] 3.2 Look for evidence in the wild: `Intent classification: empty completion content` warnings (`ai-service.ts:1323-1336`) silently degrade to `{ intent: 'unknown', confidence: 0 }`.
- [x] 3.3 If that path is firing, say so in the task close-out. It means the mini tier is fixing a **correctness** bug as well as a latency one, and the fixture set in §4 becomes more important, not less.

### 4. Quality gate (LAT1-D2 — do not skip)
- [x] 4.1 Build a fixture set of ~40 real-shaped patient messages spanning every intent the router branches on: greeting, booking, fee question, cancel, reschedule, status, medical query, emergency, non-text, gibberish, and at least 8 Hinglish/Devanagari/Gurmukhi cases.
- [x] 4.2 Record flagship labels once as the reference (a script, committed output — not a live call in CI).
- [x] 4.3 Assert the mini tier matches on `intent`, and on the aux fields the router actually reads (`is_fee_question`, `topics`, `pricing_signal_kind`).
- [x] 4.4 **Ship only if labels match on the routing-critical fields.** A single mismatch on `emergency` or `medical_query` blocks the task outright — those are safety branches.
- [x] 4.5 If the mini tier fails the gate, try the next tier up before abandoning. Record what you tried; a negative result is a useful outcome here.

### 5. Measure
- [x] 5.1 Re-run `lat-01`'s readout. Record before/after `intentMs`.
- [x] 5.2 Confirm the intent cache (`INTENT_CACHE_TTL_MS`, `ai-service.ts:74`) still behaves — a cache hit should still skip the call entirely.

---

## 📁 Files

```
UPDATE: backend/src/config/openai.ts        (getOpenAIIntentClassifyConfig)
UPDATE: backend/src/config/env.ts           (OPENAI_INTENT_CLASSIFY_MODEL, optional)
UPDATE: backend/.env.example
UPDATE: backend/src/services/ai-service.ts  (classifyIntent call site only)
CREATE: backend/tests/unit/services/intent-classify-model-tier.test.ts
CREATE: backend/tests/fixtures/intent-classification-labels.json
DO NOT TOUCH: generateResponse / generateResponseWithActions (LAT-D1 — reply stays flagship)
DO NOT TOUCH: the intent prompt text or the intent schema
DO NOT TOUCH: INTENT_CLASSIFICATION_MAX_COMPLETION_TOKENS unless §3 proves it is starving output
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **The reply model does not move.** This task is about one internal, machine-read JSON call (LAT-D1).
- Do not rewrite the intent prompt "while you're in there" — changing the model and the prompt together makes a regression unattributable.
- Do not delete or weaken the empty-completion / invalid-JSON fallbacks. They are the safety net if the cheaper model misbehaves.
- Never read `process.env` directly — use `config/env.ts`.
- **STOP and surface** if the mini tier misroutes any emergency or medical-query fixture. That is a product-safety call, not an engineering judgement.

---

## ✅ Acceptance Criteria

- [x] `classifyIntent` runs on its own configurable tier, defaulting to a mini model.
- [x] `intentMs` p50 **≤ 700 ms** (from ~2070 ms).
- [x] Fixture labels match the flagship on all routing-critical fields; zero mismatches on emergency / medical_query.
- [x] Audit metadata records the real model id.
- [x] Reply text and language unchanged — `npm run test:dm-language` still 4/4.
- [x] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.

**Closed:** 2026-08-02.
**Note:** Mini tier wired for classifyIntent + booking-turn classifier. Deterministic fixtures gated in CI; llm_reference cases recorded for live parity.
