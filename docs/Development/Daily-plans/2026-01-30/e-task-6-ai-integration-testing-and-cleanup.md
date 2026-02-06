# Task 6: AI Integration Testing & Cleanup
## January 30, 2026 - AI Integration & Conversation Flow Day

---

## 📋 Task Overview

Verify Week 2 deliverables end-to-end: intent detection accuracy, conversation flow (multi-turn and state), patient collection flow, and consent-to-storage flow. Run compliance checks (no PHI in logs, audit metadata only, consent before PHI). Fix issues, add or adjust tests, and perform cleanup (docs, types, dead code).

**Estimated Time:** 1–2 hours  
**Status:** ✅ **DONE**
**Completed:** 2026-01-30

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Tasks 1–5 deliver OpenAI client, intent types (including revoke_consent), intent service, conversation state, response generation, patient collection flow (collection-service), consent and patient storage (consent-service), consent revocation with PHI anonymization; migrations 005 (consent columns), 006 (consent_revoked_at); unit tests for validation, collection, consent, ai-service, webhook-worker
- ❌ **What's missing:** E2E or integration tests for full webhook→worker→collection→consent flow; compliance checklist run; possible doc/type cleanup; DB_SCHEMA.md may need consent columns (005, 006)
- ⚠️ **Notes:** No new features; verification and polish only. STANDARDS.md and COMPLIANCE.md are the acceptance baseline.

**Scope Guard:**
- Expected files touched: tests, possibly docs and minor code cleanup (≤ 8 files; integration tests may add multiple test files)
- Any expansion requires explicit approval

**Reference Documentation:**
- [TESTING.md](../../Reference/TESTING.md) - Testing strategy, PII placeholders, patterns
- [STANDARDS.md](../../Reference/STANDARDS.md) - Logging, errors, validation
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - AI governance, PHI, consent, audit
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Feature completion checklist
- [webhook-testing-guide.md](../../testing/webhook-testing-guide.md) - Integration scripts (server required)
- [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md) - Completion date and verification

---

## ✅ Task Breakdown (Hierarchical)

### 1. Intent Detection Verification
- [x] 1.1 Run existing unit tests for intent detection (Task 2)
- [x] 1.2 Optionally: add or run integration test with mocked OpenAI to verify intent mapping for sample messages (greeting, book_appointment, ask_question, revoke_consent, unknown)
- [x] 1.3 Confirm fallback to unknown when OpenAI fails or key missing; no PHI in logs

### 2. Conversation Flow Verification
- [x] 2.1 Test multi-turn: send sequence of messages; verify state is updated and response uses context
- [x] 2.2 Verify conversation and messages are stored; no raw prompts/responses with PHI in DB or logs
- [x] 2.3 Verify audit entries for AI calls contain metadata only (correlationId, model, tokens, redaction flag)

### 3. Patient Collection and Consent Verification
- [x] 3.1 Test full flow: collect name, phone, (optional fields) → ask consent → persist only after consent
- [x] 3.2 Test consent denied: no patient row created; state cleared or handled
- [x] 3.3 Test consent revoked: revocation recorded; PHI anonymized (name→[Anonymized], phone→revoked-{id}, DOB/gender nulled) per COMPLIANCE F
- [x] 3.4 Verify Zod validation rejects invalid phone/name; user gets clear error message
- [x] 3.5 Verify no PII in logs; audit events have metadata only

### 4. Compliance Checklist
- [x] 4.1 No PHI in application logs (only correlationId, IDs, standard fields)
- [x] 4.2 All AI calls audited with metadata only; no raw prompt/response with PHI stored
- [x] 4.3 Consent obtained before PHI persistence; consent status and timestamp stored
- [x] 4.4 RLS: doctor-only access to patients; verified via test or manual check
- [x] 4.5 Data classification and encryption at rest/transit noted or verified per COMPLIANCE.md

### 5. Cleanup
- [x] 5.1 Remove or fix any dead code introduced in Tasks 1–5
- [x] 5.2 Ensure types are exported where needed; no unused imports
- [x] 5.3 Update README or docs if env vars are undocumented: OPENAI_API_KEY (AI features), REDIS_URL (webhook queue), DEFAULT_DOCTOR_ID (conversation flow), ENCRYPTION_KEY (dead letter payloads)
- [x] 5.4 Run type-check, lint, and full test suite; optionally run `npm run test:coverage` and verify 80%+ where feasible; fix any failures
- [x] 5.5 Verify DB_SCHEMA.md documents patients consent columns (005_consent, 006_consent_revocation) if not already present

### 6. Definition of Done
- [x] 6.1 All acceptance criteria for Tasks 1–5 are still satisfied
- [x] 6.2 Test suite passes; no new lint errors
- [x] 6.3 Completion date recorded on this task and in README/daily plan when marking Week 2 complete

---

## 📁 Files to Create/Update

```
backend/
├── tests/
│   ├── integration/   (NEW or UPDATE - E2E/conversation/consent tests if added)
│   └── unit/         (UPDATE - any new unit tests for Tasks 1–5)
docs/
└── Development/
    └── Daily-plans/
        └── 2026-01-30/
            └── README.md  (UPDATE - progress, completion dates)
```

**Existing Code Status:**
- ✅ `tests/` structure exists (unit, integration); unit tests for validation, collection, consent, ai-service, webhook-worker
- ✅ Tasks 1–5 deliverables in place (ai-service, collection-service, consent-service, migrations 005/006)
- ✅ `docs/testing/webhook-testing-guide.md` - Integration script commands; server must be running

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Testing must not log or persist PHI (TESTING.md, COMPLIANCE.md).
- Mock external services (OpenAI, Instagram) in unit/integration tests where appropriate.
- Cleanup must not change contracts or remove required behavior per STANDARDS and COMPLIANCE.

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y - tests may touch DB) → [x] **RLS verified?** (Y in test env)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N in tests if mocked)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Intent detection and conversation flow are tested and passing
- [x] Patient collection and consent flow are tested; consent-before-persist and revocation verified
- [x] Compliance checklist (no PHI in logs, audit metadata only, consent, RLS) is completed and documented
- [x] Cleanup done; type-check and lint pass; test suite green
- [x] Completion date recorded; Week 2 daily plan updated

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) if present.

---

## 🐛 Issues Encountered & Resolved

- None. Tests pass; type-check passes; lint has pre-existing warnings (no errors). README and DB_SCHEMA updated. No dead code identified in Tasks 1–5 scope.

---

## 📝 Notes

- This task closes Week 2 (AI Integration & Conversation Flow). Week 3 (Booking & Payments) can start after this.
- If TESTING.md defines E2E approach, follow it (e.g. test against local server with mocked OpenAI).
- Integration tests (e.g. webhook flow) require server running (`npm run dev`); see `docs/testing/webhook-testing-guide.md` for commands.
- Use fake PHI placeholders in tests (PATIENT_TEST, +10000000000) per TESTING.md; no real patient data.

---

## 🔗 Related Tasks

- [Task 4: Patient Collection Flow](./e-task-4-patient-collection-flow.md)
- [Task 5: Consent & Patient Storage](./e-task-5-consent-and-patient-storage.md)
- [Task 1–5](./README.md) - All Week 2 execution tasks
- [Monthly Plan Week 3](../../Monthly-plans/2025-01-09_1month_dev_plan.md#week-3-booking-system--payments-jan-24---jan-30) - Next phase

---

**Last Updated:** 2026-01-30  
**Completed:** 2026-01-30  
**Related Learning:** `docs/Learning/2026-01-30/l-task-6-ai-integration-testing-and-cleanup.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates)
