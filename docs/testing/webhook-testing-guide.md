# Webhook Testing Guide

Testing and verification for Instagram webhook integration (Task 7). Covers unit tests, integration scripts, test data rules, and how to run them.

**Related:** [TESTING.md](../Reference/TESTING.md) (PII placeholders, canonical responses), [WEBHOOKS.md](../Reference/WEBHOOKS.md) (flow, retry, dead letter), [e-task-7-webhook-testing.md](../Development/Daily-plans/2026-01-21/e-task-7-webhook-testing.md) (task breakdown).

---

## Test types

| Type | Where | How to run | When |
|------|--------|------------|------|
| **Unit (controller)** | `backend/tests/unit/controllers/webhook-controller.test.ts` | `npm test -- --testPathPattern=webhook-controller` | CI, local |
| **Unit (worker)** | `backend/tests/unit/workers/webhook-worker.test.ts` | `npm test -- --testPathPattern=webhook-worker` | CI, local |
| **Unit (queue)** | `backend/tests/unit/config/queue.test.ts` | `npm test -- --testPathPattern=queue` | CI, local |
| **Integration (server required)** | `backend/tests/integration/test-webhook-controller.ts` | `npx ts-node tests/integration/test-webhook-controller.ts` | Manual, server on BASE_URL |

---

## Unit tests (Jest)

### Webhook controller

- **GET verification:** Valid `hub.mode` + `hub.verify_token` → 200 + challenge; invalid token or mode → `next(UnauthorizedError)`.
- **POST flow:** Valid signature → `verify`, `isProcessed`, `markProcessing` called; invalid/missing signature → `logSecurityEvent`, queue not called.
- **Idempotency:** When `isWebhookProcessed` returns `{ status: 'processed' }` → 200, queue.add and markProcessing not called.
- **Performance (Task 7 §6.1):** POST with valid payload completes in &lt; 1s and returns 200 OK after queuing.

Dependencies (env, verification, idempotency, queue, audit, dead-letter) are mocked so no server or Redis is required.

### Webhook worker

- **Lifecycle when REDIS_URL unset:** `startWebhookWorker()` returns `null`; `getWebhookWorker()` returns `null`; `stopWebhookWorker()` does not throw.
- **Error handling (Task 7 §3.3):** `processWebhookJob` with invalid payload (no message) → mark processed, no send; with Instagram API error → markWebhookFailed, logAuditEvent failure, throws (retry then dead letter); `handleWebhookJobFailed` when attempts ≥ maxAttempts → storeDeadLetterWebhook; valid payload + send success → markWebhookProcessed, audit success.
- **Performance (Task 7 §6.2):** Concurrent `processWebhookJob` calls (multiple event IDs) all complete; each job gets correct `markWebhookProcessed` and audit log per `eventId` (no race conditions).

### Queue config

- **Placeholder path:** When REDIS_URL is unset, `isQueueEnabled()` is false, `getWebhookQueue()` returns placeholder, `webhookQueue.add()` does not throw.
- **Retry/backoff (Task 7 §3.3.3):** `DEFAULT_JOB_OPTIONS` has 3 attempts, exponential backoff, 60s initial delay.

---

## Integration tests (server required)

**Prerequisites:** Server running (e.g. `npm run dev`), `.env` with `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.

```bash
cd backend
npx ts-node tests/integration/test-webhook-controller.ts
```

Covers:

- GET verification (valid/invalid token).
- POST with valid signature (queuing, idempotency when repeated).
- Signature and rate-limit behavior.

Use **fake PHI placeholders** in any custom payloads (see TESTING.md).

---

## Test data (PII/PHI)

- Use placeholders only: `PATIENT_TEST`, `+10000000000`, `TEST_EMAIL@example.com`.
- Do not use real patient names, phones, or DOBs.
- Prefer structure assertions over exact PHI values.

---

## Scenarios checklist (Task 7)

| Area | Unit | Integration / manual |
|------|------|----------------------|
| GET verification (valid/invalid token) | ✅ | ✅ |
| POST valid signature → queue, 200 | Partial (verify/idempotency/markProcessing) | ✅ |
| POST invalid/missing signature → 401, logSecurity | ✅ | ✅ |
| Idempotent (already processed) | ✅ | ✅ |
| Worker start/stop when REDIS_URL unset | ✅ | N/A |
| Queue placeholder when REDIS_URL unset | ✅ | N/A |
| Error handling: idempotency/queue fail-open, dead letter | 3.1.3 (logging); code review | Integration |
| Worker: invalid payload, API error, retry, dead letter (3.3) | ✅ (processWebhookJob, handleWebhookJobFailed, queue backoff) | Optional E2E |
| **4. Retry logic:** transient error (4.1.1), 3 attempts + backoff (4.1.2–4.1.3), success after retry (4.1.4) | ✅ worker + queue unit tests | — |
| **4.2 Max retries:** dead letter storage, error + audit logging (4.2.1–4.2.4) | ✅ handleWebhookJobFailed + logAuditEvent (failure) | — |
| **6. Performance:** endpoint &lt; 1s + 200 after queue (6.1), concurrent worker jobs, no race conditions (6.2) | ✅ controller + worker unit tests | Optional |

---

## Quick commands

```bash
cd backend

# All webhook-related unit tests
npm test -- --testPathPattern="webhook|queue"

# Type-check and lint
npm run type-check
npm run lint
```

---

**Last updated:** 2026-01-28  
**Task:** e-task-7 (Webhook Testing & Verification)
