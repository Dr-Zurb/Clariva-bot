# Task 6: Comment Intent Classifier
## 2026-03-18 — Comments Management Initiative

---

## 📋 Task Overview

Create an AI-based classifier for Instagram comment intent. Comments are short (1–20 words), noisy (emojis, @mentions, typos), and require context-aware classification. Output: one of the comment-specific intents (book_appointment, check_availability, pricing_inquiry, general_inquiry, medical_query, greeting, praise, spam, joke, unrelated, vulgar, other). High-intent: first five; low-intent: greeting, praise, other; skip: spam, joke, unrelated, vulgar.

**Estimated Time:** 4–5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-18

**Change Type:**
- [ ] **New feature** — Add to ai-service or new service

**Current State:**
- ✅ **What exists:** `classifyIntent` in ai-service for DM messages; `Intent` type in types/ai.ts (DM intents); `redactPhiForAI`; OpenAI client; `logAuditEvent`, `logAIClassification`; response_format JSON
- ❌ **What's missing:** Comment-specific intent set; `classifyCommentIntent` or equivalent; prompt tuned for short comments, noise, medical context
- ⚠️ **Notes:** Comment intents differ from DM intents (e.g. medical_query, vulgar, joke, spam). May extend types/ai or add new types.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Comment Intent Types

- [x] 1.1 Define `CommentIntent` type in `backend/src/types/ai.ts` - **Completed: 2026-03-18**
  - [x] 1.1.1 High-intent: book_appointment, check_availability, pricing_inquiry, general_inquiry, medical_query
  - [x] 1.1.2 Low-intent: greeting, praise, other
  - [x] 1.1.3 Skip: spam, joke, unrelated, vulgar
- [x] 1.2 Added COMMENT_INTENT_VALUES, isCommentIntent, toCommentIntent

### 2. Classifier Function

- [x] 2.1 Add `classifyCommentIntent(commentText, correlationId)` in ai-service - **Completed: 2026-03-18**
  - [x] 2.1.1 Redact PHI via redactPhiForAI before sending to OpenAI
  - [x] 2.1.2 System prompt: short comments, context-aware, filter jokes/memes/vulgar/unrelated
  - [x] 2.1.3 Output: JSON with intent and confidence (0–1)
  - [x] 2.1.4 Retry (3 attempts), cache, fallback to { intent: 'other', confidence: 0 }
- [x] 2.2 Audit via logAIClassification (metadata only, no comment text)

### 3. Prompt Design

- [x] 3.1 COMMENT_INTENT_SYSTEM_PROMPT per COMMENTS_MANAGEMENT_PLAN - **Completed: 2026-03-18**
  - [x] 3.1.1 Examples for each intent in prompt
  - [x] 3.1.2 Explicit skip: vulgar/spam/joke/unrelated
  - [x] 3.1.3 Medical query: symptom sharing = medical_query
  - [x] 3.1.4 Handle emojis, @mentions, mixed language (English/Hindi/Hinglish)

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── ai-service.ts          (UPDATE - add classifyCommentIntent)
└── types/
    └── ai.ts or comment.ts    (UPDATE - CommentIntent)
```

---

## 🧠 Design Constraints

- No PHI in prompt or logs; redact before sending
- Use existing OpenAI client and config
- Follow EXTERNAL_SERVICES retry patterns
- Audit every AI call (metadata only)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N)
- [ ] **Any PHI in logs?** (No — redact before AI)
- [ ] **External API or AI call?** (Y)
  - [ ] **Consent + redaction confirmed?** (Y)

---

## 🔗 Related Tasks

- [e-task-7-comment-worker-and-outreach](./e-task-7-comment-worker-and-outreach.md)
- [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md) § AI Classification

---

**Last Updated:** 2026-03-18  
**Completed:** 2026-03-18  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
