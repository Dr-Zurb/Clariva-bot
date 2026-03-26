# Task RBH-18: Intent classification JSON — topics & pricing signal (reduce regex surface)

## 2026-03-28 — Let the model detect “asking money / fees” in any language

---

## 📋 Task Overview

**Problem:** `isPricingInquiryMessage` and similar helpers grow **`PRICING_KEYWORDS`** / locale regex over time. That **cannot scale** to “all human language.” Users type **infinite** paraphrases (“paisa kitna lagta hai”, “charges for call doctor”, etc.).

**Goal:** Extend **`classifyIntent`** output from flat `{ intent, confidence }` to a small **structured** payload, e.g.:

```json
{
  "intent": "ask_question",
  "confidence": 0.92,
  "topics": ["pricing"],
  "is_fee_question": true
}
```

The **webhook “Decide” layer** then treats **`is_fee_question` OR `topics` includes `pricing`** like today’s keyword path: **run `buildFeeQuoteDm`** (or prepend fee block in hybrid mode — RBH-19), **without** maintaining exhaustive word lists.

**Fallback:** Keep a **minimal** regex as safety net when OpenAI unavailable (optional env flag).

**Estimated Time:** 3–5 days  
**Status:** ✅ **DONE** (2026-03-28) — schema, prompt, cache bump, webhook + generateResponse, audit metadata  
**Change Type:**
- [x] **Update existing** — `classifyIntent` prompt + parsing; cache key includes structured hash; webhook consumers

**Scope Guard:**
- Intent JSON must stay **small**; no free-form PHI.
- **Intent cache:** Invalidate or key on `(redactedText + contextFingerprint + promptVersion)` when schema changes.

---

## ✅ Task Breakdown

### 1. Schema design
- [x] 1.1 Add TypeScript type `IntentDetectionResultExtended` in `backend/src/types/ai.ts` (or extend existing) with optional:
  - `topics?: ('pricing' | 'hours' | 'location' | 'booking_howto')[]`
  - `is_fee_question?: boolean` (redundant with topics but useful for metrics)
- [x] 1.2 Migration: default missing fields → current behavior (no breaking change).

### 2. Prompt & parsing
- [x] 2.1 Update classifier `SYSTEM_PROMPT` in `ai-service.ts`: *“If the user is asking cost, fees, charges, money, payment, insurance, — in ANY language — set `is_fee_question: true` and include `pricing` in `topics`.”*
- [x] 2.2 Parse JSON robustly; on parse failure fall back to legacy intent only.
- [x] 2.3 Unit tests: Hindi, Hinglish, English, mixed messages → `is_fee_question` true without adding new regex.

### 3. Webhook integration
- [x] 3.1 Replace or **OR** `isPricingInquiryMessage(text)` with **`intentResult.is_fee_question || topics?.includes('pricing')`** for:
  - Fee quote branch
  - Post-classify policy (RBH-14) cues
  - `pricingFocusHint` in `generateResponse` (could key off same signal eventually)
- [x] 3.2 **Mid-collection:** If `inCollection && is_fee_question`, prefer **RBH-19** hybrid (fee block + continue collection) OR deterministic fee-only message; document choice. → **Implemented:** `buildFeeQuoteDm` + footer; step unchanged (RBH-19 can refine copy/composer).

### 4. Observability
- [x] 4.1 Audit log metadata: `topics`, `is_fee_question` (no PHI).

### 5. Deprecation path
- [x] 5.1 After soak: trim `PRICING_KEYWORDS` to **fallback only**; comment in `consultation-fees.ts`. *(Comment added; keywords kept as fallback inside `intentSignalsFeeOrPricing`.)*

---

## 📁 Files to Create/Update

```
backend/src/types/ai.ts
backend/src/services/ai-service.ts
backend/src/workers/instagram-dm-webhook-handler.ts
backend/tests/unit/services/ai-service.test.ts (or intent-routing-policy)
backend/src/utils/consultation-fees.ts (comments / thin fallback)
```

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y (classification metadata)
- [x] **PHI in logs?** N
- [x] **External API?** Y — OpenAI classifier

---

## 🔗 Related Tasks

- **RBH-17** — architecture framing
- **RBH-19** — how fee block is composed with AI
- **RBH-13** — fee formatting utilities (reuse)

---

**Last Updated:** 2026-03-28
