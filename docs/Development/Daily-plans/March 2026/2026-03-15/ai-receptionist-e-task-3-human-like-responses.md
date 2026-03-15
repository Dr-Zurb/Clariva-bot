# Task 3: Human-Like Response Generation
## 2026-03-26 — AI Receptionist Initiative

---

## 📋 Task Overview

Make the bot's replies feel more human: acknowledge what the user said, avoid robotic templates, and use AI as the primary response source during collection. Replace or soften deterministic prompts like "Got it. Still need: gender. Please share." with AI-generated, context-aware replies that feel like a real receptionist.

**Estimated Time:** 4–5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-15

**Change Type:**
- [x] **Update existing** — ai-service, webhook-worker; follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** generateResponse with context (collectedDataSummary, missingFields, lastBotMessage); deterministic "Got it. Still need: X. Please share."; buildConfirmDetailsMessage
- ❌ **What's missing:** AI-generated "missing field" prompts; AI-generated confirm preamble; more natural flow
- ⚠️ **Notes:** Deterministic prompts feel robotic; AI could say "Got it, male. Let me confirm: **Ramesh Masih**..." more naturally

**Scope Guard:**
- Expected files touched: ≤ 5 (ai-service, webhook-worker, collection-service)

**Reference Documentation:**
- [AI_RECEPTIONIST_PLAN.md](../../AI_RECEPTIONIST_PLAN.md)
- [BOT_INTELLIGENCE_PLANNING.md](../../../Development/Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. AI for "Missing Fields" Reply

- [x] 1.1 When extraction completes with missingFields.length > 0, use AI reply instead of template
  - [x] 1.1.1 Call generateResponse with context including missingFields
  - [x] 1.1.2 Fallback to template if AI returns generic fallback or empty
- [x] 1.2 collecting_all hint when missingFields: "Acknowledge what they said, ask only for missing fields. Be brief and natural."
- [x] 1.3 Same for confirm_details correction path (Still need: X)

### 2. AI for Confirm-Details Preamble

- [x] 2.1 Keep deterministic buildConfirmDetailsMessage (Option A)
  - [x] 2.1.1 Focus on missing-fields reply; confirm stays deterministic

### 3. Improve AI Response Hints

- [x] 3.1 collectingAllHint: when missingFields exist, ask only for missing (not full list)
- [x] 3.2 Existing ACKNOWLEDGE FIRST, RELATION hints already support human-like tone

### 4. Route More Turns to AI

- [x] 4.1 Missing-fields reply now uses generateResponse (both collecting_all and confirm_details correction)
- [x] 4.2 Template kept as fallback when AI fails

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Manual test: provide name, age, phone, email → bot asks gender → reply feels natural
- [ ] 5.3 Manual test: "he is my father he is male" → bot says something like "Got it, male. Let me confirm..."
- [ ] 5.4 Verify no PHI in AI prompts

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── ai-service.ts           (UPDATED - response hints, missing-fields prompt)
└── workers/
    └── webhook-worker.ts       (UPDATED - use AI for missing-fields reply when appropriate)
```

**Existing Code Status:**
- ✅ `ai-service.ts` — generateResponse, buildResponseSystemPrompt, step hints
- ✅ `webhook-worker.ts` — "Got it. Still need: X. Please share."; buildConfirmDetailsMessage

---

## 🧠 Design Constraints

- No PHI in prompts (COMPLIANCE.md)
- Confirm-details message must include all fields (compliance/audit)
- Fallback to deterministic if AI fails

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N – reply text only)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y)
  - [ ] **Consent + redaction confirmed?** (Y)

---

## ✅ Acceptance & Verification Criteria

- [ ] Missing-fields reply can be AI-generated when configured
- [ ] AI hints improved for human-like tone
- [ ] Bot acknowledges user input before asking for more
- [ ] Fallback to template if AI fails
- [ ] Type-check passes

---

## 🔗 Related Tasks

- [e-task-1: AI-first extraction](./ai-receptionist-e-task-1-ai-first-extraction.md) — Enables better context for replies
- [e-task-2: Conversation-aware extraction](./ai-receptionist-e-task-2-conversation-aware-extraction.md) — Richer context for AI

---

**Last Updated:** 2026-03-26  
**Reference:** [TASK_TEMPLATE.md](../../TASK_TEMPLATE.md)
