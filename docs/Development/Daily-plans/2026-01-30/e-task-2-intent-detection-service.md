# Task 2: Intent Detection Service
## January 30, 2026 - AI Integration & Conversation Flow Day

---

## 📋 Task Overview

Create an intent detection service that classifies user message text into one of the defined intents (book_appointment, ask_question, check_availability, greeting, cancel_appointment, unknown) using OpenAI, with retry logic, optional response caching, fallback to unknown on failure, confidence scoring, and full AI/ML compliance (PHI redaction, audit metadata only, no raw prompts/responses with PHI in storage or logs).

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-01-30

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Task 1 intent types and OpenAI client; `services/ai-service.ts` with `classifyIntent`, `redactPhiForAI`; retry (3 attempts, 1s/2s/4s backoff); fallback to unknown; `utils/audit-logger.ts` has `logAIClassification`; unit tests in `tests/unit/services/ai-service.test.ts`
- ❌ **What's missing:** No controller/route yet (Task 3 consumes service)
- ⚠️ **Notes:** Service is framework-agnostic; PHI redacted before OpenAI; only metadata audited (COMPLIANCE.md G)

**Scope Guard:**
- Expected files touched: ≤ 5 (service, types if needed, config, audit usage, tests)
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - Services throw AppError; asyncHandler in controllers; no PII in logs
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Services contain business logic; no Express in services
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Section G: AI assistive only; PHI redaction; audit metadata only; no raw prompts/responses with PHI persisted
- [RECIPES.md](../../Reference/RECIPES.md) - Retry, caching, fallback patterns if documented

---

## ✅ Task Breakdown (Hierarchical)

### 1. Intent Detection Service
- [x] 1.1 Create `services/ai-service.ts` (or equivalent name per ARCHITECTURE)
  - [x] 1.1.1 Function to classify message text → intent + confidence
  - [x] 1.1.2 Accept correlationId for audit and logging
  - [x] 1.1.3 Redact PHI from text before sending to OpenAI (per COMPLIANCE.md G)
  - [x] 1.1.4 Build medical-context classification prompt (no diagnosis; receptionist intents only)
- [x] 1.2 Integrate OpenAI client (from Task 1)
  - [x] 1.2.1 Call only when OPENAI_API_KEY is set; otherwise return fallback (e.g. unknown)
  - [x] 1.2.2 Use structured output or parse response to map to intent type + confidence
- [x] 1.3 Retry logic with exponential backoff for transient OpenAI errors
- [x] 1.4 Optional: response caching for identical (redacted) inputs — in-memory Map, key = redacted text, TTL 5 min, max 500 entries; cache hit = no OpenAI call, no audit
- [x] 1.5 Fallback: on failure or timeout, return intent unknown and log; do not expose raw errors to caller with PHI
- [x] 1.6 Response validation: ensure result is one of defined intents; default to unknown if invalid

### 2. AI Compliance & Audit
- [x] 2.1 Audit every AI call with metadata only (correlationId, model, token usage if available, redaction flag, no raw prompt/response with PHI)
  - [x] 2.1.1 Use existing audit logger; add action/resource type for AI classification
- [x] 2.2 Never log or persist raw user message or AI response when it may contain PHI
- [x] 2.3 Ensure AI is used for assistive intent classification only (no autonomous diagnosis per COMPLIANCE.md G)

### 3. Error Handling & Boundaries
- [x] 3.1 Service throws AppError (e.g. ValidationError, InternalError, or custom) on unrecoverable failures — N/A: service returns unknown on failure, does not throw to caller
- [x] 3.2 No asyncHandler in service (asyncHandler only in controllers); service uses try/catch or returns Result-style as per STANDARDS
- [x] 3.3 Rate limiting: consider existing app rate limiters; document if additional AI-specific rate limiting is required — existing app limiters apply; no extra AI limit in this task

### 4. Testing & Verification
- [x] 4.1 Unit tests: mock OpenAI; test intent mapping, fallback to unknown, retry behavior
- [x] 4.2 Test PHI redaction (e.g. ensure redacted text is what is sent to OpenAI in tests)
- [x] 4.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── ai-service.ts        (NEW - intent detection, retry, cache, fallback, redaction, audit)
├── types/
│   └── ai.ts                (UPDATE if needed - result type with confidence)
└── utils/
    └── audit-logger.ts      (UPDATE if new audit action/resource for AI)
```

**Existing Code Status:**
- ✅ `utils/audit-logger.ts` - EXISTS; added `logAIClassification`
- ✅ `config/env.ts` - EXISTS (OPENAI_API_KEY)
- ✅ `services/ai-service.ts` - CREATED
- ✅ `tests/unit/services/ai-service.test.ts` - CREATED

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller must use asyncHandler; service must not use Express (ARCHITECTURE.md).
- PHI must be redacted before sending any text to OpenAI (COMPLIANCE.md G).
- Only metadata (model, tokens, redaction flag, correlationId) persisted/audited for AI calls (COMPLIANCE.md G).
- Services throw AppError; no return of { error } objects (STANDARDS.md).
- Standard log fields only; no PII in logs (STANDARDS.md, COMPLIANCE.md).

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y - audit_logs / AI metadata) → [x] **RLS verified?** (Y/N per schema — audit_logs use existing RLS/schema)
- [x] **Any PHI in logs?** (MUST be No) - Only metadata in audit
- [x] **External API or AI call?** (Y) → [x] **Consent + redaction confirmed?** (Y - redact PHI before send; consent for collection is Task 5)
- [x] **Retention / deletion impact?** (N for this task if only metadata stored)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Intent detection returns one of the defined intents plus confidence
- [x] Retry with exponential backoff is implemented for OpenAI; fallback to unknown on failure
- [x] PHI is redacted from text sent to OpenAI; audit log has metadata only (no raw prompt/response with PHI)
- [x] All AI calls audited with correlationId and metadata
- [x] Service returns unknown on failure (no PHI exposed); no PII in logs
- [x] Unit tests cover intent mapping, fallback, and redaction behavior
- [x] Type-check and lint pass

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) if present.

---

## 🐛 Issues Encountered & Resolved

- **Jest mock typing:** `jest.fn()` infers `never` for args/return; unit tests use `jest.fn<() => Promise<MockCompletion>>()` and cast `mock.calls as unknown as unknown[][]` when asserting on call arguments. No code change needed in production.

---

## 📝 Notes

- Confidence score can be used by conversation flow (Task 3) to decide whether to ask for clarification.
- **Caching:** In-memory Map in `ai-service.ts`; key = redacted text, TTL = 5 min, max 500 entries; evict oldest when full. Cache hit = no OpenAI call, no audit. Per-process only (not Redis).

---

## 🔗 Related Tasks

- [Task 1: OpenAI Client & Intent Types](./e-task-1-openai-and-intent-types.md) - Prerequisite
- [Task 3: Conversation State & Response Generation](./e-task-3-conversation-state-and-response.md) - Consumes intent

---

**Last Updated:** 2026-01-30  
**Completed:** 2026-01-30  
**Related Learning:** `docs/Learning/2026-01-30/l-task-2-intent-detection-service.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates)
