# Task 1: OpenAI Client & Intent Types
## January 30, 2026 - AI Integration & Conversation Flow Day

---

## 📋 Task Overview

Set up OpenAI API client configuration and define intent types for the receptionist bot. Intent types support routing user messages (book_appointment, ask_question, check_availability, greeting, cancel_appointment, unknown). No business logic in this task—only types and client setup. Client/config must support Task 2’s cost tracking, token limits, and model selection per EXTERNAL_SERVICES.md and COMPLIANCE.md section G.

**Estimated Time:** 1–2 hours  
**Status:** ✅ **COMPLETE**  
**Completed:** 2026-01-30

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** `config/env.ts` has `OPENAI_API_KEY` (optional); `package.json` has `openai` dependency; `types/database.ts` has `intent?: string` on message type
- ❌ **What's missing:** No `types/ai.ts`; no OpenAI client wrapper or config; no formal intent enum/union type; no intent const array for runtime validation; no model/max_tokens config for cost and token limits
- ⚠️ **Notes:** Health controller mentions "openai" as future check; implementation belongs in services (next task). Intent set aligned with [BUSINESS_PLAN.md](../../../Business%20files/BUSINESS_PLAN.md) MVP (book appointment, ask question, check availability); extendable later (e.g. reschedule_appointment).

**Scope Guard:**
- Expected files touched: ≤ 5 (types, config, env validation if needed, optional health doc)
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Coding rules, no raw process.env (use config/env)
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Types are pure; no Express/controllers in types
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - Section G (AI Safety & Governance); PHI redaction and audit metadata when calling AI (next task)
- [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md) - AI client config; cost protection; token limits; prompt injection protection (Task 2 uses; Task 1 prepares config)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define Intent Types
- [x] 1.1 Create `types/ai.ts` - **Completed: 2026-01-30**
  - [x] 1.1.1 Define intent union/literal type: book_appointment, ask_question, check_availability, greeting, cancel_appointment, unknown
  - [x] 1.1.2 Export type for use in services and controllers
- [x] 1.2 Define a const array of valid intent values (e.g. `INTENT_VALUES`) for runtime validation (Zod schema or membership check in Task 2) - **Completed: 2026-01-30**
  - [x] 1.2.1 Ensures "unknown" and invalid API responses map consistently; single source of truth for valid intents
- [x] 1.3 Optionally define confidence score type (e.g. number 0–1) for intent detection result - **Completed: 2026-01-30** (ConfidenceScore, IntentDetectionResult)
- [x] 1.4 Export from `types/index.ts` if project re-exports from single entry - **Completed: 2026-01-30**

### 2. OpenAI Client Setup
- [x] 2.1 Ensure OPENAI_API_KEY is validated in `config/env.ts` (optional for app startup; required when AI features used) - **Completed: 2026-01-30**
  - [x] 2.1.1 Document that AI routes or worker should fail fast if key missing when AI is invoked
- [x] 2.2 Add or confirm OpenAI client initialization (e.g. in config or a dedicated module) that reads from env - **Completed: 2026-01-30** (`config/openai.ts` getOpenAIClient())
  - [x] 2.2.1 Use config/env only (no raw process.env)
  - [x] 2.2.2 Support optional key (client created only when key present, or throw when AI called without key)
- [x] 2.3 Add optional client config for model and token limits (per [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md)) - **Completed: 2026-01-30**
  - [x] 2.3.1 Optional env: `OPENAI_MODEL` (e.g. `gpt-4o-mini`) and `OPENAI_MAX_TOKENS` (default or from env) so Task 2 can enforce token limits and cost tracking without env sprawl
  - [x] 2.3.2 Config must expose model identifier for audit metadata and cost tracking (COMPLIANCE.md section G, EXTERNAL_SERVICES cost protection) - getOpenAIConfig()

### 3. Verification and Documentation
- [x] 3.1 Run type-check - **Completed: 2026-01-30** (passed)
- [x] 3.2 Ensure no PHI in types or config (types are metadata only)
- [x] 3.3 Optionally document that `/health` may later include OpenAI reachability when key is set (for Task 2 or ops) - documented in config/openai.ts JSDoc

---

## 📁 Files to Create/Update

```
backend/
├── .env.example           (UPDATE - OPENAI_MODEL, OPENAI_MAX_TOKENS)
└── src/
    ├── types/
    │   ├── ai.ts          (NEW - intent union type, INTENT_VALUES const, isIntent, toIntent, ConfidenceScore, IntentDetectionResult)
    │   └── index.ts       (UPDATE - export ai types)
    └── config/
        ├── env.ts         (UPDATE - OPENAI_API_KEY docs; OPENAI_MODEL, OPENAI_MAX_TOKENS optional)
        └── openai.ts      (NEW - getOpenAIClient(), getOpenAIConfig())
```

**Existing Code Status:**
- ✅ `config/env.ts` - EXISTS (OPENAI_API_KEY optional; OPENAI_MODEL, OPENAI_MAX_TOKENS added)
- ✅ `types/ai.ts` - CREATED
- ✅ `config/openai.ts` - CREATED
- ✅ `types/database.ts` - EXISTS (message intent field present)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Types must not depend on Express or any framework (ARCHITECTURE.md).
- All env access via config/env.ts (STANDARDS.md).
- No business logic in types—intent detection logic belongs in a service (next task).
- AI usage must align with COMPLIANCE.md section G (redaction, audit metadata only)—applies when implementing AI calls.
- Client/config must allow Task 2 to implement cost tracking (model name, token usage) and token limits per [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md) (cost protection, token limits).
- Intent set is MVP-aligned; types should be extendable (e.g. add reschedule_appointment later) without breaking existing code.

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (N) - Types and config only; no DB or PHI
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N) - This task does not call OpenAI; only prepares types and client setup
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Intent types are defined and exported (book_appointment, ask_question, check_availability, greeting, cancel_appointment, unknown)
- [x] A const array of valid intents (e.g. INTENT_VALUES) exists for runtime validation in Task 2
- [x] OpenAI client can be initialized from config/env (no raw process.env) - getOpenAIClient() in config/openai.ts
- [x] Client config supports model identifier and optional max_tokens (for Task 2 cost tracking and token limits per EXTERNAL_SERVICES.md) - getOpenAIConfig()
- [x] Type-check passes; no new lint errors
- [x] No PHI or business logic in types

**See also:** [DEFINITION_OF_DONE.md](../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

_To be filled during implementation_

---

## 📝 Notes

- Intent classification logic and prompts are implemented in Task 2.
- Confidence scoring type here keeps Task 2 focused on service behavior.
- Intent set aligned with [BUSINESS_PLAN.md](../../../Business%20files/BUSINESS_PLAN.md) MVP (book appointment, ask question, check availability); extendable for future intents (e.g. reschedule_appointment) per product roadmap.
- Cost tracking and token limits are implemented in Task 2; Task 1 prepares config (model, max_tokens) so Task 2 can satisfy [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md) and [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section G (audit metadata: model, token count).

---

## 🔗 Related Tasks

- [Task 2: Intent Detection Service](./e-task-2-intent-detection-service.md) - Uses intent types and OpenAI client
- [Task 3: Conversation State & Response Generation](./e-task-3-conversation-state-and-response.md) - Uses intents for routing

---

**Last Updated:** 2026-01-30  
**Completed:** 2026-01-30  
**Related Learning:** `docs/Archive/learning/2026-01-30/l-task-1-openai-and-intent-types.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates)
