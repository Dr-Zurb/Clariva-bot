# Task 4: Patient Information Collection Flow
## January 30, 2026 - AI Integration & Conversation Flow Day

---

## 📋 Task Overview

Design and implement the patient information collection flow: field-by-field collection (name, phone, date of birth optional, gender optional, reason for visit), with Zod validation, partial-information handling, and integration with conversation state. Consent collection and storage are handled in Task 5; this task focuses on flow logic and validation.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**
**Completed:** 2026-01-30

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** `services/patient-service.ts` (findPatientByPhone, createPatient, etc.); `patients` table; `services/conversation-service.ts` and message-service; Task 3 delivers conversation state and response generation
- ❌ **What's missing:** No defined “patient collection” flow (which field when, validation rules); no Zod schemas for patient fields (phone, name, DOB, gender, reason); no partial-info handling (e.g. resume collection)
- ⚠️ **Notes:** COMPLIANCE.md: classify data (PHI); no PII in logs; audit and encryption at rest/transit. Consent must be obtained before storing PHI (Task 5).

**Scope Guard:**
- Expected files touched: ≤ 5 (services, types, Zod schemas, conversation state extension)
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - Zod for all external input; ValidationError for validation failures; services throw AppError
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Validation in controllers; business rules in services; flow logic in service layer (webhook path has no HTTP controller)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Section B: data classification; Section C: consent before PHI; Section D: audit (metadata only, no PHI)
- [RECIPES.md](../../Reference/RECIPES.md) - R-VALIDATION-001: Zod schemas in utils/validation; phone regex `^\+?[1-9]\d{1,14}$` (E.164-like)
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - patients table has name, phone, date_of_birth, gender; no reason_for_visit column (see Notes)
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - RLS on patients; service role in worker
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Feature completion checklist
- [ERROR_CATALOG.md](../../Reference/ERROR_CATALOG.md) - ValidationError (400) for invalid field values

---

## ✅ Task Breakdown (Hierarchical)

### 1. Field Definitions and Validation
- [x] 1.1 Define required vs optional fields: name (required), phone (required), date_of_birth (optional), gender (optional), reason_for_visit (required or optional per product; **schema:** patients table has no reason_for_visit—collect for context; store on appointment.notes when booking, or add patients.reason_for_visit via migration per product; document choice)
- [x] 1.2 Create Zod schemas for each field (phone format, name length, DOB format, etc.)
  - [x] 1.2.1 Define schemas in **utils/validation.ts** per RECIPES R-VALIDATION-001; validation runs in collection/flow layer (webhook path has no HTTP controller)
  - [x] 1.2.2 Phone: E.164-like per RECIPES (e.g. `z.string().regex(/^\+?[1-9]\d{1,14}$/)`); name min/max length; DOB date string; gender optional; reason_for_visit length
- [x] 1.3 Define a “collected patient info” type (e.g. partial shape) for conversation state
  - [x] 1.3.1 **conversations.metadata must NOT contain PHI.** Store only: collectedFields (field names), step (e.g. collecting_name). **Collected values** in **memory or Redis** keyed by conversation_id (TTL) until Task 5; document choice (in-memory = single-worker; Redis = multi-worker, TTL e.g. 24h)
  - [x] 1.3.2 No PHI in types used for logging or audit metadata (field names only, e.g. `{ fieldName: 'phone', status: 'validation_failed' }`)

### 2. Collection Flow Logic
- [x] 2.1 Implement flow that determines “next question” based on current state (e.g. missing name → ask name; missing phone → ask phone)
  - [x] 2.1.1 **Collection order (recommended):** name → phone → date_of_birth (optional) → gender (optional) → reason_for_visit; document if order differs
  - [x] 2.1.2 Parse message for field value; run through Zod; on success update memory/Redis + metadata (collectedFields); on failure return clear prompt (e.g. “My name is X” or “X” in reply to “What is your name?”)
- [x] 2.2 Handle partial information: one field at a time; update memory/Redis store and metadata (collectedFields only) incrementally
- [x] 2.3 Handle interruptions: user may change intent mid-collection. **Product choice:** (A) preserve and resume when back to book_appointment, or (B) reset collection; document and implement one
- [x] 2.4 Metadata holds **which fields collected** and **step**; values in **memory or Redis** until Task 5 (no PHI in conversations.metadata per COMPLIANCE C). Integrate with conversation state (Task 3): store “collected patient” partial data in state until ready to persist (Task 5)
- [x] 2.5 Do not persist PHI to patients table until consent (Task 5); this task only validates and accumulates (memory/Redis + metadata flags)

### 3. Integration with Response Generation
- [x] 3.1 When state indicates "collecting patient info", response generation (Task 3) asks for **next missing field** or confirms value; prompt text must not log or persist PHI. When state indicates “collecting patient info”, response generation should ask for next missing field (or confirm provided value)
- [x] 3.2 **Zod-validated values** before updating store; on failure return clear prompt; optionally **max retries per field** (e.g. after 2 failures offer "skip for now") per product (e.g. “Please provide a valid phone number”)
- [x] 3.3 When all **required** fields collected, transition to **consent step** (Task 5); do **not** persist in this task—Task 5 persists only after consent granted

### 4. Compliance and Logging
- [x] 4.1 No PII in logs (only correlationId, resource IDs, “field collected” flags if needed)
- [x] 4.2 Audit: log “patient_data_collection” or similar with metadata only (e.g. which field was updated, no values) per COMPLIANCE.md D
- [x] 4.3 Data classification: treat name, phone, DOB, reason as PHI/administrative per COMPLIANCE.md B

### 5. Testing & Verification
- [x] 5.1 Unit tests for Zod schemas (valid/invalid phone, name, DOB)
- [x] 5.2 Unit tests for flow logic (next field, partial update, validation failure)
- [x] 5.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── patient-service.ts        (USE - create/update when consent given in Task 5)
│   └── (flow logic in ai-service or dedicated collection-service per ARCHITECTURE)
├── types/
│   └── conversation.ts or ai.ts   (UPDATE - collected patient partial type)
├── utils/
│   └── validation.ts              (NEW or UPDATE - Zod schemas for phone, name, DOB, etc.)
└── (controllers if new API endpoints; else worker/response flow)
```

**Existing Code Status:**
- ✅ `services/patient-service.ts` - EXISTS (createPatient, findPatientByPhone, findOrCreatePlaceholderPatient; use for persist only after Task 5 consent)
- ✅ `types/database.ts` - EXISTS (Patient type; patients table has name, phone, date_of_birth, gender; no reason_for_visit column—see Notes)
- ❌ `utils/validation.ts` - MISSING or partial (add Zod schemas: phone E.164-like, name, DOB, gender, reason_for_visit per RECIPES R-VALIDATION-001)
- ✅ Conversation state (Task 3) - Extend with collection step and collectedFields only; values in memory or Redis until Task 5

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod validation for all user-supplied field values (STANDARDS.md, RECIPES R-VALIDATION-001).
- Validation runs in collection/flow layer (webhook path: no HTTP controller; validate parsed message content before updating store).
- **No PHI in conversations.metadata**—only field names and step; collected values live in memory or Redis until Task 5 consent (COMPLIANCE C).
- No persistence of PHI to patients table before consent (Task 5); only in-memory or Redis + metadata flags in this task.
- No PII/PHI in logs or audit payloads; audit metadata only (COMPLIANCE D, STANDARDS.md).

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y - conversation state metadata, audit, optionally Redis) → [x] **RLS verified?** (Y for any DB; conversation metadata updated via existing service role; Redis not PHI store until consent)
- [x] **Any PHI in logs or conversation metadata?** (MUST be No—values in memory/Redis only; metadata = field names and step only)
- [x] **External API or AI call?** (Y if response generation used to ask for fields) → [x] **Consent + redaction confirmed?** (Y - redact before AI in Task 3; consent before persist in Task 5)
- [x] **Retention / deletion impact?** (N until Task 5; if Redis used for pre-consent values, set TTL and document purge on consent denied)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Required/optional fields defined; Zod schemas in utils/validation.ts for name, phone, DOB, gender, reason_for_visit (phone per RECIPES E.164-like)
- [x] Collection flow implemented: next-question logic, partial updates, validation errors produce clear prompts
- [x] Conversation state holds “collected patient” partial data; no PHI persisted to patients table until Task 5
- [x] Response generation integrated so bot asks for next field or confirms value
- [x] No PII/PHI in logs; audit events use metadata only (field name, status; no values)
- [x] Type-check, lint, and tests pass

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) if present.

---

## 🐛 Issues Encountered & Resolved

- **ZodError property:** Used `result.error.issues[0]` (Zod v3) not `.errors`.
- **DOB timezone:** ISO date parsing now returns string as-is; US-style M/D/YYYY builds ISO from parts to avoid UTC shift.
- **Audit metadata key:** Used `field` (not `fieldName`) in audit payload to avoid PHI key validation triggering on "name".
- **parseMessageForField casing:** Return remainder from original `trimmed` string so casing is preserved (e.g. "Alice" not "alice").

---

## 📝 Notes

- **Consent:** Must be requested before storing PHI (Task 5); flow transitions to "ask consent" when all required fields are collected; Task 5 handles consent UX and persistence gate.
- **Phone format:** Follow RECIPES (E.164-like: `^\+?[1-9]\d{1,14}$`); document if national format needed for target market.
- **reason_for_visit:** patients table (001_initial_schema) has no reason_for_visit column. Options: (A) collect for context and store on **appointment.notes** when booking; (B) add **patients.reason_for_visit** via migration if product wants it on patient record. Document choice in implementation.
- **Pre-consent storage:** COMPLIANCE C requires consent before collecting/storing PHI. Persisting name/phone/DOB to conversations.metadata would store PHI in DB before consent—**not allowed**. Use in-memory (per process) or Redis (keyed by conversation_id, TTL) for collected values until Task 5; metadata holds only which fields are collected and current step.

---

## 🔗 Related Tasks

- [Task 3: Conversation State & Response Generation](./e-task-3-conversation-state-and-response.md) - State and response integration
- [Task 5: Consent & Patient Storage](./e-task-5-consent-and-patient-storage.md) - Consent + persist to patients table

---

**Last Updated:** 2026-01-30  
**Completed:** 2026-01-30  
**Related Learning:** `docs/Learning/2026-01-30/l-task-4-patient-collection-flow.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates)
