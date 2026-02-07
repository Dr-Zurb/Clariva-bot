# Task 3: Conversation State & Response Generation
## January 30, 2026 - AI Integration & Conversation Flow Day

---

## 📋 Task Overview

Implement conversation state management and response generation so the bot can maintain context, produce medical-appropriate (assistive, non-diagnostic) replies, and support multi-turn conversations. Conversation history must be stored in the database. Response generation must follow AI compliance: PHI redaction, audit metadata only, retry/cache/fallback, and no medical advice.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-01-30

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** `services/conversation-service.ts` (findConversationByPlatformId, createConversation, etc.); `services/message-service.ts`; `conversations` and `messages` tables per migrations; Task 2 delivers intent detection
- ❌ **What's missing:** No explicit “conversation state” object (e.g. current step, collected fields) for flow control; no response generation service that uses OpenAI with medical-context prompts; no multi-turn context passed to AI
- ⚠️ **Notes:** State can live in DB (e.g. conversation metadata or messages) or in memory per session; document where state is stored. COMPLIANCE.md G: redact PHI before AI, audit metadata only, assistive only

**Scope Guard:**
- Expected files touched: ≤ 6 (services, types, possibly conversation/message usage in worker)
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - Services throw AppError; no PII in logs; asyncHandler in controllers
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Business logic in services; controllers orchestrate
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Section G: AI Safety & Governance; assistive only; PHI redaction; audit metadata only; validate AI responses before presenting
- [RECIPES.md](../../Reference/RECIPES.md) - Patterns for services and validation
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md) - Token limits, retry, cost protection for response generation (history length = token budget)
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) / migrations `conversations`, `messages` - Schema has no `conversations.metadata`; state storage must be decided (see 1.1.1)
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - RLS verification for conversations/messages
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Feature completion checklist

---

## ✅ Task Breakdown (Hierarchical)

### 1. Conversation State Management
- [x] 1.1 Define what “conversation state” includes (e.g. current intent, step in flow, partial patient data if any)
  - [x] 1.1.1 Decide where state is stored. **Options:** (A) Add `conversations.metadata` JSONB via migration (state in DB; requires DB_SCHEMA + migration approval); (B) Derive state from last N messages (no schema change; e.g. last intent, last bot step); (C) In-memory only, re-built from messages on load (simpler; state lost across restarts unless persisted in messages). Document choice.
  - [x] 1.1.2 Create or extend types for conversation state (no PHI in types used for logging)
- [x] 1.2 Implement get/update state (e.g. in conversation-service or dedicated helper)
  - [x] 1.2.1 Load state when processing a new message (e.g. in webhook worker or controller)
  - [x] 1.2.2 Persist state after each turn so multi-turn context is available
- [x] 1.3 Integrate with existing conversations and messages tables (conversation-service, message-service). **Prerequisite:** Webhook must resolve `doctor_id` and `patient_id` for get/create conversation (e.g. single-tenant from env, or placeholder patient per platform user; document assumption). Current worker has only `senderId` (Instagram PSID).

### 2. Response Generation Service
- [x] 2.1 Create or extend service that generates bot reply text given: current intent, conversation state, and recent message history (for context)
  - [x] 2.1.1 Use OpenAI with medical-context, receptionist-only prompts (no diagnosis; assistive only per COMPLIANCE.md G)
  - [x] 2.1.2 Redact PHI from any text sent to OpenAI; never log or persist raw prompts/responses with PHI (use `redactPhiForAI` or equivalent; COMPLIANCE.md G)
  - [x] 2.1.3 Retry with exponential backoff; **fallback to safe generic reply** on failure (e.g. “I didn’t quite get that. Could you rephrase?” or “Thanks for your message. We’ll get back to you soon.” — no PHI, no medical advice)
- [ ] 2.2 Optional: cache responses for identical (redacted) context where safe (per Task 2 pattern)
- [x] 2.3 Validate that generated response is appropriate (e.g. no medical advice); sanitize if needed (COMPLIANCE.md G: validate AI responses before presenting)
- [x] 2.4 Audit every AI call with metadata only (correlationId, model, tokens, redaction flag) — use existing audit pattern (e.g. extend `logAIClassification` or add `logAIResponseGeneration`; no raw prompt/response with PHI)

### 3. Multi-Turn and History
- [x] 3.1 When generating response, include recent conversation history (redacted) for context
  - [x] 3.1.1 Limit history length: last 10 messages (MAX_HISTORY_PAIRS=5 pairs) in ai-service
- [x] 3.2 Store each bot reply as a message in DB (via message-service) with `sender_type: 'system'`. User message stored with `intent`.
- [x] 3.3 Ensure state is updated after each turn (updateConversationState in webhook-worker)

### 4. Integration with Intent and Worker
- [x] 4.1 Wire intent (from Task 2) and conversation state into response generation (intent + step in system prompt)
- [x] 4.2 Webhook worker: resolve doctor_id (env) + patient (findOrCreatePlaceholderPatient); get/create conversation; store user message (with intent); classifyIntent; get/update state; generateResponse; store bot message; send reply via Instagram
- [x] 4.3 Controllers use asyncHandler; services throw AppError; no PII in logs

### 5. Testing & Verification
- [x] 5.1 Unit tests for response generation (ai-service.test.ts) and webhook worker (mocks for new deps)
- [x] 5.2 Verify PHI redaction and audit metadata only (existing + generateResponse tests)
- [x] 5.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── conversation-service.ts   (UPDATE - state get/update if state in DB)
│   ├── message-service.ts       (USE - store messages)
│   └── ai-service.ts             (UPDATE or NEW - response generation with redaction, audit)
├── types/
│   └── conversation.ts          (NEW or UPDATE - state shape)
└── workers/
    └── webhook-worker.ts        (UPDATE - use state + intent + response generation)
```

**Existing Code Status:**
- ✅ `services/conversation-service.ts` - EXISTS
- ✅ `services/message-service.ts` - EXISTS
- ✅ `workers/webhook-worker.ts` - EXISTS (processes webhooks; will call intent + response)
- ✅ `services/instagram-service.ts` - EXISTS (send reply)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Response generation must not provide medical advice; assistive receptionist only (COMPLIANCE.md G).
- PHI redacted before sending to OpenAI; only metadata in audit and logs (COMPLIANCE.md G).
- State and history usage must respect existing RLS and audit requirements (COMPLIANCE.md).
- Services must not import Express; controllers use asyncHandler (ARCHITECTURE.md, STANDARDS.md).

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y - conversations, messages, patients) → [x] **RLS verified?** (Y — service role in worker; migration 004 adds columns only; no new RLS)
- [x] **Any PHI in logs?** (MUST be No) — only metadata in audit; no raw prompts/responses with PHI
- [x] **External API or AI call?** (Y) → [x] **Consent + redaction confirmed?** (Y - redact PHI before send; consent for collection in Task 5)
- [x] **Retention / deletion impact?** (N — state in metadata; message content follows existing retention)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Conversation state is defined, stored, and updated across turns
- [x] Response generation produces medical-appropriate, assistive replies using OpenAI with redacted context
- [x] Multi-turn history is passed to AI (redacted) and limited in length
- [x] Each bot reply is stored as a message; state is persisted after each turn
- [x] PHI redaction and audit metadata only for all AI calls; no raw prompts/responses with PHI in logs or DB
- [x] Retry and fallback implemented; service throws AppError where appropriate
- [x] Webhook flow uses intent, state, and response generation to reply to user
- [x] Type-check, lint, and tests pass

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) if present.

---

## 🐛 Issues Encountered & Resolved

_To be filled during implementation_

---

## 📝 Notes

- Patient information collection (Task 4–5) will extend state (e.g. collected fields) and may drive different response prompts.
- Keep prompts in code or config; avoid storing raw prompts with user data (COMPLIANCE.md G).
- **Doctor/patient resolution:** For MVP, document how webhook obtains `doctor_id` (e.g. single doctor from env, or page_id → doctor mapping) and how first message gets a `patient_id` (e.g. create placeholder patient per platform user, or nullable patient_id if migration approved). Conversation create currently requires both; worker has neither today.
- **State in DB:** If Option A (conversations.metadata) is chosen, add migration and update DB_SCHEMA.md per MIGRATIONS_AND_CHANGE.md.

---

## 🔗 Related Tasks

- [Task 2: Intent Detection Service](./e-task-2-intent-detection-service.md) - Provides intent for response flow
- [Task 4: Patient Information Collection Flow](./e-task-4-patient-collection-flow.md) - Extends state with collected fields
- [Task 5: Consent & Patient Storage](./e-task-5-consent-and-patient-storage.md) - Consent before PHI storage

---

**Last Updated:** 2026-01-30  
**Completed:** _YYYY-MM-DD_ (if applicable)  
**Related Learning:** `docs/Learning/2026-01-30/l-task-3-conversation-state-and-response.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates)
