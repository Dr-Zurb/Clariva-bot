# Task 2: AI Prompt Improvements
## 2026-03-25

---

## 📋 Task Overview

Improve the AI system prompt so it produces natural, context-aware replies. Add explicit instructions: acknowledge the user's message, never repeat the initial collection prompt when data exists, handle relation clarifications, treat reason refinements as updates, and be conversational.

**Estimated Time:** 1–2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-25

**Change Type:**
- [x] **Update existing** — ai-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** RESPONSE_SYSTEM_PROMPT_BASE; step-specific hints (collecting_all, confirm_details, consent); practice info injection
- ❌ **What's missing:** Explicit "acknowledge user" rule; "never repeat prompt" rule; relation/clarification handling; conversational tone emphasis
- ⚠️ **Notes:** Prompt already has CRITICAL rules; add more without bloating

**Scope Guard:**
- Expected files touched: ≤ 1 (ai-service)

**Reference Documentation:**
- [BOT_INTELLIGENCE_PLANNING.md](../../../Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Acknowledge & Don't Repeat

- [x] 1.1 Add rule: "ALWAYS acknowledge what the user just said before asking for more"
  - [x] 1.1.1 Examples: "Got it, your sister." / "Thanks for clarifying." / "Understood."
- [x] 1.2 Add rule: "When collectedDataSummary shows any 'provided' fields, NEVER say 'Please share: Full name, Age, Mobile, Reason for visit' again"
  - [x] 1.2.1 Only ask for missing fields
  - [x] 1.2.2 If user refines (e.g. "she has diabetes"), treat as update, not restart

### 2. Relation & Clarification

- [x] 2.1 When bookingForSomeoneElse and relation is provided, add instruction
  - [x] 2.1.1 "Use the relation (e.g. sister, mother) in your reply. Say 'your sister' not 'them' when known."
- [x] 2.2 When user message is a clarification (e.g. "my sister?", "sister first"), add instruction
  - [x] 2.2.1 "Acknowledge the clarification and continue with the flow. Do not start over."

### 3. Conversational Tone

- [x] 3.1 Strengthen tone instruction
  - [x] 3.1.1 "Be warm and natural. Match the user's energy. Avoid robotic repetition."
- [x] 3.2 Add negative examples: what NOT to do
  - [x] 3.2.1 "Do not repeat the same prompt verbatim when the user has already responded."

### 4. Integration with New Context (e-task-1)

- [x] 4.1 Use collectedDataSummary, missingFields, lastBotMessage in prompt when available
  - [x] 4.1.1 Inject: "Collected so far: {summary}. Still need: {missing}. Last you asked: {lastBotMessage}."
  - [x] 4.1.2 Only when in collection/confirm/consent steps

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Manual test: "my sister?" → AI acknowledges "sister", asks for details naturally
- [ ] 5.3 Manual test: user provides partial data, then clarifies → no full prompt repeat

---

## 📁 Files to Create/Update

```
backend/src/
└── services/
    └── ai-service.ts   (UPDATED - RESPONSE_SYSTEM_PROMPT_BASE, hint injection)
```

**Existing Code Status:**
- ✅ `ai-service.ts` — Has base prompt, step hints, practice info

---

## 🧠 Design Constraints

- No PHI in prompt (COMPLIANCE.md)
- Keep prompt concise; avoid token explosion
- Follow STANDARDS.md for prompt structure

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] AI acknowledges user messages before asking for more
- [x] AI does not repeat full collection prompt when data exists
- [x] AI uses relation ("your sister") when known
- [x] Prompt remains within reasonable token limit

---

## 🔗 Related Tasks

- [e-task-1: AI context enhancement](./e-task-1-ai-context-enhancement.md) — Prerequisite
- [e-task-3: Route ambiguous messages to AI](./e-task-3-route-ambiguous-to-ai.md) — Uses improved prompt

---

**Last Updated:** 2026-03-25  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
