# Task 5: Conversation History Expansion
## 2026-03-25

---

## 📋 Task Overview

Increase the number of message pairs passed to the AI for response generation so it has more conversation context. Currently MAX_HISTORY_PAIRS = 5. Increase to 8–10 (or make configurable) to improve context awareness.

**Estimated Time:** 0.5–1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-25

**Change Type:**
- [x] **Update existing** — ai-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** MAX_HISTORY_PAIRS = 5 in ai-service; recentMessages sliced before building history
- ❌ **What's missing:** Larger history; optional env/config for tuning
- ⚠️ **Notes:** More history = more tokens = higher cost; balance context vs cost

**Scope Guard:**
- Expected files touched: ≤ 2 (ai-service, maybe env)

**Reference Documentation:**
- [BOT_INTELLIGENCE_PLANNING.md](../../../Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Increase History Size

- [x] 1.1 Change MAX_HISTORY_PAIRS from 5 to 8 (configurable via env)
  - [x] 1.1.1 Document in code comment: trade-off between context and token cost
- [x] 1.2 Verify getRecentMessages supports larger fetch
  - [x] 1.2.1 message-service: getRecentMessages(conversationId, limit, correlationId)
  - [x] 1.2.2 Webhook uses AI_RECENT_MESSAGES_LIMIT (2 * MAX_HISTORY_PAIRS)

### 2. Optional: Make Configurable

- [x] 2.1 Add env var AI_MAX_HISTORY_PAIRS
  - [x] 2.1.1 Default 8; clamp to 3–15 for safety
- [x] 2.2 Use in ai-service when building history
- [ ] 2.3 Document in env.example if added (no env.example in project)

### 3. Webhook Worker

- [x] 3.1 Ensure getRecentMessages called with sufficient limit
  - [x] 3.1.1 Uses AI_RECENT_MESSAGES_LIMIT (16 for default 8 pairs)
  - [x] 3.1.2 Both call sites updated

### 4. Verification & Testing

- [x] 4.1 Run type-check
- [ ] 4.2 Manual test: long conversation → AI references earlier context
- [ ] 4.3 Monitor token usage if possible; ensure no excessive cost

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── ai-service.ts      (UPDATED - MAX_HISTORY_PAIRS)
└── workers/
    └── webhook-worker.ts  (UPDATED - getRecentMessages limit if needed)
```

**Existing Code Status:**
- ✅ `ai-service.ts` — MAX_HISTORY_PAIRS = 5, pairs = recentMessages.slice(-N*2)
- ✅ `webhook-worker.ts` — getRecentMessages(conversation.id, 10, ...)

---

## 🧠 Design Constraints

- No PHI in prompts (COMPLIANCE.md)
- Balance context vs token cost
- Follow STANDARDS.md

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] AI receives 8+ message pairs (default 8, configurable via AI_MAX_HISTORY_PAIRS)
- [x] getRecentMessages fetches enough messages (AI_RECENT_MESSAGES_LIMIT)
- [x] Type-check passes
- [ ] No regression in response quality (manual verify)

---

## 🔗 Related Tasks

- [e-task-1: AI context enhancement](./e-task-1-ai-context-enhancement.md) — Independent; both improve AI
- [e-task-2: AI prompt improvements](./e-task-2-ai-prompt-improvements.md) — Independent

---

**Last Updated:** 2026-03-25  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
