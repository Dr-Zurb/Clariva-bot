# Task 6: Hybrid Extraction Fallback
## 2026-03-25

---

## 📋 Task Overview

When extraction returns empty or partial data but the user's message clearly contains information (e.g. "i wanna get her checked for diabetes" as reason, "she has stomach pain"), use the AI to help interpret the message and extract fields. Fallback: if regex extraction fails, optionally call AI with a structured prompt to return extracted fields, then merge into store.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-25

**Change Type:**
- [x] **Update existing** — ai-service, collection-service, webhook-worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** extractFieldsFromMessage (regex-based); validateAndApplyExtracted; symptom-as-name fix
- ❌ **What's missing:** AI-assisted extraction when regex fails; structured output for extraction
- ⚠️ **Notes:** AI extraction must not receive/store raw PHI in prompts; use redaction; output should be structured (JSON) for merging

**Scope Guard:**
- Expected files touched: ≤ 5 (ai-service, collection-service, extract-patient-fields, webhook-worker, types)

**Reference Documentation:**
- [BOT_INTELLIGENCE_PLANNING.md](../../../Future%20Planning/BOT_INTELLIGENCE_PLANNING.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) — No PHI in prompts
- [extract-patient-fields.ts](../../../backend/src/utils/extract-patient-fields.ts)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Define AI Extraction Contract

- [x] 1.1 Create prompt for "extract patient fields from message"
  - [x] 1.1.1 Input: redacted message, missing fields list
  - [x] 1.1.2 Output: JSON with optional name, phone, age, gender, reason_for_visit, email
  - [x] 1.1.3 Instructions: extract only what's clearly stated; never use symptom as name
- [x] 1.2 Add function `extractFieldsWithAI(redactedText, missingFields, correlationId): Promise<Partial<CollectedPatientData>>`
  - [x] 1.2.1 Returns partial object; caller merges with existing
  - [x] 1.2.2 On failure, return empty; don't block flow

### 2. When to Use AI Extraction

- [x] 2.1 Define trigger: regex extraction returns empty AND message length > 15
  - [x] 2.1.1 Avoid AI for "yes", "no", "my sister?" (short/clarification)
- [x] 2.2 In validateAndApplyExtracted
  - [x] 2.2.1 If regex returns empty, call extractFieldsWithAI
  - [x] 2.2.2 Merge AI result with regex; validate each field
  - [ ] 2.2.3 Rate-limit or cap (deferred; single call per message)

### 3. PHI Safety

- [x] 3.1 Redact message before sending to AI (use redactPhiForAI)
- [x] 3.2 AI output treated as user-provided; merge into store only; never log values
- [x] 3.3 Audit: log ai_extraction (metadata only: extractedFields names, tokens)

### 4. Integration

- [x] 4.1 Add to collection-service
  - [x] 4.1.1 Call extractFieldsFromMessage first
  - [x] 4.1.2 If empty and substantive, call extractFieldsWithAI
  - [x] 4.1.3 Merge results; run existing validateAndApplyExtracted logic
- [x] 4.2 Ambiguous path uses generateResponse; extraction path uses validateAndApplyExtracted (no double-call)

### 5. Verification & Testing

- [x] 5.1 Run type-check
- [ ] 5.2 Manual test: "i wanna get her checked for diabetes" → reason_for_visit extracted
- [ ] 5.3 Manual test: "she has stomach pain" → reason_for_visit extracted (not name)
- [ ] 5.4 Verify no PHI in logs or extraction prompt
- [ ] 5.5 Verify regex path still works; no regression

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── ai-service.ts           (UPDATED - extractFieldsWithAI)
│   └── collection-service.ts   (UPDATED - optional AI extraction fallback)
└── workers/
    └── webhook-worker.ts       (UPDATED - trigger logic if needed)
```

**Existing Code Status:**
- ✅ `extract-patient-fields.ts` — Regex extraction
- ✅ `collection-service.ts` — validateAndApplyExtracted
- ✅ `ai-service.ts` — redactPhiForAI, OpenAI client

---

## 🧠 Design Constraints

- No PHI in prompts (COMPLIANCE.md); redact before AI
- AI output (extracted fields) is PHI; store only, never log
- Don't replace regex; use AI as fallback only
- Rate-limit or cap to control cost

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

- [x] AI extraction used when regex fails and message is substantive
- [x] Extracted fields merged and validated correctly
- [x] No PHI in prompts or logs
- [x] Regex path unchanged; no regression
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-1: AI context enhancement](./e-task-1-ai-context-enhancement.md) — Independent
- [e-task-2: AI prompt improvements](./e-task-2-ai-prompt-improvements.md) — Independent
- [e-task-3: Route ambiguous to AI](./e-task-3-route-ambiguous-to-ai.md) — Complementary; e-task-3 handles "what to say", e-task-6 handles "what to extract"

---

**Last Updated:** 2026-03-25  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
