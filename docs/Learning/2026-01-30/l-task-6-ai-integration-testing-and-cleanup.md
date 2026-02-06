# Learning Topics - AI Integration Testing & Cleanup
## Task #6: Verification, Compliance, and Polish

---

## 📚 What Are We Learning Today?

Today we're learning about **AI Integration Testing & Cleanup** — how to verify Week 2 deliverables end-to-end, run compliance checks, and perform cleanup before closing the AI Integration phase. Think of it like **a final inspection before handing the receptionist desk to the next shift** — we run through intent detection, conversation flow, patient collection, consent, and revocation; we verify no PHI leaks into logs; we fix any dead code or missing docs.

We'll learn about:
1. **Intent detection verification** – Unit tests, mocked OpenAI integration, fallback to unknown, no PHI in logs
2. **Conversation flow verification** – Multi-turn state, stored messages, audit metadata only
3. **Patient collection and consent verification** – Full flow, consent denied, revocation (PHI anonymized), Zod validation
4. **Compliance checklist** – No PHI in logs, AI audit metadata only, consent before persist, RLS, encryption
5. **Cleanup** – Dead code, types, README env vars, DB_SCHEMA, type-check and lint
6. **Definition of Done** – Acceptance criteria, test pass, completion date

---

## 🎓 Topic 1: Intent Detection Verification

### What to Verify

- **Unit tests** – Run existing intent detection tests (Task 2 / ai-service)
- **Intent mapping** – Sample messages map correctly: greeting, book_appointment, ask_question, revoke_consent, unknown
- **Fallback** – When OpenAI fails or key missing, intent falls back to `unknown`; no PHI in logs

### Integration Option

Optionally add or run an integration test with **mocked OpenAI** to verify intent mapping without calling the real API. Mock the OpenAI client so tests are fast and deterministic.

### No PHI Rule

Intent detection receives user messages (may contain PHI). Verify:
- PHI is redacted before sending to OpenAI (redactPhiForAI)
- Logs and audit entries contain only metadata (model, tokens, redaction flag) — never raw prompt or response with PHI

**Think of it like:**
- **Intent tests** = "Did the receptionist correctly understand 'I want to book' vs 'Delete my data' vs 'Hello'?"

---

## 🎓 Topic 2: Conversation Flow Verification

### Multi-Turn State

- Send a sequence of messages (e.g. greeting → book_appointment → name → phone)
- Verify `conversations.metadata` (state) is updated: step, collectedFields, lastIntent
- Verify responses use context (history, current step)

### No PHI in Persistence

- Conversation and messages are stored in DB
- **No raw prompts or responses with PHI** in DB or application logs
- Messages table stores content (encrypted at rest) but logs must never dump message content

### Audit Entries

- AI calls are audited
- Audit entries contain: correlationId, model, tokens, redaction flag
- **No PHI** in audit metadata (COMPLIANCE D, G)

**Think of it like:**
- **Flow tests** = "Does the receptionist remember what we talked about and ask for the next piece of info?"

---

## 🎓 Topic 3: Patient Collection and Consent Verification

### Full Flow

- Collect name, phone, (optional: DOB, gender) → ask consent → persist only after consent granted
- Verify patient row is created/updated only when user says "yes"
- Verify clearCollectedData is called after persist

### Consent Denied

- When user says "no," no patient PHI is persisted
- clearCollectedData is called
- State transitions off consent; user gets confirmation that nothing was stored

### Consent Revoked

- When user says "delete my data" or "revoke consent," revocation is recorded
- PHI is **anonymized** per COMPLIANCE F: name→[Anonymized], phone→revoked-{id}, DOB/gender nulled
- Audit log records revoked status (metadata only)

### Zod Validation

- Invalid phone or name is rejected by Zod
- User gets a clear, deterministic error message (no raw PHI in response)

### No PII in Logs

- All audit events use metadata only (field names, status, IDs — never values)

**Think of it like:**
- **Collection/consent tests** = "Does the receptionist collect info correctly, ask for consent, and only file the folder when the patient agrees? When they say no or revoke, does the receptionist shred the sticky note?"

---

## 🎓 Topic 4: Compliance Checklist

### No PHI in Logs

- Application logs contain only: correlationId, IDs, standard fields (path, method, statusCode, durationMs)
- Never log patient names, phones, DOBs, or message content

### AI Audit

- All AI calls are audited
- Metadata only: model, tokens, redaction flag, correlationId
- No raw prompt or response with PHI stored

### Consent Before PHI Persist

- PHI is never persisted without consent
- Consent status and timestamp are stored (consent_status, consent_granted_at, consent_method)

### RLS

- Doctor-only access to patients
- Verified via test or manual check in test environment

### Encryption

- Data classification and encryption at rest/transit noted or verified per COMPLIANCE.md

**Think of it like:**
- **Compliance** = "Did we pass the privacy and audit checklist for healthcare?"

---

## 🎓 Topic 5: Cleanup

### Dead Code

- Remove or fix any dead code introduced in Tasks 1–5
- Unused imports, orphaned functions, obsolete branches

### Types

- Ensure types are exported where needed
- No unused imports

### README / Docs

- Update if env vars are undocumented:
  - OPENAI_API_KEY (AI features)
  - REDIS_URL (webhook queue)
  - DEFAULT_DOCTOR_ID (conversation flow)
  - ENCRYPTION_KEY (dead letter payloads)

### Test Suite

- Run type-check, lint, and full test suite
- Optionally run `npm run test:coverage`; aim for 80%+ where feasible
- Fix any failures

### DB_SCHEMA.md

- Verify DB_SCHEMA.md documents patients consent columns from migrations 005 and 006 (consent_status, consent_granted_at, consent_method, consent_revoked_at)

**Think of it like:**
- **Cleanup** = "Tidy the desk, update the manual, make sure everything builds and tests pass."

---

## 🎓 Topic 6: Definition of Done

### Acceptance Criteria

- Intent detection and conversation flow tested and passing
- Patient collection and consent flow tested; consent-before-persist and revocation verified
- Compliance checklist completed and documented
- Cleanup done; type-check and lint pass; test suite green

### Completion Recording

- Completion date recorded on Task 6
- README or daily plan updated when marking Week 2 complete

### No New Features

- Task 6 is verification and polish only
- No new features; STANDARDS.md and COMPLIANCE.md are the acceptance baseline

**Think of it like:**
- **Definition of Done** = "Checklist signed off; handover ready for Week 3."

---

## 📝 Summary

### Key Takeaways

1. **Intent verification** – Unit tests, optional mocked integration; fallback to unknown; no PHI in logs.
2. **Conversation flow** – Multi-turn state, stored messages, audit metadata only.
3. **Collection/consent** – Full flow, consent denied, revocation (anonymize PHI), Zod validation, no PII in logs.
4. **Compliance** – No PHI in logs; AI audit metadata only; consent before persist; RLS; encryption.
5. **Cleanup** – Dead code, types, README env vars, DB_SCHEMA, type-check, lint, tests.
6. **Definition of Done** – All criteria satisfied; completion date recorded.

### Next Steps

After completing this task:

1. Week 2 (AI Integration & Conversation Flow) is closed.
2. Week 3 (Booking & Payments) can start.
3. Integration tests (e.g. webhook flow) may require server running; see `docs/testing/webhook-testing-guide.md`.

### Remember

- **No PHI in logs** – Only IDs and metadata.
- **Fake placeholders in tests** – Use PATIENT_TEST, +10000000000 per TESTING.md.
- **Mock external services** – OpenAI, Instagram in unit/integration tests where appropriate.

---

**Last Updated:** 2026-01-30  
**Related Task:** [Task 6: AI Integration Testing & Cleanup](../../Development/Daily-plans/2026-01-30/e-task-6-ai-integration-testing-and-cleanup.md)  
**Reference Documentation:**
- [TESTING.md](../../Reference/TESTING.md)
- [STANDARDS.md](../../Reference/STANDARDS.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md)
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md)
- [webhook-testing-guide.md](../../testing/webhook-testing-guide.md)
