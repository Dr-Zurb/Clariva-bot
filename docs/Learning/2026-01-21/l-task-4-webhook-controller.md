# Learning Topics - Webhook Controller & Routes
## Task #4: Instagram Webhook Integration

---

## 📚 What Are We Learning Today?

Today we're learning about **Webhook Controllers** - the HTTP layer that receives webhooks from Instagram/Facebook, verifies their authenticity, ensures they're processed exactly once, and queues them for async processing. Think of it like **a hospital's reception desk** - we verify the visitor's identity (signature verification), check if we've already seen them (idempotency), register them quickly (mark as processing), send them to the right department (queue for processing), and confirm receipt immediately (return 200 OK fast). This ensures webhooks are handled securely, reliably, and efficiently!

We'll learn about:
1. **Controller Pattern** - HTTP request/response handling architecture
2. **Webhook Flow** - The 6-step mandatory process for handling webhooks
3. **Signature Verification** - Verifying webhooks are legitimate (uses Task 3 utilities)
4. **Idempotency Checking** - Preventing duplicate processing (uses Task 3 utilities)
5. **Webhook Verification Handler** - Facebook's GET request verification protocol
6. **Async Processing** - Queueing webhooks for background processing
7. **Rate Limiting** - Protecting endpoints from abuse
8. **Audit Logging** - Compliance requirements for webhook events
9. **Error Handling** - Graceful failure handling
10. **Response Format** - Standardized API responses

---

## 🎓 Topic 1: Controller Pattern

### What is the Controller Pattern?

**Controller Pattern** is an architectural pattern that separates HTTP request/response handling (controllers) from business logic (services) and route definitions (routes).

**Think of it like:**
- **Routes** = Hospital directory (defines paths: "Appointments on floor 3")
- **Controllers** = Reception desk (handles incoming requests, validates, delegates)
- **Services** = Medical departments (business logic, no HTTP knowledge)

### Architecture Layers

```
HTTP Request
    ↓
routes/*.ts (defines path, mounts controller)
    ↓
controllers/*.ts (validates input, handles HTTP, calls services)
    ↓
services/*.ts (business logic, framework-agnostic)
    ↓
HTTP Response
```

### Controller Responsibilities

**Controllers MUST:**
- Handle HTTP request/response (Express `Request`, `Response`)
- Validate input (using Zod schemas)
- Call services for business logic
- Format responses (using `successResponse` helper)
- Handle errors (throw AppError, let middleware handle)
- Use `asyncHandler` wrapper (not try-catch)

**Controllers MUST NOT:**
- Contain business logic (that goes in services)
- Import database clients directly (use services)
- Return raw data (use `successResponse` helper)
- Use try-catch (use `asyncHandler` instead)

### Example Controller Structure

```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { someService } from '../services/some-service';

export const myController = asyncHandler(async (req: Request, res: Response) => {
  // 1. Validate input (if needed)
  // 2. Call service
  const result = await someService.doSomething(req.body);
  
  // 3. Return formatted response
  res.status(200).json(successResponse(result, req));
});
```

**See:** [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Controller Pattern section

---

## 🎓 Topic 2: Webhook Flow (6-Step Process)

### The Mandatory Webhook Flow

**Every webhook MUST follow this exact 6-step process** (from RECIPES.md R-WEBHOOK-001):

```
1. Verify Signature FIRST
   ↓
2. Extract Event ID
   ↓
3. Check Idempotency
   ↓
4. Mark as Processing
   ↓
5. Queue for Async Processing
   ↓
6. Return 200 OK Immediately
```

### Step-by-Step Breakdown

#### Step 1: Verify Signature FIRST (MANDATORY)

**Why FIRST?**
- Security: Must verify before any processing
- Compliance: MANDATORY per COMPLIANCE.md section H
- Performance: Fast check, fails early if invalid

**Implementation:**
```typescript
// MUST verify BEFORE any processing
const signature = req.headers['x-hub-signature-256'];
const rawBody = req.body; // Must be Buffer, not parsed JSON

if (!verifyInstagramSignature(signature, rawBody, req.correlationId)) {
  // Log security event (never log req.body)
  await logSecurityEvent(
    req.correlationId,
    undefined, // No user context
    'webhook_signature_failed',
    'high',
    req.ip
  );
  throw new UnauthorizedError('Invalid webhook signature');
}
```

**Critical Rules:**
- Verify signature BEFORE any other processing
- Use raw request body (Buffer), not parsed JSON
- Throw UnauthorizedError (401) if invalid
- Log security event (never log req.body or signature)

#### Step 2: Extract Event ID

**Why?**
- Needed for idempotency checking
- Unique identifier for the webhook event
- Platform-specific ID preferred, fallback hash if missing

**Implementation:**
```typescript
// Extract platform-specific ID or fallback hash
let eventId = extractInstagramEventId(req.body);
if (!eventId) {
  eventId = generateFallbackEventId(req.body);
}
```

**Platform-Specific IDs:**
- **Instagram:** `req.body.entry?.[0]?.id` (entry ID)
- **Facebook:** `req.body.entry?.[0]?.messaging?.[0]?.message?.mid` (message ID)
- **WhatsApp:** `req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id` (message ID)

**Fallback Strategy:**
- If platform ID missing → generate hash from normalized payload + 5-minute timestamp bucket
- Ensures same payload within 5 minutes = same hash (prevents false duplicates from retries)

#### Step 3: Check Idempotency

**Why?**
- Prevents duplicate processing
- Handles platform retries gracefully
- Returns 200 OK immediately if already processed

**Implementation:**
```typescript
// Check if already processed
const existing = await isWebhookProcessed(eventId, 'instagram');

if (existing && existing.status === 'processed') {
  // Already processed - return 200 OK (idempotent response)
  logger.info('Webhook already processed', {
    eventId,
    correlationId: req.correlationId,
    provider: 'instagram',
  });
  return res.status(200).json(successResponse({ message: 'OK' }, req));
}
```

**Idempotent Response:**
- Return 200 OK even if already processed
- Log idempotent response (metadata only)
- Don't queue again (already processed)

#### Step 4: Mark as Processing

**Why?**
- Prevents race conditions (multiple simultaneous requests)
- Tracks webhook state
- Required before queuing

**Implementation:**
```typescript
// Mark as processing immediately (prevents race conditions)
await markWebhookProcessing(eventId, 'instagram', req.correlationId);
```

**Race Condition Prevention:**
- If two requests arrive simultaneously with same event ID:
  - First request: marks as 'pending', queues, returns 200
  - Second request: sees 'pending' status, returns 200 (idempotent)
- Prevents duplicate queuing

#### Step 5: Queue for Async Processing

**Why?**
- Platform expects fast response (< 20 seconds)
- Processing may take longer (AI calls, DB writes)
- Prevents blocking the HTTP response
- Allows retry handling

**Implementation:**
```typescript
// Queue for async processing (don't block)
await webhookQueue.add('processInstagramWebhook', {
  eventId,
  provider: 'instagram',
  payload: req.body, // Transient only - never persisted in regular DB
  correlationId: req.correlationId,
  timestamp: new Date().toISOString(),
});
```

**Queue Characteristics:**
- Payload is transient (exists in queue storage only, e.g., Redis/BullMQ)
- Payload MUST NOT be persisted in regular database
- Only encrypted dead-letter storage if needed (after max retries)
- Queue handles retries with exponential backoff

**Note:** Queue implementation is in Task 6. For now, we'll create a placeholder or mock.

#### Step 6: Return 200 OK Immediately

**Why?**
- Platform expects 200 OK within 20 seconds
- Prevents platform retries
- Fast response = better reliability

**Implementation:**
```typescript
// Return 200 OK immediately (< 20 seconds for Meta)
return res.status(200).json(successResponse({ message: 'OK' }, req));
```

**Response Requirements:**
- Must return 200 OK
- Must use `successResponse` helper
- Must be fast (< 20 seconds total)
- Must include correlation ID in response meta

### Complete Flow Example

```typescript
export const instagramWebhookController = asyncHandler(async (req: Request, res: Response) => {
  // Step 1: Verify signature FIRST
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = req.body; // Must be Buffer
  
  if (!verifyInstagramSignature(signature, rawBody, req.correlationId)) {
    await logSecurityEvent(req.correlationId, undefined, 'webhook_signature_failed', 'high', req.ip);
    throw new UnauthorizedError('Invalid webhook signature');
  }
  
  // Step 2: Extract event ID
  let eventId = extractInstagramEventId(req.body);
  if (!eventId) {
    eventId = generateFallbackEventId(req.body);
  }
  
  // Step 3: Check idempotency
  const existing = await isWebhookProcessed(eventId, 'instagram');
  if (existing && existing.status === 'processed') {
    return res.status(200).json(successResponse({ message: 'OK' }, req));
  }
  
  // Step 4: Mark as processing
  await markWebhookProcessing(eventId, 'instagram', req.correlationId);
  
  // Step 5: Queue for async processing
  await webhookQueue.add('processInstagramWebhook', {
    eventId,
    provider: 'instagram',
    payload: req.body,
    correlationId: req.correlationId,
  });
  
  // Step 6: Return 200 OK immediately
  return res.status(200).json(successResponse({ message: 'OK' }, req));
});
```

**See:** [RECIPES.md](../../Reference/RECIPES.md) - R-WEBHOOK-001 pattern

---

## 🎓 Topic 3: Webhook Verification Handler (GET)

### What is Webhook Verification?

**Webhook Verification** is Facebook/Instagram's initial setup process where they send a GET request to verify your webhook endpoint is valid and you control it.

**Think of it like:**
- **Webhook Verification** = Phone number verification (they call you, you confirm)
- **GET Request** = Facebook's verification call
- **Challenge Response** = You confirming you received it

### Facebook's Verification Protocol

**When:** During webhook setup in Facebook Developer Console

**Request Format:**
```
GET /webhooks/instagram?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=RANDOM_STRING
```

**Query Parameters:**
- `hub.mode`: Must be `'subscribe'`
- `hub.verify_token`: Must match `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` from environment
- `hub.challenge`: Random string to echo back

**Response:**
- **200 OK:** Return `hub.challenge` if verification succeeds
- **403 Forbidden:** If verify_token doesn't match
- **400 Bad Request:** If parameters are missing

### Implementation

```typescript
export const instagramWebhookVerificationController = asyncHandler(
  async (req: Request, res: Response) => {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;
    
    // Validate mode
    if (mode !== 'subscribe') {
      throw new UnauthorizedError('Invalid hub.mode');
    }
    
    // Validate verify token
    if (!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      throw new InternalError('Instagram webhook verify token not configured');
    }
    
    if (token !== env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      throw new UnauthorizedError('Invalid verify token');
    }
    
    // Return challenge to complete verification
    res.status(200).send(challenge);
  }
);
```

### Security Considerations

- Verify token must be kept secret (environment variable)
- Only return challenge if token matches
- Log verification attempts (metadata only, never log token)

**See:** [Facebook Webhook Setup Guide](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)

---

## 🎓 Topic 4: Rate Limiting

### What is Rate Limiting?

**Rate Limiting** restricts the number of requests a client can make within a time window, preventing abuse and DoS attacks.

**Think of it like:**
- **Rate Limiting** = Hospital visitor policy (max 10 visitors per hour)
- **Time Window** = The hour period
- **Max Requests** = The 10 visitor limit
- **IP-Based** = Each person (IP address) has their own limit

### Why Rate Limit Webhooks?

**Protection Against:**
- DoS attacks (flooding endpoint with requests)
- Abuse (malicious webhook spam)
- Resource exhaustion (too many concurrent requests)

**Webhook-Specific Considerations:**
- Webhooks come from Meta IPs (not user IPs)
- Higher limit needed (Meta sends many webhooks)
- IP-based keyGenerator (webhooks come from Meta IPs)

### Implementation

```typescript
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Webhook-specific rate limiter
export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for webhooks (Meta sends many)
  keyGenerator: ipKeyGenerator, // IP-based (webhooks come from Meta IPs)
  message: 'Too many webhook requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    // Log rate limit violation
    logSecurityEvent(
      req.correlationId,
      undefined,
      'rate_limit_exceeded',
      'medium',
      req.ip
    );
    res.status(429).json(errorResponse({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many webhook requests',
      statusCode: 429,
    }, req));
  },
});
```

### Applying Rate Limiter

```typescript
// routes/webhooks/instagram.ts
import { Router } from 'express';
import { webhookLimiter } from '../../config/rate-limit';
import { instagramWebhookController } from '../../controllers/webhook-controller';

const router = Router();

// Apply rate limiter to POST route (webhook receiver)
router.post('/instagram', webhookLimiter, instagramWebhookController);

export default router;
```

**See:** [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Rate limiting requirements (section H)

---

## 🎓 Topic 5: Error Handling

### Error Handling Strategy

**Controllers MUST:**
- Use `asyncHandler` wrapper (not try-catch)
- Throw typed errors (AppError subclasses)
- Let error middleware handle formatting
- Log errors appropriately (metadata only)

### Signature Verification Errors

**When:** Invalid or missing signature

**Response:**
- 401 Unauthorized
- Log security event (high severity)
- Never log req.body or signature

```typescript
if (!verifyInstagramSignature(signature, rawBody, req.correlationId)) {
  await logSecurityEvent(
    req.correlationId,
    undefined,
    'webhook_signature_failed',
    'high',
    req.ip
  );
  throw new UnauthorizedError('Invalid webhook signature');
}
```

### Idempotency Errors

**When:** Database errors during idempotency check

**Strategy:** Fail-open vs Fail-closed decision

**Fail-Open (Allow webhook through):**
- If idempotency check fails, allow webhook through
- Prevents blocking legitimate webhooks due to DB issues
- Risk: Potential duplicate processing

**Fail-Closed (Reject webhook):**
- If idempotency check fails, reject webhook
- Prevents duplicate processing
- Risk: Legitimate webhooks rejected due to DB issues

**Recommendation:** Fail-open for idempotency errors (log error, allow through)

```typescript
try {
  const existing = await isWebhookProcessed(eventId, 'instagram');
  // ... handle existing
} catch (error) {
  // Fail-open: Log error but allow webhook through
  logger.error({ error, eventId, correlationId: req.correlationId }, 'Idempotency check failed');
  // Continue with processing (don't block webhook)
}
```

### Queue Errors

**When:** Queue connection or enqueue fails

**Strategy:** Fallback to dead letter queue

```typescript
try {
  await webhookQueue.add('processInstagramWebhook', { ... });
} catch (error) {
  // Fallback: Store in dead letter queue immediately
  logger.error({ error, eventId, correlationId: req.correlationId }, 'Queue error');
  
  await storeDeadLetterWebhook(
    eventId,
    'instagram',
    req.body,
    `Queue error: ${error.message}`,
    0, // No retries (failed immediately)
    req.correlationId
  );
  
  // Still return 200 OK (webhook was received)
  return res.status(200).json(successResponse({ message: 'OK' }, req));
}
```

**See:** [STANDARDS.md](../../Reference/STANDARDS.md) - Error handling patterns

---

## 🎓 Topic 6: Audit Logging

### What is Audit Logging?

**Audit Logging** records all system actions for compliance, security, and debugging. For webhooks, we must log:
- Webhook received
- Signature verification failures
- Rate limit violations
- Processing status

**Think of it like:**
- **Audit Logging** = Hospital visitor log (who came, when, why)
- **Compliance** = Required by law (HIPAA, GDPR, etc.)
- **Security** = Track suspicious activity
- **Debugging** = Troubleshoot issues

### Webhook Audit Logging Requirements

**MUST Log:**
- Webhook received (action: `'webhook_received'`)
- Signature verification failures (action: `'security_event'`, eventType: `'webhook_signature_failed'`)
- Rate limit violations (action: `'security_event'`, eventType: `'rate_limit_exceeded'`)

**MUST NOT Log:**
- `req.body` (may contain PII)
- Patient identifiers
- Message content with PHI
- Signatures or tokens

### Implementation

```typescript
// Log webhook received
await logAuditEvent({
  correlationId: req.correlationId,
  userId: undefined, // System operation
  action: 'webhook_received',
  resourceType: 'webhook',
  resourceId: eventId,
  status: 'success',
  metadata: {
    event_id: eventId,
    provider: 'instagram',
    received_at: new Date().toISOString(),
  },
});

// Log signature verification failure
await logSecurityEvent(
  req.correlationId,
  undefined,
  'webhook_signature_failed',
  'high',
  req.ip
);
```

### Audit Log Schema Mapping

**audit_logs table fields:**
- `correlation_id`: Request correlation ID
- `user_id`: `undefined` (system operation)
- `action`: `'webhook_received'` | `'security_event'`
- `resource_type`: `'webhook'` | `'security'`
- `resource_id`: Event ID (for webhooks)
- `status`: `'success'` | `'failure'`
- `error_message`: Error message if failed
- `metadata` (JSONB): `{ event_id, provider, received_at, ... }`

**See:** [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Audit logging requirements (section D)

---

## 🎓 Topic 7: Response Format

### Standardized Response Format

**All API responses MUST use the canonical format:**

```typescript
{
  success: true,
  data: { ... },
  meta: {
    timestamp: "2026-01-26T12:00:00.000Z",
    requestId: "correlation-id-123"
  }
}
```

### Using successResponse Helper

**MUST use `successResponse` helper for all success responses:**

```typescript
import { successResponse } from '../utils/response';

// ✅ CORRECT
return res.status(200).json(successResponse({ message: 'OK' }, req));

// ❌ WRONG
return res.status(200).json({ message: 'OK' });
```

**Why?**
- Ensures consistent format
- Includes correlation ID automatically
- Includes timestamp automatically
- Required by STANDARDS.md

### Webhook Response Format

**Webhook endpoints return simple acknowledgment:**

```typescript
return res.status(200).json(successResponse({ message: 'OK' }, req));
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "OK"
  },
  "meta": {
    "timestamp": "2026-01-26T12:00:00.000Z",
    "requestId": "correlation-id-123"
  }
}
```

**See:** [STANDARDS.md](../../Reference/STANDARDS.md) - Canonical Contracts section

---

## 🎓 Topic 8: Route Configuration

### Route Structure

**Routes define paths and mount controllers:**

```typescript
// routes/webhooks/instagram.ts
import { Router } from 'express';
import { instagramWebhookController, instagramWebhookVerificationController } from '../../controllers/webhook-controller';
import { webhookLimiter } from '../../config/rate-limit';

const router = Router();

// GET route: Webhook verification
router.get('/instagram', instagramWebhookVerificationController);

// POST route: Webhook receiver (with rate limiting)
router.post('/instagram', webhookLimiter, instagramWebhookController);

export default router;
```

### Registering Routes

**Routes must be registered in main router:**

```typescript
// routes/index.ts
import { Router } from 'express';
import healthRoutes from './health';
import webhookRoutes from './webhooks/instagram';

const router = Router();

// Register routes
router.use('/', healthRoutes);
router.use('/webhooks', webhookRoutes); // Mounts at /webhooks/instagram

export default router;
```

### Route Order

**Webhook routes should be registered early:**
- Before other routes (to catch webhook requests first)
- After health routes (health is most critical)
- Before API versioned routes

**See:** [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Route structure

---

## 🎓 Topic 9: Raw Body Handling

### Why Raw Body?

**Signature verification requires raw request body (Buffer), not parsed JSON.**

**Problem:**
- Express `express.json()` middleware parses body to JSON
- Parsed JSON may have different formatting (whitespace, key order)
- Signature verification needs exact raw bytes

**Solution:**
- Use `express.raw()` middleware for webhook routes
- Or use `express.json({ verify: (req, res, buf) => { req.rawBody = buf } })`
- Store raw body in `req.rawBody` for signature verification

### Implementation

```typescript
// In index.ts or route file
import express from 'express';

// For webhook routes, use raw body parser
app.use('/webhooks', express.raw({ type: 'application/json' }));

// Or store raw body alongside parsed body
app.use(express.json({
  verify: (req, res, buf) => {
    (req as any).rawBody = buf; // Store raw body for signature verification
  },
}));
```

**In Controller:**
```typescript
// Use raw body for signature verification
const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
const signature = req.headers['x-hub-signature-256'];

if (!verifyInstagramSignature(signature, rawBody, req.correlationId)) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

**See:** [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Signature verification requirements

---

## 🎓 Topic 10: Queue Integration (Placeholder)

### Queue Pattern

**Webhooks MUST be queued for async processing:**

```typescript
// Queue webhook for async processing
await webhookQueue.add('processInstagramWebhook', {
  eventId,
  provider: 'instagram',
  payload: req.body, // Transient only
  correlationId: req.correlationId,
  timestamp: new Date().toISOString(),
});
```

### Queue Implementation Status

**Current State:**
- Queue infrastructure will be implemented in Task 6
- For Task 4, we'll create a placeholder or mock

**Placeholder Options:**
1. **Mock Queue:** Simple function that logs (for testing)
2. **Queue Interface:** Define interface, implement later
3. **TODO Comment:** Document queue call, implement in Task 6

**Recommended:** Create a simple queue interface/placeholder that can be replaced in Task 6.

### Queue Requirements

**Queue MUST:**
- Accept webhook payload (transient storage only)
- Handle retries with exponential backoff
- Move to dead letter queue after max retries
- Process webhooks asynchronously

**See:** [Task 6: Webhook Processing Queue & Worker](./e-task-6-webhook-queue.md)

---

## 🎓 Topic 11: Security Best Practices

### PII Redaction Rules

**CRITICAL: NEVER log `req.body` for webhooks**

**Why?**
- Webhook payloads may contain patient identifiers (PII/PHI)
- Message content may contain PHI
- Logging PII violates compliance (HIPAA, GDPR, etc.)

**Allowed Logging:**
```typescript
logger.info('Webhook received', {
  correlationId: req.correlationId,
  eventId: extractedEventId,
  provider: 'instagram',
  status: 'processing',
  ip: req.ip,
  // ✅ OK: Metadata only
});

// ❌ NEVER:
logger.info('Webhook received', { body: req.body }); // Contains PII!
```

### Fast Response Requirement

**Why Fast Response?**
- Meta platforms expect 200 OK within 20 seconds
- Slow responses trigger platform retries
- Retries cause duplicate webhook processing
- Fast response = better reliability

**Performance Targets:**
- Signature verification: < 100ms
- Idempotency check: < 200ms
- Mark as processing: < 200ms
- Queue operation: < 500ms
- **Total: < 1 second** (well under 20-second limit)

### Error Response Security

**Never expose:**
- Internal error details
- Stack traces (production)
- Database errors
- System architecture details

**Always:**
- Return generic error messages
- Log detailed errors server-side
- Use appropriate HTTP status codes

**See:** [STANDARDS.md](../../Reference/STANDARDS.md) - PII Redaction Rule

---

## 🎓 Topic 12: Testing Strategies

### Unit Testing Controllers

**Test Cases:**
1. Valid signature → queues and returns 200
2. Invalid signature → returns 401
3. Missing signature → returns 401
4. Duplicate event ID → returns 200 (idempotent)
5. Queue error → fallback to dead letter queue
6. Idempotency error → fail-open behavior

### Integration Testing

**Test Scenarios:**
1. End-to-end webhook flow (signature → queue → response)
2. Webhook verification (GET request)
3. Rate limiting enforcement
4. Error handling paths

### Manual Testing

**Tools:**
- ngrok (expose local server to internet)
- Facebook Developer Console (webhook setup)
- Postman/curl (send test webhooks)

**Test Checklist:**
- [ ] Webhook verification (GET) works
- [ ] Valid signature accepted
- [ ] Invalid signature rejected
- [ ] Duplicate events handled idempotently
- [ ] Rate limiting works
- [ ] Audit logs created

**See:** [TESTING.md](../../Reference/TESTING.md) - Testing strategies

---

## 🎓 Topic 13: Common Pitfalls & Solutions

### Pitfall 1: Logging req.body

**Problem:**
```typescript
// ❌ WRONG - Contains PII
logger.info('Webhook received', { body: req.body });
```

**Solution:**
```typescript
// ✅ CORRECT - Metadata only
logger.info('Webhook received', {
  eventId,
  provider: 'instagram',
  correlationId: req.correlationId,
});
```

### Pitfall 2: Using Parsed Body for Signature

**Problem:**
```typescript
// ❌ WRONG - Parsed JSON may differ from raw
const isValid = verifyInstagramSignature(signature, JSON.stringify(req.body), correlationId);
```

**Solution:**
```typescript
// ✅ CORRECT - Use raw body Buffer
const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
const isValid = verifyInstagramSignature(signature, rawBody, correlationId);
```

### Pitfall 3: Blocking on Processing

**Problem:**
```typescript
// ❌ WRONG - Blocks HTTP response
await processWebhook(req.body);
return res.status(200).json(successResponse({ message: 'OK' }, req));
```

**Solution:**
```typescript
// ✅ CORRECT - Queue for async processing
await webhookQueue.add('processInstagramWebhook', { ... });
return res.status(200).json(successResponse({ message: 'OK' }, req));
```

### Pitfall 4: Not Checking Idempotency

**Problem:**
```typescript
// ❌ WRONG - No idempotency check
await webhookQueue.add('processInstagramWebhook', { ... });
```

**Solution:**
```typescript
// ✅ CORRECT - Check idempotency first
const existing = await isWebhookProcessed(eventId, 'instagram');
if (existing && existing.status === 'processed') {
  return res.status(200).json(successResponse({ message: 'OK' }, req));
}
```

### Pitfall 5: Wrong Error Status Codes

**Problem:**
```typescript
// ❌ WRONG - Wrong status code
throw new InternalError('Invalid signature'); // Should be 401, not 500
```

**Solution:**
```typescript
// ✅ CORRECT - Use appropriate error class
throw new UnauthorizedError('Invalid webhook signature'); // 401
```

---

## 🎓 Topic 14: Compliance & Security Requirements

### Compliance Requirements (COMPLIANCE.md)

**Section H - Webhook Security:**
- ✅ Signature verification is MANDATORY
- ✅ Idempotency handling is MANDATORY
- ✅ Rate limiting is MANDATORY
- ✅ Audit logging is MANDATORY

**Section D - Audit Logging:**
- ✅ All webhook events must be logged
- ✅ Security events must be logged
- ✅ Never log PII/PHI

### Security Requirements

**MANDATORY Security Measures:**
1. **Signature Verification:** Prevents unauthorized webhooks
2. **Rate Limiting:** Prevents DoS attacks
3. **Idempotency:** Prevents duplicate processing
4. **Audit Logging:** Tracks all webhook events
5. **PII Redaction:** Never log sensitive data

**See:** [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Section H (Webhook Security)

---

## 🎓 Topic 15: Implementation Patterns

### Complete Controller Example

```typescript
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError } from '../utils/errors';
import { verifyInstagramSignature } from '../utils/webhook-verification';
import { extractInstagramEventId, generateFallbackEventId } from '../utils/webhook-event-id';
import { isWebhookProcessed, markWebhookProcessing } from '../services/webhook-idempotency-service';
import { logAuditEvent, logSecurityEvent } from '../utils/audit-logger';
import { webhookQueue } from '../config/queue'; // Placeholder for Task 6
import { logger } from '../config/logger';

export const instagramWebhookController = asyncHandler(async (req: Request, res: Response) => {
  // Step 1: Verify signature FIRST
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
  
  if (!verifyInstagramSignature(signature, rawBody, req.correlationId)) {
    await logSecurityEvent(
      req.correlationId,
      undefined,
      'webhook_signature_failed',
      'high',
      req.ip
    );
    throw new UnauthorizedError('Invalid webhook signature');
  }
  
  // Step 2: Extract event ID
  let eventId = extractInstagramEventId(req.body);
  if (!eventId) {
    eventId = generateFallbackEventId(req.body);
  }
  
  // Step 3: Check idempotency
  const existing = await isWebhookProcessed(eventId, 'instagram');
  if (existing && existing.status === 'processed') {
    logger.info('Webhook already processed', {
      eventId,
      correlationId: req.correlationId,
      provider: 'instagram',
    });
    return res.status(200).json(successResponse({ message: 'OK' }, req));
  }
  
  // Step 4: Mark as processing
  await markWebhookProcessing(eventId, 'instagram', req.correlationId);
  
  // Step 5: Queue for async processing
  await webhookQueue.add('processInstagramWebhook', {
    eventId,
    provider: 'instagram',
    payload: req.body,
    correlationId: req.correlationId,
  });
  
  // Log webhook received
  await logAuditEvent({
    correlationId: req.correlationId,
    userId: undefined,
    action: 'webhook_received',
    resourceType: 'webhook',
    resourceId: eventId,
    status: 'success',
    metadata: {
      event_id: eventId,
      provider: 'instagram',
      received_at: new Date().toISOString(),
    },
  });
  
  // Step 6: Return 200 OK immediately
  return res.status(200).json(successResponse({ message: 'OK' }, req));
});
```

### Route Example

```typescript
import { Router } from 'express';
import { instagramWebhookController, instagramWebhookVerificationController } from '../../controllers/webhook-controller';
import { webhookLimiter } from '../../config/rate-limit';

const router = Router();

// GET: Webhook verification
router.get('/instagram', instagramWebhookVerificationController);

// POST: Webhook receiver (with rate limiting)
router.post('/instagram', webhookLimiter, instagramWebhookController);

export default router;
```

---

## 📋 Summary

### Key Takeaways

1. **Controller Pattern:** Separates HTTP handling from business logic
2. **6-Step Flow:** Verify → Extract → Check → Mark → Queue → Respond
3. **Signature Verification:** MANDATORY, must be first step
4. **Idempotency:** Prevents duplicate processing
5. **Async Processing:** Queue webhooks, don't block
6. **Fast Response:** Return 200 OK within 20 seconds
7. **PII Redaction:** NEVER log req.body
8. **Audit Logging:** Log all webhook events (metadata only)
9. **Rate Limiting:** Protect endpoints from abuse
10. **Error Handling:** Fail gracefully, log appropriately

### Implementation Checklist

- [ ] Create webhook controller with 6-step flow
- [ ] Implement webhook verification handler (GET)
- [ ] Configure routes with rate limiting
- [ ] Add audit logging for webhook events
- [ ] Handle errors gracefully (signature, idempotency, queue)
- [ ] Use successResponse helper for all responses
- [ ] Never log req.body (PII redaction)
- [ ] Test all error paths
- [ ] Verify fast response times

### Next Steps

After implementing Task 4:
- Task 6: Implement webhook queue and worker
- Task 5: Implement Instagram service (called by worker)

---

**Related Files:**
- [RECIPES.md](../../Reference/RECIPES.md) - R-WEBHOOK-001 pattern
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Webhook processing rules
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Security requirements
- [STANDARDS.md](../../Reference/STANDARDS.md) - Controller Pattern
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Layer boundaries

---

**Last Updated:** 2026-01-26
