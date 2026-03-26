# Task RBH-19: Hybrid DM reply composer — server-owned blocks + optional AI phrasing



## 2026-03-28 — Correct data every time; natural language only where safe



---



## 📋 Task Overview



**Problem:** A **single** `generateResponse` call asks the model to both **remember** `AUTHORITATIVE FEES` and **produce** fluent Hinglish. Models sometimes **omit** or **soften** numbers, or merge them with apologies. Industry pattern: **compose** the reply from **immutable server segments** + **short** model-generated bridge.



**Goal:** Introduce a **composer** API (name TBD), e.g.:



```ts

composeInstagramDmReply({

  segments: [

    { kind: 'fee_quote', payload: formatConsultationFeesForDm(...) },

    { kind: 'booking_cta', payload: formatFeeBookingCtaForDm(...) },

    // OR { kind: 'ai_paraphrase', instruction: 'Acknowledge headache; stay in Hinglish; 2 sentences max' }

  ],

  state,

  userText,

})

```



**Phase 1 (recommended):** **Deterministic glue** only — concatenate fee block + CTA + one fixed localized line (“Aap booking details bhejna continue karein”) without second LLM call.  

**Phase 2:** Optional **short** completion that **must not** repeat fee numbers (instruction: “Do not restate amounts; reference ‘details above’ only”).



**Estimated Time:** 4–6 days (Phase 1: 1–2 days)  

**Status:** ✅ **DONE** (2026-03-28)  

**Change Type:**

- [x] **New helper module** (e.g. `backend/src/utils/dm-reply-composer.ts`)

- [x] **Update existing** — webhook calls composer for fee + mid-collection pricing



**Implemented API (actual):** `composeDmReplySegments`, `composeIdleFeeQuoteDm`, `composeMidCollectionFeeQuoteDm`, `appendOptionalDmReplyBridge` (`ai-service.ts`), env `AI_DM_REPLY_BRIDGE_ENABLED`.



---



## ✅ Task Breakdown



### 1. Design

- [x] 1.1 Define `DmSegment` union — **shipped:** `fee_body` | `booking_cta` | `mid_collection_continue` | `markdown` (safety/booking_link/slot_hint remain other code paths).

- [x] 1.2 Rules: **URLs and ₹ amounts** only appear in **non-AI** segments unless explicitly escaped (never).



### 2. Phase 1 — Composer without extra LLM

- [x] 2.1 Implement idle + mid-collection composers — **shipped:** `composeIdleFeeQuoteDm`, `composeMidCollectionFeeQuoteDm` (+ `feeQuoteSettingsFromDoctorRow`).

- [x] 2.2 Use when `inCollection && (pricing intent from RBH-18)` — **shipped:** `instagram-dm-webhook-handler.ts` uses `composeMidCollectionFeeQuoteDm` + `collectedFields`; idle paths use `composeIdleFeeQuoteDm`.



### 3. Phase 2 — Optional bridge LLM

- [x] 2.3 **`appendOptionalDmReplyBridge`** — **max_completion_tokens 120**, system prompt forbids prices/URLs/digits-as-fees; PHI redacted.

- [x] 2.4 Feature flag: **`AI_DM_REPLY_BRIDGE_ENABLED`** in `backend/src/config/env.ts`.



### 4. Tests

- [x] 2.5 Unit tests: `backend/tests/unit/utils/dm-reply-composer.test.ts` — exact **₹** from fixture; localized footers. *(Bridge output digit guard = prompt + audit; optional future: post-filter or contract test with mocked OpenAI.)*



### 5. Rollout

- [ ] 2.6 Manual checklist: Instagram DM mid-booking “kitne paise” → fee block + same step state. *(Owner: QA / staging.)*



---



## 📁 Files to Create/Update



```

backend/src/utils/dm-reply-composer.ts (new)

backend/src/workers/instagram-dm-webhook-handler.ts

backend/tests/unit/utils/dm-reply-composer.test.ts

backend/src/services/ai-service.ts (optional bridge)

backend/src/config/env.ts (AI_DM_REPLY_BRIDGE_ENABLED)

```



---



## 🌍 Global Safety Gate



- [x] **Data touched?** Y (reply shape)

- [x] **PHI in logs?** N

- [x] **External API?** Y (Phase 2 only)



---



## 🔗 Related Tasks



- **RBH-18** — reliable `is_fee_question` without regex explosion

- **RBH-13** — fee formatters

- **RBH-12** — latency (Phase 2 adds call — gate behind flag)



---



**Last Updated:** 2026-03-28

