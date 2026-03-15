# Task 2: Conversation-Aware Extraction
## 2026-03-26 — AI Receptionist Initiative

---

## 📋 Task Overview

Enrich AI extraction with full conversation context: recent exchange (last 2–3 turns), what we already have, and what we're asking for. This lets the AI understand "we're in the middle of collecting for the father; user is clarifying gender" and extract accordingly.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-15

**Change Type:**
- [x] **Update existing** — ai-service, collection-service; follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** extractFieldsWithAI with lastBotMessage, missingFields (after e-task-1)
- ❌ **What's missing:** Recent conversation turns; collected-data summary (redacted); relation/booking-for-someone-else
- ⚠️ **Notes:** AI gets single message + last ask; needs more context for multi-turn disambiguation

**Scope Guard:**
- Expected files touched: ≤ 4 (ai-service, collection-service, types)

**Reference Documentation:**
- [AI_RECEPTIONIST_PLAN.md](../../AI_RECEPTIONIST_PLAN.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)
- [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define Extraction Context Type

- [x] 1.1 Create ExtractionContext interface in ai-service
  - [x] 1.1.1 lastBotMessage, missingFields, collectedSummary, relation, recentTurns
  - [x] 1.1.2 recentTurns: { role: 'user'|'assistant'; content: string }[] (redacted)
- [x] 1.2 No PHI in context: use "provided"/"missing" only, not actual values

### 2. Pass Conversation Context to AI

- [x] 2.1 Update extractFieldsWithAI to accept context (4th param)
  - [x] 2.1.1 context includes lastBotMessage, collectedSummary, relation, recentTurns
- [x] 2.2 Build context in collection-service from state + options.recentMessages
  - [x] 2.2.1 collectedSummary from state.collectedFields
  - [x] 2.2.2 recentTurns: last 6 messages from recentMessages, redacted
  - [x] 2.2.3 relation from state.relation when bookingForSomeoneElse

### 3. Update Extraction Prompt for Context

- [x] 3.1 User prompt includes: "We have: [collectedSummary]. Still need: [missingFields]."
- [x] 3.2 "Last thing we asked: [lastBotMessage]"
- [x] 3.3 "Booking for user's [relation]" when applicable
- [x] 3.4 "Recent exchange: ..." (last 2–3 turns, redacted)
- [x] 3.5 "Extract only fields relevant to what we asked."

### 4. Wire Context from Webhook

- [x] 4.1 ValidateAndApplyExtractedOptions.recentMessages
- [x] 4.2 Webhook passes recentMessages to all 3 validateAndApplyExtracted call sites

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Manual test: multi-turn "book for father" → "he is my father he is male" → only gender extracted
- [ ] 5.3 Verify context in prompt has no PHI

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── ai-service.ts           (UPDATED - extractFieldsWithAI context param, prompt)
│   └── collection-service.ts   (UPDATED - build ExtractionContext, pass to AI)
├── workers/
│   └── webhook-worker.ts       (UPDATED - pass recentMessages to validateAndApplyExtracted)
└── types/
    └── ai.ts or conversation.ts (ExtractionContext)
```

**Existing Code Status:**
- ✅ `ai-service.ts` — extractFieldsWithAI
- ✅ `collection-service.ts` — validateAndApplyExtracted
- ✅ `webhook-worker.ts` — getRecentMessages, validateAndApplyExtracted

---

## 🧠 Design Constraints

- No PHI in context (COMPLIANCE.md)
- Keep prompt size bounded (recent turns = 2–3 pairs max)
- Relation/booking-for-someone-else helps AI use "your father" etc.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y)
  - [ ] **Consent + redaction confirmed?** (Y)

---

## ✅ Acceptance & Verification Criteria

- [ ] AI receives collectedSummary, lastBotMessage, relation
- [ ] Multi-turn extraction correctly interprets "he is my father he is male" as gender only
- [ ] No PHI in prompts
- [ ] Type-check passes

---

## 🔗 Related Tasks

- [e-task-1: AI-first extraction](./ai-receptionist-e-task-1-ai-first-extraction.md) — Prerequisite
- [e-task-3: Human-like responses](./ai-receptionist-e-task-3-human-like-responses.md) — Complementary

---

**Last Updated:** 2026-03-26  
**Reference:** [TASK_TEMPLATE.md](../../TASK_TEMPLATE.md)
