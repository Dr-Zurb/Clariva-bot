# Task 1: AI-First Extraction with Context
## 2026-03-26 — AI Receptionist Initiative

---

## 📋 Task Overview

Flip the extraction flow from "regex first, AI fallback" to "AI first when we have context." When the bot has asked for specific fields (e.g. "Still need: gender") and the user replies, use AI to extract—with full conversation context—instead of relying on regex that often misinterprets (e.g. "he is my father he is male obviously" → name/reason).

**Estimated Time:** 4–5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-15

**Change Type:**
- [x] **Update existing** — ai-service, collection-service, webhook-worker; follow [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** extractFieldsFromMessage (regex); extractFieldsWithAI (AI fallback when regex empty); validateAndApplyExtracted
- ❌ **What's missing:** AI called when we have narrow context (e.g. only gender missing); context passed to AI (last bot message, what we asked)
- ⚠️ **Notes:** AI currently only runs when regex returns nothing; regex often returns wrong data, so AI never runs

**Scope Guard:**
- Expected files touched: ≤ 6 (ai-service, collection-service, extract-patient-fields, webhook-worker, types)

**Reference Documentation:**
- [AI_RECEPTIONIST_PLAN.md](../../AI_RECEPTIONIST_PLAN.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) — No PHI in prompts
- [CODE_CHANGE_RULES.md](../../CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define When to Use AI-First

- [x] 1.1 Add trigger: use AI when we have narrow context (1–2 missing fields) OR message is ambiguous
  - [x] 1.1.1 Narrow = missingFields.length <= 2 (e.g. only gender, or gender + reason)
  - [x] 1.1.2 Ambiguous = message doesn't match simple regex patterns (phone, email, "male"/"female" alone)
- [x] 1.2 Keep regex path for clearly structured input
  - [x] 1.2.1 Fast path: message is "male", "female", 10-digit phone, or standalone age (isSimpleFastPath)
  - [x] 1.2.2 If fast path matches, skip AI (cost/latency)

### 2. Extend extractFieldsWithAI with Context

- [x] 2.1 Add parameters: lastBotMessage (optional 4th param)
  - [x] 2.1.1 lastBotMessage: what we asked (e.g. "Still need: gender. Please share.")
  - [x] 2.1.2 missingFields: list of fields we need (existing)
- [x] 2.2 Update EXTRACTION_SYSTEM_PROMPT
  - [x] 2.2.1 Add: "Use conversation context: If we asked for a specific field, extract ONLY that field."
  - [x] 2.2.2 Add: "If we asked for gender and user said 'he is my father he is male obviously', extract only gender: male."
- [x] 2.3 Update user prompt in extractFieldsWithAI to include lastBotMessage (redacted)

### 3. Wire Context from Webhook to Extraction

- [x] 3.1 In validateAndApplyExtracted, accept optional options { lastBotMessage }
  - [x] 3.1.1 Pass from webhook when calling validateAndApplyExtracted
- [x] 3.2 In webhook-worker, get last bot message from recentMessages
  - [x] 3.2.1 getLastBotMessage(recentMessages) helper
  - [x] 3.2.2 Pass via options to validateAndApplyExtracted
- [x] 3.3 Update validateAndApplyExtracted signature and all 3 callers

### 4. Merge Logic: Prefer AI When Context Exists

- [x] 4.1 When AI-first triggered and AI returns data: use AI result as primary
  - [x] 4.1.1 Merge: existing + AI result (AI overwrites for fields it extracted)
  - [x] 4.1.2 Regex result: use only for fields AI didn't extract
- [x] 4.2 When regex fast-path (isSimple): use regex only (no AI call)
- [x] 4.3 When both run (fallback): merge AI + regex, prefer AI for conflicting fields when we had narrow context

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Manual test: "he is my father he is male obviously" (only gender missing) → extracts gender only, name/reason unchanged
- [ ] 5.3 Manual test: "male" (fast path) → no AI call, regex works
- [ ] 5.4 Verify no PHI in prompts or logs

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── ai-service.ts           (UPDATED - extractFieldsWithAI context params, prompt)
│   └── collection-service.ts   (UPDATED - validateAndApplyExtracted context, AI-first logic)
├── workers/
│   └── webhook-worker.ts       (UPDATED - pass lastBotMessage to validateAndApplyExtracted)
└── types/
    └── (if needed) extraction context type
```

**Existing Code Status:**
- ✅ `ai-service.ts` — extractFieldsWithAI(redactedText, missingFields, correlationId)
- ✅ `collection-service.ts` — validateAndApplyExtracted; calls AI when regex empty
- ✅ `webhook-worker.ts` — getRecentMessages, validateAndApplyExtracted calls

---

## 🧠 Design Constraints

- No PHI in prompts (COMPLIANCE.md); redact before AI
- AI output is PHI; store only, never log
- Don't remove regex; use as fast path for simple input
- Cost: AI call only when context exists or message ambiguous

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – collected data in Redis/store)
  - [ ] **RLS verified?** (N/A – Redis/in-memory)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (Y – OpenAI)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] AI runs when 1–2 fields missing and message is not simple structured input
- [ ] AI receives lastBotMessage and missingFields in prompt
- [ ] "he is my father he is male obviously" → gender only; name/reason preserved
- [ ] "male" alone → regex fast path, no AI call
- [ ] No PHI in prompts or logs
- [ ] Type-check passes

---

## 🔗 Related Tasks

- [e-task-2: Conversation-aware extraction](./ai-receptionist-e-task-2-conversation-aware-extraction.md) — Builds on this
- [e-task-4: Simplify regex](./ai-receptionist-e-task-4-regex-fast-path.md) — After this

---

**Last Updated:** 2026-03-26  
**Reference:** [TASK_TEMPLATE.md](../../TASK_TEMPLATE.md)
