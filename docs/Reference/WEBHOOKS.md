# Webhooks Guide
## Reliability Under Retries and Failures

**⚠️ CRITICAL: Webhooks are where systems silently break. Follow these rules exactly.**

---

## 🎯 Purpose

This file governs webhook handling, reliability, and failure recovery.

**This file owns:**
- Providers (Facebook, Instagram, WhatsApp)
- Signature verification
- Idempotency strategy
- Retry handling
- Dead-letter logic

**This file MUST NOT contain:**
- API contracts (see CONTRACTS.md)
- Implementation recipes (see RECIPES.md)
- Architecture details (see ARCHITECTURE.md)

---

## 📋 Related Files

- [CONTRACTS.md](./CONTRACTS.md) - Idempotency contract and headers
- [RECIPES.md](./RECIPES.md) - Webhook implementation patterns
- [COMPLIANCE.md](./COMPLIANCE.md) - PHI handling and audit requirements
- [STANDARDS.md](./STANDARDS.md) - Logging rules and PII redaction

---

## 🔐 Security Rules (MANDATORY)

### Signature Verification (MANDATORY)

**Rule:** ALWAYS verify webhook signatures before processing.

**Providers:**
- **Facebook/Meta:** Use `X-Hub-Signature-256` header with HMAC-SHA256
- **Instagram:** Same as Facebook (Meta platform)
- **WhatsApp:** Uses `X-Hub-Signature-256` (Meta platform)

**Implementation:**
```typescript
// MUST verify BEFORE any processing
if (!verifyWebhookSignature(req)) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

**AI Agents:** Never skip signature verification. Invalid signatures MUST result in 401 Unauthorized.

### Body and signature (raw vs sanitized)

**Rule:** Signature verification MUST use the raw request body (exact bytes). The application stores `rawBody` before any parsing/sanitization for this purpose.

**Body used for processing:** The payload queued for async processing (and stored in dead letter if needed) is `req.body`, which may be sanitized by global input-sanitization middleware (XSS prevention). Signature verification is unaffected because it uses `rawBody`. If the platform can send HTML or special characters in message content, the queued payload may differ from the raw platform payload; the decision is to keep global sanitization for security and document it here.

---

## 🚫 PII Logging Rules (MANDATORY)

**CRITICAL:** Webhook payloads may contain patient identifiers (PII/PHI).

**Rules:**
- **NEVER log `req.body` for webhooks** - platform payloads may contain patient identifiers (PII)
- **NEVER log headers containing tokens or IDs** - may contain PHI
- **ONLY log metadata:** `correlationId`, `eventId`, `provider`, `status`, `ip`

**Allowed Logging:**
```typescript
logger.info('Webhook received', {
  correlationId: req.correlationId,
  eventId: extractedEventId,
  provider: 'facebook',
  status: 'processing',
  ip: req.ip,
  // NEVER: req.body, req.headers.authorization, patient identifiers
});
```

**See:** [STANDARDS.md](./STANDARDS.md) "PII Redaction Rule" section

---

## 🔄 Idempotency Strategy (MANDATORY)

**Rule:** Prevent duplicate webhook processing using platform-specific IDs or fallback hashing.

### Platform-Specific ID Extraction

**Facebook/Meta:**
- **Primary:** `req.body.entry?.[0]?.messaging?.[0]?.message?.mid` (message ID - most reliable)
- **Fallback:** `req.body.entry?.[0]?.id` (entry ID)

**Instagram:**
- **Primary (Messenger/Business Login):** `entry[].messaging[].message.mid` or reaction/postback/read/message_edit `.mid`
- **Primary (Graph API):** `entry[].changes[]` where `field === "messages"` → `value.message.mid`
- **Fallback:** `req.body.entry?.[0]?.id` (entry ID)

**WhatsApp:**
- **Primary:** `req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id` (message ID)

**Razorpay (payment webhook):**
- **Primary:** `req.body.payload?.payment?.entity?.id` or `req.body.event` (event ID)

**PayPal (payment webhook):**
- **Primary:** `req.body.id` (webhook event ID) or `req.body.resource?.id` (resource ID)

**Implementation:**
```typescript
// Extract platform-specific ID
let eventId: string | undefined;

if (req.body.entry?.[0]?.messaging?.[0]?.message?.mid) {
  eventId = req.body.entry[0].messaging[0].message.mid; // Facebook message ID
} else if (req.body.entry?.[0]?.id) {
  eventId = req.body.entry[0].id; // Fallback entry ID
}

// If no platform ID, use fallback hash
if (!eventId) {
  const normalizedPayload = normalizePayload(req.body);
  const timestampBucket = Math.floor(Date.now() / 300000); // 5-minute window
  eventId = hash(normalizedPayload + timestampBucket);
}
```

### Fallback Hash Strategy

**When to Use:**
- Platform doesn't provide stable ID
- ID extraction fails
- ID format is invalid

**Method:**
- Normalize payload (remove timestamps, sort keys)
- Hash normalized payload + timestamp bucket (5-minute window)
- Format: `hash(payload + floor(timestamp/300000))`

**Rationale:**
- 5-minute window prevents false positives from retries
- Normalization ensures consistent hashing

### Idempotency Storage

**Table:** `webhook_idempotency`

**Schema:**
```typescript
{
  event_id: string;        // Platform ID or hash
  provider: string;        // 'facebook' | 'instagram' | 'whatsapp' | 'razorpay' | 'paypal'
  received_at: timestamp;  // When webhook was received
  status: string;          // 'processed' | 'failed' | 'pending'
  correlation_id: string;  // Request correlation ID
}
```

**Check BEFORE Processing:**
```typescript
const existing = await isWebhookProcessed(eventId, provider);
if (existing && existing.status === 'processed') {
  // Already processed - return 200 (idempotent)
  return res.status(200).json(successResponse({ idempotent: true }, req));
}
```

**Mark AFTER Processing:**
```typescript
await markWebhookProcessing(eventId, provider, 'processed', req.correlationId);
```

**See:** [CONTRACTS.md](./CONTRACTS.md) "Idempotency Contract" section

---

## ⚡ Processing Rules (MANDATORY)

### Async Processing (MANDATORY)

**Rule:** Webhooks MUST be processed asynchronously via queue.

**Rationale:**
- Platform expects fast response (200 OK within 20 seconds)
- Processing may take longer (AI calls, DB writes)
- Prevents platform retries from hammering endpoint

**Pattern:**
1. Verify signature (fast)
2. Check idempotency (fast)
3. Queue for processing (fast)
4. Return 200 OK immediately (fast)

**Implementation:**
```typescript
// Queue webhook for async processing
// **CRITICAL:** Payload may exist transiently in queue storage (e.g., Redis, BullMQ)
// Payload MUST NOT be persisted in DB except in encrypted dead-letter storage if needed
await webhookQueue.add({
  eventId,
  provider,
  payload: req.body,  // Transient only - never persisted in regular DB
  correlationId: req.correlationId,
});

// Return 200 OK immediately
return res.status(200).json(successResponse({ queued: true }, req));
```

### Audit Logging (MANDATORY)

**Rule:** ALL webhook events MUST be logged in `audit_logs` table.

**Implementation:**
- Store as `audit_logs` record with `resource_type='webhook'`
- Put `event_id` and `provider` in `metadata` JSONB field (NOT as separate columns - matches audit_logs schema)
- Use `correlation_id` field directly
- Use `action` field for webhook status (e.g., 'webhook_received', 'webhook_processed', 'webhook_failed')

**Required Fields (mapped to audit_logs schema):**
- `resource_type`: `'webhook'`
- `action`: `'webhook_received'` | `'webhook_processed'` | `'webhook_failed'`
- `correlation_id`: Request correlation ID
- `metadata` (JSONB): `{ event_id: string, provider: 'facebook' | 'instagram' | 'whatsapp' | 'razorpay' | 'paypal', received_at?: string, processed_at?: string }`
- `status`: `'success'` | `'failure'`
- `error_message`: Error message if failed (nullable)

**Never Log:**
- `req.body` (may contain PII)
- Patient identifiers
- Message content with PHI

**See:** [COMPLIANCE.md](./COMPLIANCE.md) "Audit Logging" section

---

## 🔁 Retry Handling

### Platform Retries

**Rule:** Platforms will retry failed webhooks.

**Behavior:**
- Platform sends webhook
- If response is not 200 OK → platform retries
- Retries continue until 200 OK received or max retries reached

**Our Response:**
- **Always return 200 OK** after queuing (even if processing fails later)
- Use idempotency to prevent duplicate processing
- Process failures are handled internally (dead letter queue)

### Internal Retries

**Rule:** Failed webhook processing MUST be retried with exponential backoff.

**Strategy:**
- First retry: 1 minute
- Second retry: 5 minutes
- Third retry: 15 minutes
- Max retries: 3
- After max retries: Dead letter queue

**Implementation:**
```typescript
// Queue with retry strategy
await webhookQueue.add({
  eventId,
  provider,
  payload: req.body,
  correlationId: req.correlationId,
}, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 60000, // 1 minute
  },
});
```

---

## ⚰️ Dead Letter Queue

### When to Use

**Webhook moves to dead letter queue when:**
- Max retries exceeded (3 attempts failed)
- Signature verification fails (after retries)
- Processing error is not retryable (permanent failure)

### Dead Letter Handling

**Actions:**
1. Log error to audit table with `status: 'failed'`
2. Store payload in dead letter table (encrypted)
3. Alert operations team (if configured)
4. Manual review required

**Configuration (MANDATORY when using webhooks and dead letter):**
- **ENCRYPTION_KEY** must be set in environment when the application uses webhook routes and dead letter storage. Payloads stored in the dead letter table are encrypted with AES-256-GCM; without a valid key (base64-encoded, 32 bytes), encryption will fail and dead letter storage will not work. If Redis or queue is unavailable, the controller may store directly in dead letter; ENCRYPTION_KEY is required for that path. See backend `.env.example` and [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) for key format.

**Dead Letter Table:**
```typescript
{
  event_id: string;
  provider: string;
  received_at: timestamp;
  correlation_id: string;
  payload_encrypted: string;  // Encrypted payload
  error_message: string;
  retry_count: number;
  failed_at: timestamp;
}
```

**Recovery:**
- Manual review of dead letter items
- Fix underlying issue
- Reprocess manually if needed

---

## 📊 Webhook Flow

**Complete Flow:**

```
1. Webhook received
   ↓
2. Verify signature (fast) → 401 if invalid
   ↓
3. Extract event ID (platform-specific or hash)
   ↓
4. Check idempotency (fast) → 200 if already processed
   ↓
5. Mark as "pending" in idempotency table
   ↓
6. Queue for async processing
   ↓
7. Return 200 OK immediately
   ↓
8. [Async] Process webhook
   ↓
9. [Async] Mark as "processed" in idempotency table
   ↓
10. [Async] Log to audit table
```

**Error Flow:**

```
Processing fails
   ↓
Retry with exponential backoff (max 3 attempts)
   ↓
If all retries fail → Dead letter queue
   ↓
Manual review required
```

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [CONTRACTS.md](./CONTRACTS.md) - Idempotency contract
- [RECIPES.md](./RECIPES.md) - Implementation patterns
- [COMPLIANCE.md](./COMPLIANCE.md) - PHI handling and audit
- [STANDARDS.md](./STANDARDS.md) - PII redaction rules
- [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) - External service integration patterns