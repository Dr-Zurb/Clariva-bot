# Learning Topics - Webhook Testing & Verification
## Task #7: Instagram Webhook Integration

---

## 📚 What Are We Learning Today?

Today we're learning about **Webhook Testing & Verification** - how to validate that the full Instagram webhook integration works end-to-end: from receiving a webhook, verifying it, queuing it, processing it in the worker, and meeting security and compliance requirements. Think of it like **a hospital's quality assurance** - we run checklists to ensure the reception (controller), triage (queue), and back office (worker) all work correctly together; we verify that only the right people get in (signature), that we don't double-count visits (idempotency), that we respond quickly (performance), and that we never leave sensitive data in the wrong place (compliance).

We'll learn about:
1. **End-to-End Webhook Flow Testing** - Testing the complete path from POST to processed
2. **Security Testing** - Signature verification and rate limiting
3. **Error Handling Testing** - Idempotency, queue, and worker failures
4. **Retry Logic Testing** - Transient errors, max retries, dead letter queue
5. **Compliance Verification** - PII redaction, audit logging, mandatory measures
6. **Performance Testing** - Response time and worker throughput
7. **Test Data & Documentation** - Fake PHI placeholders and test documentation
8. **Reference Documentation Compliance** - Aligning tests with WEBHOOKS, COMPLIANCE, STANDARDS

---

## 🎓 Topic 1: End-to-End Webhook Flow Testing

### What is E2E Webhook Flow Testing?

**End-to-end (E2E) webhook flow testing** means sending a real-looking webhook request through the full stack and asserting that every step behaves correctly: signature check, idempotency check, queuing, worker processing, idempotency marking, audit logging, and (when mocked) Instagram reply.

**Think of it like:** A full dress rehearsal - one request goes from "Instagram sent this" to "we replied and logged it," and we verify each step.

### What to Test

| Step | What to verify |
|------|----------------|
| **POST /webhooks/instagram** | Valid body + valid signature → 200 OK, webhook queued |
| **Signature verification** | Request passes when signature is correct |
| **Webhook queued** | Job appears in queue (or placeholder log when REDIS_URL unset) |
| **Worker processes** | Worker picks up job, runs processor (when Redis available) |
| **Idempotency** | Webhook marked as processed after success |
| **Audit logging** | "Webhook received" and "Webhook processed" with metadata only |
| **Instagram reply** | Send call made (mock in tests; no real API) |

### GET Verification (Challenge)

Instagram (and Facebook) require a **GET** request for webhook URL verification. We must:

- Respond to GET with `hub.verify_token` and return `hub.challenge` when the token matches.
- Return 403 when the verify token is wrong or missing.

**See:** [WEBHOOKS.md](../../Reference/WEBHOOKS.md) – Webhook flow and verification

---

## 🎓 Topic 2: Security Testing

### Signature Verification

Every POST webhook **MUST** be verified using the `X-Hub-Signature-256` header (HMAC-SHA256 of raw body with app secret). Tests should cover:

| Scenario | Expected |
|----------|----------|
| Valid signature | 200 OK, webhook processed (or queued) |
| Invalid signature | 401 Unauthorized |
| Missing signature header | 401 Unauthorized |
| Malformed signature | 401 Unauthorized |

**Critical:** Security events (e.g. signature failure) must be logged; **never** log `req.body` (contains PII/PHI).

### Rate Limiting

Webhook endpoints should be rate-limited to prevent abuse. Tests should verify:

- Requests over the limit receive **429 Too Many Requests**.
- Rate limit violations are logged.
- Response headers indicate rate limit state (e.g. `X-RateLimit-*` if implemented).

**See:** [STANDARDS.md](../../Reference/STANDARDS.md) – Security and rate limiting

---

## 🎓 Topic 3: Error Handling Testing

### Idempotency Service Errors

When the idempotency service fails (e.g. database unavailable), the system must behave according to policy (fail open vs fail closed). Tests should:

- Mock database/connection errors.
- Assert the chosen behavior (e.g. reject request or queue anyway) and that errors are logged.

### Queue Errors

When Redis is unavailable or queue fails:

- Controller may fall back to placeholder (log only) or return an error, per design.
- Tests can mock Redis failure and assert error handling and logging.

### Worker Processing Errors

When the worker fails (e.g. invalid payload, Instagram API error):

- Worker should throw so BullMQ can retry (transient) or move to dead letter (after max retries).
- Tests should verify retry count, backoff, and dead-letter storage (with no PHI in stored payload or logs).

**See:** [WEBHOOKS.md](../../Reference/WEBHOOKS.md) – Error handling and dead letter

---

## 🎓 Topic 4: Retry Logic Testing

### Transient Errors

For retryable errors (e.g. 429, 5xx from Instagram):

- Verify the worker (or sender) retries up to the configured number (e.g. 3 attempts).
- Verify exponential backoff delays (e.g. 1 min, 2 min, 4 min or per WEBHOOKS.md).
- Verify success path after a retry succeeds.

### Max Retries Exceeded

When all retries fail:

- Job is moved to the dead letter queue (or equivalent).
- Audit log records webhook failure (metadata only).
- Stored payload is encrypted; no PHI in logs.

**See:** [WEBHOOKS.md](../../Reference/WEBHOOKS.md) – Retry strategy and dead letter

---

## 🎓 Topic 5: Compliance Verification

### PII/PHI Redaction

**MUST be verified:**

- No `req.body` or raw payload content in application or audit logs.
- Only metadata in logs: e.g. `event_id`, `provider`, `correlation_id`, `status`.
- Test data uses fake PHI placeholders (e.g. PATIENT_TEST, +10000000000) per TESTING.md.

### Audit Logging

Verify that audit events are logged for:

- Webhook received (with metadata).
- Webhook processed (success/failure, metadata only).
- Signature verification failures.
- Rate limit violations.

### Mandatory Measures

Confirm that the implementation enforces:

- Signature verification is **mandatory** (no bypass).
- Idempotency check is **mandatory**.
- Rate limiting is **mandatory** on webhook endpoints.
- Processing is **async** (queue-based); no long-running work in the request handler.

**See:** [COMPLIANCE.md](../../Reference/COMPLIANCE.md) – Audit and PHI handling  
**See:** [TESTING.md](../../Reference/TESTING.md) – Test data and PHI placeholders

---

## 🎓 Topic 6: Performance Testing

### Webhook Response Time

- The webhook endpoint should respond quickly (e.g. &lt; 1 second) after validating and queuing.
- Client receives **200 OK** as soon as the webhook is accepted/queued, not after worker completion.

### Worker Throughput

- With multiple webhooks, the worker should process jobs (concurrency as configured).
- No race conditions on idempotency or shared state; tests can use concurrent requests or jobs to validate.

**See:** [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) – Performance and scalability

---

## 🎓 Topic 7: Test Data & Documentation

### Test Data Rules (TESTING.md)

- Use **fake PHI placeholders** only (e.g. PATIENT_TEST, +10000000000, fake DOBs).
- No real patient names, phones, or identifiers in test code or fixtures.
- Test failure output must not expose PHI; assert on structure or non-PII fields where possible.

### Test Documentation

- Document test scenarios (what is being tested and why).
- Document test data conventions (placeholders, no real PHI).
- Record test results (e.g. in a testing guide or CI summary) for traceability.

**See:** [TESTING.md](../../Reference/TESTING.md) – Test data compliance

---

## 🎓 Topic 8: Reference Documentation Compliance

Tests and implementation should align with:

| Document | What to verify |
|----------|----------------|
| **RECIPES.md** | R-WEBHOOK-001 pattern (signature → event ID → idempotency → queue → 200 OK) |
| **WEBHOOKS.md** | Async processing, retry strategy, dead letter, no PHI in logs |
| **COMPLIANCE.md** | Audit events, PII redaction, security logging |
| **STANDARDS.md** | Error handling, types, controller/service separation |

Final verification typically includes:

- `npm run type-check` passes.
- `npm run lint` passes (or only pre-existing warnings).
- All acceptance criteria for Tasks 4–7 are covered by tests or manual checks.

**See:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) – Completion checklist

---

## ✅ Quick Reference

| Area | What to test / verify |
|------|----------------------|
| **E2E flow** | POST → verify → queue → worker → idempotency → audit → (mock) reply |
| **GET** | Verify token + challenge; 403 on invalid token |
| **Signature** | Valid → 200; invalid/missing/malformed → 401; security logged, no body logged |
| **Rate limit** | Over limit → 429; violations logged |
| **Errors** | Idempotency/queue/worker failures handled and logged |
| **Retry** | 3 attempts, exponential backoff; dead letter after max retries; no PHI in logs |
| **Compliance** | No PHI in logs; audit for received/processed/failed/signature/rate limit |
| **Performance** | Fast response (&lt; 1s); 200 OK after queue; worker throughput |
| **Test data** | Fake PHI placeholders only; document scenarios and results |

---

## 🔗 Related Docs

- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) – Webhook flow, retry, dead letter
- [TESTING.md](../../Reference/TESTING.md) – Test data and PHI placeholders
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) – Audit and PII redaction
- [STANDARDS.md](../../Reference/STANDARDS.md) – Security and error handling
- [e-task-7-webhook-testing.md](../../Development/Daily-plans/2026-01-21/e-task-7-webhook-testing.md) – Task breakdown

---

**Last Updated:** 2026-01-28  
**Related Task:** Task 7 – Webhook Testing & Verification  
**Pattern:** Testing pattern, integration testing pattern, E2E testing pattern
