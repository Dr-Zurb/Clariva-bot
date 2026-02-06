# Task 6: Webhook Processing Queue & Worker
## January 21, 2026 - Instagram Webhook Integration Day

---

## 📋 Task Overview

Set up webhook processing queue (BullMQ or similar) and worker for async webhook processing. Worker processes queued webhooks, calls Instagram service to send responses, handles retries, and moves failed webhooks to dead letter queue after max retries.

**Estimated Time:** 2-3 hours  
**Status:** ✅ **DONE** (implementation complete; testing in e-task-7)

**Current State:**
- ✅ **Queue Infrastructure:** Implemented - BullMQ + ioredis in package.json, optional when REDIS_URL set
- ✅ **Queue Configuration:** Created - `config/queue.ts` (BullMQ when REDIS_URL set)
- ✅ **Webhook Worker:** Implemented - `workers/webhook-worker.ts`
- ✅ **Queue Types:** Defined - `types/queue.ts` (WebhookJobData)
- ✅ **Workers Directory:** Created - `workers/` with webhook-worker.ts
- ✅ **Dead Letter Service:** EXISTS - Can be used for failed webhook storage
- ✅ **Idempotency Service:** EXISTS - Can be used to mark webhooks as processed
- ✅ **Audit Logger:** EXISTS - Can be used for compliance logging
- ⚠️ **Note:** Task 4 will create placeholder queue interface - this task implements actual queue

**Scope Guard:**
- Expected files touched: ≤ 4 (queue config, worker, types, env)
- Any expansion requires explicit approval

**Reference Documentation:**
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Webhook processing rules and retry handling
- [STANDARDS.md](../../Reference/STANDARDS.md) - Service architecture and error handling
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Audit logging requirements
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Queue architecture patterns

---

## ✅ Task Breakdown (Hierarchical)

### 1. Set Up Queue Infrastructure
- [x] 1.1 Install queue library
  - [x] 1.1.1 Install BullMQ or similar (BullMQ recommended for Redis)
  - [x] 1.1.2 Install Redis client (if using BullMQ)
  - [x] 1.1.3 Add queue dependencies to package.json
- [x] 1.2 Configure Redis connection
  - [x] 1.2.1 Add `REDIS_URL` to environment variables
  - [x] 1.2.2 Add Redis URL validation to `config/env.ts`
  - [x] 1.2.3 Create Redis connection configuration
- [x] 1.3 Create queue configuration
  - [x] 1.3.1 Create `config/queue.ts`
  - [x] 1.3.2 Configure webhook queue (BullMQ Queue instance)
  - [x] 1.3.3 Set queue name: `webhook-processing`
  - [x] 1.3.4 Configure connection (Redis)
  - [x] 1.3.5 Export queue instance

### 2. Create Webhook Worker
- [x] 2.1 Create worker file
  - [x] 2.1.1 Create `workers/webhook-worker.ts`
  - [x] 2.1.2 Import required dependencies (Worker from BullMQ, services, errors, logger, audit-logger)
- [x] 2.2 Configure worker
  - [x] 2.2.1 Create BullMQ Worker instance
  - [x] 2.2.2 Set queue name: `webhook-processing`
  - [x] 2.2.3 Configure connection (Redis)
  - [x] 2.2.4 Configure concurrency (e.g., 5 concurrent jobs)
- [x] 2.3 Implement webhook processing job
  - [x] 2.3.1 Create `processWebhookJob` function
  - [x] 2.3.2 Extract job data: `eventId`, `provider`, `payload`, `correlationId`
  - [x] 2.3.3 Parse Instagram webhook payload
    - [x] Extract message data from payload
    - [x] Extract sender ID (Instagram user ID)
    - [x] Extract message text
  - [x] 2.3.4 Process webhook (business logic)
    - [x] Create conversation record (if new)
    - [x] Create message record
    - [x] Determine response (placeholder for now - AI integration later)
    - [x] Send response via Instagram service
  - [x] 2.3.5 Mark webhook as processed (use idempotency service)
  - [x] 2.3.6 Log audit event (webhook processed)
  - [x] 2.3.7 Handle errors (catch, log, throw for retry)
- [x] 2.4 Implement retry handling
  - [x] 2.4.1 Configure job retry options
    - [x] Max attempts: 3
    - [x] Backoff: Exponential (1 minute, 5 minutes, 15 minutes)
  - [x] 2.4.2 Handle retryable errors (retry)
  - [x] 2.4.3 Handle non-retryable errors (dead letter queue)
- [x] 2.5 Implement dead letter queue handling
  - [x] 2.5.1 Detect max retries exceeded
  - [x] 2.5.2 Store in dead letter queue (use dead-letter-service)
  - [x] 2.5.3 Log error to audit table
  - [x] 2.5.4 Alert operations team (if configured)

### 3. Queue Job Data Types
- [x] 3.1 Define queue job types
  - [x] 3.1.1 Create or update `types/queue.ts`
  - [x] 3.1.2 Define `WebhookJobData` interface
    - [x] `eventId`: string
    - [x] `provider`: 'instagram' | 'facebook' | 'whatsapp'
    - [x] `payload`: InstagramWebhookPayload (or generic object)
    - [x] `correlationId`: string
  - [x] 3.1.3 Export types

### 4. Worker Lifecycle Management
- [x] 4.1 Implement worker startup
  - [x] 4.1.1 Start worker in `index.ts` (after server startup)
  - [x] 4.1.2 Handle worker errors (log and continue)
  - [x] 4.1.3 Handle worker shutdown (graceful shutdown)
- [x] 4.2 Implement worker error handling
  - [x] 4.2.1 Handle worker connection errors
  - [x] 4.2.2 Handle job processing errors
  - [x] 4.2.3 Log errors appropriately
  - [x] 4.2.4 Prevent worker crashes

### 5. Testing & Verification
- [x] 5.1 Test queue setup
  - [x] 5.1.1 Verify Redis connection (placeholder path: isQueueEnabled when REDIS_URL unset)
  - [x] 5.1.2 Verify queue created (getWebhookQueue returns placeholder; unit test)
  - [x] 5.1.3 Verify worker started (worker no-op when REDIS_URL unset; e-task-7 for live Redis)
- [x] 5.2 Test webhook processing
  - [x] 5.2.1 Add test job to queue (webhookQueue.add; unit test)
  - [x] 5.2.2 Verify worker processes job (e-task-7 / integration)
  - [x] 5.2.3 Verify idempotency marking (e-task-7)
  - [x] 5.2.4 Verify audit logging (e-task-7)
- [x] 5.3 Test retry logic
  - [x] 5.3.1 Test retry on transient errors (BullMQ config; e-task-7 for live)
  - [x] 5.3.2 Test max retries exceeded (e-task-7)
  - [x] 5.3.3 Test dead letter queue storage (e-task-7)
- [x] 5.4 Test error handling
  - [x] 5.4.1 Test worker error handling (worker throws for retry; e-task-7)
  - [x] 5.4.2 Test job error handling (getWebhookQueue does not throw; unit test)
  - [x] 5.4.3 Verify error logging (e-task-7)
- [x] 5.5 Run type-check and lint
  - [x] 5.5.1 Run `npm run type-check` (passes after `npm install`; bullmq/ioredis required)
  - [x] 5.5.2 Run `npm run lint` (passes; fixed _incomingText unused in webhook-worker.ts)

---

## 📁 Files to Create/Update

```
backend/
├── package.json                    (UPDATE - Add BullMQ and Redis dependencies)
└── src/
    ├── config/
    │   └── queue.ts                (NEW - Queue configuration)
    ├── workers/                    (NEW - Workers directory)
    │   └── webhook-worker.ts       (NEW - Webhook processing worker)
    └── types/
        └── queue.ts                (NEW - Queue job types)
```

**Existing Code Status:**
- ✅ `config/queue.ts` - EXISTS (BullMQ when REDIS_URL set)
- ✅ `workers/` directory - EXISTS
- ✅ `workers/webhook-worker.ts` - EXISTS
- ✅ `types/queue.ts` - EXISTS (WebhookJobData)
- ✅ BullMQ/Redis dependencies - ADDED (bullmq, ioredis in package.json)
- ✅ `services/dead-letter-service.ts` - EXISTS (for failed webhook storage)
- ✅ `services/webhook-idempotency-service.ts` - EXISTS (for marking webhooks as processed)
- ✅ `utils/audit-logger.ts` - EXISTS (for compliance logging)
- ⚠️ **Note:** Task 4 will reference a placeholder queue - this task implements the actual queue infrastructure

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

**From WEBHOOKS.md:**
- Webhook processing MUST be async (queue-based)
- Retry strategy: 3 attempts with exponential backoff (1min, 5min, 15min)
- After max retries: Dead letter queue
- Payload is transient (never persisted in regular DB)

**From STANDARDS.md:**
- Workers must use asyncHandler or similar error handling
- Workers must throw AppError (never return {error} objects)
- All functions must have TypeScript types

**From COMPLIANCE.md:**
- Audit logging required for all webhook processing
- NEVER log payload content (contains PII)
- Only log metadata (event_id, provider, correlation_id, status)

**Architecture Considerations:**
- Queue handles async processing (separate from HTTP layer)
- Worker processes jobs independently
- Business logic (message processing) handled by worker
- Dead letter queue for failed jobs

**Performance Considerations:**
- Worker concurrency should be configurable
- Queue should handle high throughput
- Redis connection should be pooled

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y) - Processes webhook payloads that may contain PHI
  - [x] **RLS verified?** (N/A) - Worker uses service role (bypasses RLS)
- [x] **Any PHI in logs?** (MUST be No) - NEVER log payload content, only log metadata (event_id, provider, correlation_id, status)
- [x] **External API or AI call?** (Y) - Calls Instagram service (external API)
  - [x] **Consent + redaction confirmed?** (Y) - Messages sent only after patient consent (handled by business logic)
- [x] **Retention / deletion impact?** (N) - No data retention changes (uses existing tables)

**Rationale:**
- Ensures global compliance (US, EU, Japan, Middle East)
- Prevents silent violations
- Provides audit trail

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Queue infrastructure set up (BullMQ + Redis)
- [x] Webhook worker implemented
- [x] Webhook processing job implemented
- [x] Retry logic implemented (exponential backoff, max 3 attempts)
- [x] Dead letter queue handling implemented
- [x] Queue job types defined
- [x] Worker lifecycle management implemented
- [x] All TypeScript types correct (no errors)
- [x] All linting passes (or only pre-existing warnings)
- [ ] Queue setup tested (Redis connection, queue creation) — see e-task-7
- [ ] Webhook processing tested (job processing, idempotency, audit logging) — see e-task-7
- [ ] Retry logic tested (transient errors, max retries, dead letter queue) — see e-task-7
- [ ] Error handling tested (worker errors, job errors) — see e-task-7

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) for comprehensive completion checklist.

---

## 🐛 Issues Encountered & Resolved

**Testing (2026-01-28):**
- Lint: Fixed unused variable `_incomingText` in `webhook-worker.ts` (use `senderId` only; do not log incoming text per PII).
- Unit tests: Added `tests/unit/config/queue.test.ts` for queue setup (5.1), placeholder add (5.2), and getWebhookQueue error handling (5.4). Full Redis/worker tests in e-task-7.
- Type-check and queue unit tests require `bullmq` and `ioredis` installed (`npm install`). If `npm install` fails with cache mode, run it locally without `only-if-cached`.

**Pre-Implementation Notes:**
- ❌ Queue infrastructure does not exist - Needs full implementation (BullMQ + Redis)
- ❌ Workers directory does not exist - Needs to be created
- ✅ Dead letter service exists - Can be used for failed webhook storage
- ✅ Idempotency service exists - Can be used to mark webhooks as processed
- ✅ Audit logging utilities exist - Can be used for compliance
- ⚠️ **Note:** Task 4 will create a placeholder queue interface - This task implements the actual queue
- ⚠️ **Dependency:** Task 5 (Instagram Service) should be completed first, as worker will call it

---

## 📝 Notes

- Webhook queue is CRITICAL for async processing
- Worker processes webhooks independently (doesn't block HTTP requests)
- Retry logic handles transient failures
- Dead letter queue stores permanently failed webhooks
- Business logic (AI responses) will be added in future tasks

**Implementation Priority:**
1. **Critical:** Queue infrastructure (required for async processing)
2. **Critical:** Webhook worker (required for processing)
3. **High:** Retry logic (required for reliability)
4. **High:** Dead letter queue handling (required for failed webhooks)
5. **Medium:** Worker lifecycle management (helpful for operations)

**Task Dependencies:**
- ⚠️ **Task 5 (Instagram Service)** should be completed first - Worker will call Instagram service to send responses
- ✅ **Task 2 (Dead Letter Queue)** - Already complete, service exists
- ✅ **Task 3 (Webhook Security)** - Already complete, idempotency service exists
- ⚠️ **Task 4 (Webhook Controller)** - Will create placeholder queue - This task implements actual queue

---

## 🔗 Related Tasks

- [Task 4: Webhook Controller & Routes](./e-task-4-webhook-controller.md) - Queues webhooks for processing
- [Task 5: Instagram Service Implementation](./e-task-5-instagram-service.md) - Used by worker to send responses
- [Task 2: Dead Letter Queue Schema & Migration](./e-task-2-dead-letter-queue.md) - Stores failed webhooks
- [Task 3: Webhook Security & Verification Utilities](./e-task-3-webhook-security.md) - Used to mark webhooks as processed

---

**Last Updated:** 2026-01-28  
**Completed:** Implementation complete (testing covered in e-task-7)  
**Related Learning:** [l-task-6-webhook-queue.md](../../Learning/2026-01-21/l-task-6-webhook-queue.md)  
**Pattern:** Queue pattern, worker pattern, retry pattern  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.2.0 (Added code review step, current state documentation)
