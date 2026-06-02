# Learning Topics - Webhook Processing Queue & Worker
## Task #6: Instagram Webhook Integration

---

## 📚 What Are We Learning Today?

Today we're learning about **Webhook Processing Queues and Workers** - the infrastructure that processes webhooks asynchronously so the HTTP layer can respond immediately. Think of it like **a hospital's triage and back-office** - the reception desk (controller) registers the visit and sends the patient file to the right department (queue); the back office (worker) processes the file, updates records, and sends follow-up messages. The visitor gets a quick "we've got you" (200 OK), while the real work happens in the background without blocking. This pattern is critical for handling high webhook volume and keeping API responses fast!

We'll learn about:
1. **Queue Pattern** - Why async processing and how it fits the webhook flow
2. **BullMQ + Redis** - Job queue library and backing store
3. **Worker Pattern** - Processing jobs independently from the HTTP layer
4. **Job Data Types** - Type-safe payloads for webhook jobs
5. **Retry Logic** - Exponential backoff and max attempts
6. **Dead Letter Queue** - Handling permanently failed jobs
7. **Worker Lifecycle** - Startup, shutdown, and error handling
8. **Compliance** - Audit logging and never logging payload content
9. **Integration** - How the worker uses idempotency, dead-letter, and Instagram services
10. **Testing Queues** - Verifying Redis, queue, and worker behavior

---

## 🎓 Topic 1: Queue Pattern

### What is the Queue Pattern?

**Queue Pattern** (also called *message queue* or *job queue*) is an architectural pattern where work is placed in a queue and processed asynchronously by one or more workers, instead of being done synchronously in the request/response cycle.

**Think of it like:**
- **Controller** = Reception (accepts webhook, validates, returns 200 OK fast)
- **Queue** = In-tray (holds jobs until a worker is free)
- **Worker** = Back office (processes jobs: conversation, message, send reply)

### Why Use a Queue for Webhooks?

| Without queue | With queue |
|---------------|------------|
| HTTP request waits for full processing | HTTP returns 200 OK immediately |
| Timeouts if processing is slow | No timeout risk for client |
| One failure can block others | Failed job can retry without blocking others |
| Hard to scale processing | Scale by adding workers |

**From WEBHOOKS.md:** Webhook processing MUST be async (queue-based). The controller queues the webhook and returns 200 OK; the worker processes it later.

### Architecture Flow

```
Instagram → POST /webhooks → Controller
                                ↓
                    1. Verify signature
                    2. Check idempotency
                    3. Mark as processing
                    4. Add job to queue  ←── Queue (Redis + BullMQ)
                    5. Return 200 OK
                                ↓
                        Worker (separate process/loop)
                                ↓
                    Process job: conversation, message, send via Instagram service
                    Mark idempotency complete, audit log
                    On failure: retry or dead-letter
```

**See:** [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Queue pattern section

---

## 🎓 Topic 2: BullMQ + Redis

### What is BullMQ?

**BullMQ** is a Node.js library for handling jobs using Redis. It provides:
- **Queue** – add jobs, optional priority/delay
- **Worker** – process jobs with concurrency, retries, and backoff
- **Jobs** – typed payloads, progress, and results

**Redis** is the backing store: it holds the job data, so queues and workers can run in different processes or machines.

### Why BullMQ (vs Bull, Agenda, etc.)?

- **BullMQ** – Modern, TypeScript-friendly, Redis-based, active maintenance
- **Bull** – Older sibling of BullMQ; BullMQ is the recommended successor
- **Agenda** – MongoDB-based; we use Redis for this project

### Key Concepts

| Concept | Role |
|--------|------|
| **Queue** | Producer side: `queue.add('jobName', data, opts)` |
| **Worker** | Consumer side: processes jobs, can retry/fail |
| **Job** | One unit of work (e.g. one webhook event) |
| **Connection** | Redis connection (shared by queue and worker) |

### Configuration (config/queue.ts)

- **REDIS_URL** – Environment variable for Redis (e.g. `redis://localhost:6379`)
- **Queue name** – e.g. `webhook-processing` (same name for queue and worker)
- **Connection** – Reuse one Redis connection for queue and worker where possible

**See:** [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md) for Redis and queue conventions

---

## 🎓 Topic 3: Worker Pattern

### What is the Worker?

The **worker** is the process (or loop) that:
1. Listens to the queue for new jobs
2. Runs the processor function for each job
3. Marks jobs as completed or failed
4. Applies retry/backoff on failure

**Workers MUST:**
- Use the same queue name and Redis connection as the queue
- Process one job type (e.g. webhook processing)
- Be stateless per job (job data carries all context)
- Log errors and use AppError where appropriate
- Not log payload content (PII/PHI)

**Workers MUST NOT:**
- Block the event loop (use async processor)
- Crash on single job failure (catch, log, throw for retry or fail)
- Log message content or PHI

### Concurrency

- **Concurrency** (e.g. 5) = how many jobs one worker processes at the same time
- Higher concurrency = more throughput, more Redis/API load
- Keep concurrency configurable (env or config)

### Example Worker Setup

```typescript
import { Worker } from 'bullmq';
import { redisConnection } from '../config/queue';

const worker = new Worker(
  'webhook-processing',
  async (job) => {
    const { eventId, provider, payload, correlationId } = job.data;
    // Process webhook: conversation, message, send reply
    // Mark idempotency, audit log
  },
  { connection: redisConnection, concurrency: 5 }
);
```

**See:** [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Worker pattern

---

## 🎓 Topic 4: Job Data Types

### Why Type Job Data?

- **Type safety** – Compile-time checks for `eventId`, `payload`, etc.
- **Contracts** – Same shape for controller (producer) and worker (consumer)
- **Refactoring** – Change one type, fix all usages

### WebhookJobData (types/queue.ts)

```typescript
export type WebhookProvider = 'instagram' | 'facebook' | 'whatsapp';

export interface WebhookJobData {
  eventId: string;
  provider: WebhookProvider;
  payload: InstagramWebhookPayload; // or generic object
  correlationId: string;
}
```

- **eventId** – Idempotency key (same as webhook event ID)
- **provider** – Which platform (instagram, etc.)
- **payload** – Webhook body (parsed); worker must never log this
- **correlationId** – Request correlation for logging/tracing

**See:** [CONTRACTS.md](../../Reference/engineering/architecture/CONTRACTS.md) for API and job contracts

---

## 🎓 Topic 5: Retry Logic

### Why Retry?

- **Transient failures** – Network blips, temporary 5xx, rate limits
- **At-least-once processing** – Retry so we don’t drop webhooks on flaky errors

### Retry Strategy (from WEBHOOKS.md)

- **Max attempts:** 3 (initial + 2 retries)
- **Backoff:** Exponential – e.g. 1 min, 5 min, 15 min
- **Retryable:** Network errors, 5xx, 429 (rate limit)
- **Non-retryable:** 4xx (bad request, unauthorized, etc.) → fail immediately and optionally dead-letter

### BullMQ Retry Options

```typescript
// When adding the job (controller side) or in worker defaultJobOptions
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 }, // 1 min, then 2 min, then 4 min (example)
}
```

Worker can also **throw** to trigger retry, or **move to failed** (then our code or BullMQ can send to dead-letter).

**See:** [WEBHOOKS.md](../../Reference/engineering/operations/WEBHOOKS.md) - Retry and dead-letter rules

---

## 🎓 Topic 6: Dead Letter Queue

### What is the Dead Letter Queue?

After **max retries**, the job is considered **permanently failed**. The **dead letter** path:
1. Store the failed job (e.g. event ID, payload reference, error, timestamp) in a persistent store
2. Use **dead-letter-service** (from Task 2) to record it
3. Audit log the failure
4. Optionally alert operations

**Payload:** Do not store raw payload in logs; store only metadata (event_id, provider, correlation_id, error message) and optionally a reference or hashed id for debugging.

### Integration with Dead Letter Service

- **dead-letter-service** – Already exists; worker calls it when max retries exceeded
- **Input** – Event ID, provider, correlation ID, error message, timestamp (no PII/payload content)
- **Output** – Record stored for ops review and replay if needed

**See:** [WEBHOOKS.md](../../Reference/engineering/operations/WEBHOOKS.md) - Dead letter handling  
**See:** Existing `services/dead-letter-service.ts`

---

## 🎓 Topic 7: Worker Lifecycle

### Startup

- Create worker **after** server/listeners are ready (e.g. in `index.ts` after HTTP server start)
- Connect to Redis and start processing
- On connection error: log and optionally exit or retry

### Shutdown (Graceful)

- On SIGTERM/SIGINT: stop accepting new jobs, wait for current jobs to finish, then close Redis connection
- BullMQ Worker supports `worker.close()` for graceful shutdown

### Error Handling

- **Job processor throws** → BullMQ marks job failed and may retry
- **Worker connection error** → Log, optionally reconnect or exit
- **Uncaught error in processor** → Caught by BullMQ; job fails and retries according to options
- **Prevent worker crash** – Wrap processor in try/catch; log and rethrow or fail job so one bad job doesn’t kill the worker

**See:** [SAFE_DEFAULTS.md](../../Reference/engineering/development/SAFE_DEFAULTS.md) for shutdown and error handling

---

## 🎓 Topic 8: Compliance (Audit & No PHI in Logs)

### Audit Logging

- **Every webhook processing** (success or failure) must be auditable
- **Log:** event_id, provider, correlation_id, status (success/failure), timestamp
- **Do not log:** message content, payload body, or any PII/PHI

### Worker Compliance Checklist

- [ ] Log "webhook processed" (or "webhook failed") with metadata only
- [ ] Use **audit-logger** (e.g. `logAuditEvent`) for compliance events
- [ ] Never `logger.info(payload)` or log message text
- [ ] Dead-letter records: metadata and error only, no payload content

**See:** [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - Audit and logging requirements

---

## 🎓 Topic 9: Integration with Other Services

### How the Worker Uses Existing Code

| Dependency | Use in worker |
|------------|----------------|
| **webhook-idempotency-service** | Mark webhook as processed after successful handling |
| **dead-letter-service** | Store failed job metadata after max retries |
| **audit-logger** | Log webhook processed / failed (metadata only) |
| **Instagram service** | Send reply message to user (from Task 5) |
| **Conversation / message services** | Create or update conversation and message records (when implemented) |

### Flow Inside the Worker

1. **Parse job data** – eventId, provider, payload, correlationId
2. **Parse payload** – e.g. Instagram message, sender ID, message text
3. **Business logic** – Create conversation/message (or placeholder), decide reply (placeholder for now; AI later)
4. **Send reply** – Call Instagram service to send message
5. **Mark idempotency** – Mark this event_id as processed
6. **Audit log** – "Webhook processed" with metadata
7. **On error** – Log, then throw (retry) or send to dead-letter (after max retries)

**See:** [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Service dependencies

---

## 🎓 Topic 10: Testing Queues

### What to Test

- **Redis connection** – Queue and worker can connect
- **Queue creation** – Add a job, verify it’s in Redis (or processed)
- **Worker processing** – Add test job, assert worker runs processor and completes
- **Idempotency** – After successful run, webhook is marked processed
- **Audit log** – Compliance event logged with metadata only
- **Retries** – Transient error causes retry; backoff respected (or mocked)
- **Dead letter** – After max retries, dead-letter service is called with metadata only
- **Type-check and lint** – `npm run type-check`, `npm run lint`

### Testing Strategies

- **Unit tests** – Mock Redis/BullMQ; test processor function with fake job data
- **Integration tests** – Real Redis (e.g. local or test container); add job, assert worker processes it and side effects (idempotency, audit, Instagram mock) occur
- **No PHI in logs** – Assert log calls never include payload or message content

**See:** [TESTING.md](../../Reference/engineering/development/TESTING.md) for testing standards

---

## ✅ Quick Reference

| Item | Reference |
|------|-----------|
| Queue name | `webhook-processing` |
| Retry | 3 attempts, exponential backoff (e.g. 1 min, 5 min, 15 min) |
| Concurrency | Configurable (e.g. 5) |
| Job data | eventId, provider, payload, correlationId |
| Compliance | Audit every processing; never log payload/message content |
| Dead letter | Use dead-letter-service after max retries |

---

## 🔗 Related Docs

- [WEBHOOKS.md](../../Reference/engineering/operations/WEBHOOKS.md) – Webhook flow, retry, dead letter
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) – Queue and worker patterns
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) – Audit and PHI
- [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md) – Redis and queue
- [e-task-6-webhook-queue.md](../../Work/Daily-plans/2026-01-21/e-task-6-webhook-queue.md) – Task breakdown

---

**Last Updated:** 2026-01-28  
**Related Task:** Task 6 – Webhook Processing Queue & Worker  
**Pattern:** Queue pattern, worker pattern, retry pattern, dead letter pattern
