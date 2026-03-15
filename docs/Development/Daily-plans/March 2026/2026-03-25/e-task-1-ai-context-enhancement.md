# Task 1: AI Context Enhancement
## 2026-03-25

---

## 📋 Task Overview

Pass richer context to `generateResponse` so the AI can produce context-aware replies. Currently the AI receives step, intent, and collectedFields. Add: collected values (redacted), missing fields, last bot message, relation (when booking for someone else), and booking-for-someone-else flag.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-25

**Change Type:**
- [x] **Update existing** — ai-service, webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `GenerateResponseInput` (conversationId, currentIntent, state, recentMessages, currentUserMessage, correlationId, doctorContext); `buildResponseSystemPrompt`; step/collectedFields hints in system prompt
- ❌ **What's missing:** Collected values (redacted), missing fields list, last bot message, relation, bookingForSomeoneElse in context
- ⚠️ **Notes:** No PHI in prompts; use redacted/labels only for collected values

**Scope Guard:**
- Expected files touched: ≤ 3 (ai-service, types, webhook-worker)

**Reference Documentation:**
- [BOT_INTELLIGENCE_PLANNING.md](../../../Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) — No PHI in logs/prompts

---

## ✅ Task Breakdown (Hierarchical)

### 1. Extend GenerateResponseInput

- [x] 1.1 Add optional fields to input (or extend DoctorContext / new Context type)
  - [x] 1.1.1 `collectedDataSummary?: string` — Redacted summary, e.g. "name: [provided], phone: [provided], age: [missing], reason: [missing]"
  - [x] 1.1.2 `missingFields?: string[]` — e.g. ["age", "reason_for_visit"]
  - [x] 1.1.3 `lastBotMessage?: string` — Last assistant message (redacted if contains PHI)
  - [x] 1.1.4 `relation?: string` — When booking for someone else, e.g. "sister", "mother"
  - [x] 1.1.5 `bookingForSomeoneElse?: boolean`
- [x] 1.2 Ensure no PHI in any new context fields

### 2. Webhook Worker — Pass Context

- [x] 2.1 When calling `generateResponse`, compute and pass new context
  - [x] 2.1.1 Get collected data from `getCollectedData`; build redacted summary (field names + "provided" or "missing")
  - [x] 2.1.2 Compute missingFields from REQUIRED_COLLECTION_FIELDS vs collectedFields
  - [x] 2.1.3 Get last bot message from recentMessages (sender_type !== 'patient')
  - [x] 2.1.4 Extract relation from state or recent user message when bookingForSomeoneElse
- [x] 2.2 Pass to generateResponse in all call sites

### 3. AI Service — Use Context in Prompt

- [x] 3.1 In `buildResponseSystemPrompt` or prompt builder, inject new context
  - [x] 3.1.1 Add collectedDataSummary to system content when in collection/confirm/consent
  - [x] 3.1.2 Add missingFields when relevant
  - [x] 3.1.3 Add lastBotMessage so AI knows what was asked
  - [x] 3.1.4 Add relation + bookingForSomeoneElse when applicable

### 4. Verification & Testing

- [x] 4.1 Run type-check
- [ ] 4.2 Manual test: booking for sister, say "my sister?" — verify AI receives relation
- [ ] 4.3 Verify no PHI in prompts (audit log / redaction)

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── ai-service.ts          (UPDATED - GenerateResponseInput, prompt builder)
└── workers/
    └── webhook-worker.ts      (UPDATED - pass context to generateResponse)
```

**Existing Code Status:**
- ✅ `ai-service.ts` — Has GenerateResponseInput, buildResponseSystemPrompt, step/collected hints
- ✅ `webhook-worker.ts` — Calls generateResponse in multiple branches

---

## 🧠 Design Constraints

- No PHI in prompts (COMPLIANCE.md); use "provided"/"missing" or redacted placeholders
- Service layer must not import Express types (ARCHITECTURE.md)
- Keep prompt size reasonable; avoid token explosion

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N – no DB change)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] generateResponse receives collectedDataSummary, missingFields, lastBotMessage, relation when applicable
- [x] AI prompt includes new context in system message
- [x] No PHI in any prompt content
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-2: AI prompt improvements](./e-task-2-ai-prompt-improvements.md) — Uses this context
- [e-task-3: Route ambiguous messages to AI](./e-task-3-route-ambiguous-to-ai.md) — Uses this context

---

**Last Updated:** 2026-03-25  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
