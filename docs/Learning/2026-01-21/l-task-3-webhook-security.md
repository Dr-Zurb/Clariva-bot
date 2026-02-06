# Learning Topics - Webhook Security & Verification Utilities
## Task #3: Secure Webhook Processing & Idempotency

---

## 📚 What Are We Learning Today?

Today we're learning about **Webhook Security** - the critical security measures that protect our system from unauthorized webhooks and ensure reliable, duplicate-free processing. Think of it like **a hospital's security checkpoint and patient registration system** - we verify that incoming webhooks are legitimate (signature verification), check if we've already processed them (idempotency), and extract unique identifiers to track them properly. This ensures we only process legitimate, unique webhooks!

We'll learn about:
1. **Webhook Signature Verification** - How to verify webhooks are from legitimate sources
2. **Event ID Extraction** - How to identify unique webhook events
3. **Idempotency Service** - How to prevent duplicate webhook processing
4. **Security Best Practices** - Protecting against attacks and ensuring reliability
5. **HMAC-SHA256 Cryptography** - Understanding signature verification
6. **Idempotency Patterns** - Ensuring webhooks are processed exactly once
7. **Platform-Specific Handling** - Instagram, Facebook, WhatsApp differences
8. **Compliance Requirements** - Security and reliability mandates

---

## 🎓 Topic 1: Webhook Signature Verification

### What is Webhook Signature Verification?

**Webhook Signature Verification** is a cryptographic process that proves a webhook request came from the legitimate provider (Instagram, Facebook, WhatsApp) and hasn't been tampered with.

**Think of it like:**
- **Signature Verification** = Checking a passport at border control
- **HMAC-SHA256** = A cryptographic seal that proves authenticity
- **X-Hub-Signature-256 Header** = The passport stamp showing it's legitimate
- **App Secret** = The secret key only you and the provider know

### Why Do We Need Signature Verification?

**Without Signature Verification:**
- Anyone can send fake webhooks to your system
- Attackers can inject malicious data
- No way to verify webhook authenticity
- Compliance violations (processing unauthorized data)
- Security vulnerabilities (data breaches, fraud)

**With Signature Verification:**
- Only legitimate providers can send webhooks
- Tampered webhooks are rejected
- Complete security assurance
- Compliance with security requirements
- Protection against attacks

**Think of it like:**
- **Without verification** = Accepting mail from anyone claiming to be a hospital
- **With verification** = Only accepting mail with official hospital seal/stamp

### How Does Signature Verification Work?

**The Process:**
1. **Provider sends webhook** with `X-Hub-Signature-256` header
2. **We compute HMAC-SHA256** hash of the raw request body using our app secret
3. **We compare** our computed hash with the header signature
4. **If they match** → Webhook is legitimate ✅
5. **If they don't match** → Webhook is rejected ❌

**HMAC-SHA256 Explained:**
- **HMAC** = Hash-based Message Authentication Code
- **SHA-256** = Secure Hash Algorithm (256-bit)
- **Result** = A unique cryptographic signature that proves authenticity

**Think of it like:**
- **Raw body** = The original document
- **App secret** = Your private seal/stamp
- **HMAC-SHA256** = Creating a unique seal impression
- **X-Hub-Signature-256** = The seal impression sent by provider
- **Comparison** = Checking if seal impressions match

### Signature Format

**Header Format:**
```
X-Hub-Signature-256: sha256=<computed_hash>
```

**Example:**
```
X-Hub-Signature-256: sha256=abc123def456...
```

**Implementation Pattern:**
```typescript
// 1. Extract signature from header
const signature = req.headers['x-hub-signature-256'];

// 2. Compute HMAC-SHA256 of raw body
const computedHash = crypto
  .createHmac('sha256', INSTAGRAM_APP_SECRET)
  .update(rawBody)
  .digest('hex');

// 3. Compare signatures
const isValid = signature === `sha256=${computedHash}`;
```

### Security Requirements

**MANDATORY Rules:**
1. **ALWAYS verify** before any processing
2. **Reject immediately** if signature is invalid (401 Unauthorized)
3. **Never log** signatures or raw payloads (security risk)
4. **Use raw body** (not parsed JSON) for verification
5. **Store app secret** in environment variables (never in code)

**Think of it like:**
- **Always verify** = Check passport before allowing entry
- **Reject invalid** = Turn away anyone without valid passport
- **Never log secrets** = Don't write down passport numbers
- **Raw body** = Original document before any modifications
- **Environment variables** = Secure vault for secrets

---

## 🎓 Topic 2: Event ID Extraction

### What is Event ID Extraction?

**Event ID Extraction** is the process of identifying a unique identifier for each webhook event. This ID is used for idempotency checking (preventing duplicate processing).

**Think of it like:**
- **Event ID** = Patient registration number
- **Platform-specific ID** = Official ID from the platform (Instagram entry ID)
- **Fallback hash** = Generated ID when platform doesn't provide one
- **Idempotency** = Ensuring each patient is registered only once

### Why Do We Need Event IDs?

**Without Event IDs:**
- Cannot detect duplicate webhooks
- Same webhook processed multiple times
- Data inconsistencies
- Wasted processing resources
- Compliance issues (duplicate records)

**With Event IDs:**
- Detect duplicate webhooks immediately
- Process each webhook exactly once
- Data consistency guaranteed
- Efficient resource usage
- Compliance with idempotency requirements

**Think of it like:**
- **Without Event IDs** = Registering the same patient multiple times
- **With Event IDs** = Checking patient ID before registration (prevent duplicates)

### Platform-Specific Event ID Extraction

**Instagram:**
```typescript
// Primary: Extract entry ID
const eventId = req.body.entry?.[0]?.id;

// Example Instagram payload:
{
  "object": "instagram",
  "entry": [
    {
      "id": "123456789",  // ← This is the event ID
      "time": 1234567890,
      "messaging": [...]
    }
  ]
}
```

**Facebook:**
```typescript
// Similar structure to Instagram
const eventId = req.body.entry?.[0]?.id;
```

**WhatsApp:**
```typescript
// May have different structure (to be implemented)
const eventId = req.body.entry?.[0]?.id;
```

**Think of it like:**
- **Platform ID** = Official patient ID from government system
- **Entry ID** = The unique identifier in the webhook payload
- **Primary source** = Most reliable identifier

### Fallback Hash Strategy

**When to Use Fallback:**
- Platform doesn't provide event ID
- Event ID is missing or invalid
- Need consistent ID for same payload

**Fallback Hash Process:**
1. **Normalize payload** (remove timestamps, sort keys, remove whitespace)
2. **Create timestamp bucket** (5-minute window: `Math.floor(Date.now() / 300000)`)
3. **Hash normalized payload + timestamp bucket** (SHA-256)
4. **Return hash as event ID**

**Why 5-Minute Bucket?**
- Groups similar webhooks within 5 minutes
- Prevents hash collisions from minor timing differences
- Balances uniqueness with consistency

**Think of it like:**
- **Normalize** = Standardizing document format
- **Timestamp bucket** = Grouping by time period (5 minutes)
- **Hash** = Creating unique fingerprint
- **Fallback** = Backup ID when official ID unavailable

**Implementation Pattern:**
```typescript
function generateFallbackEventId(payload: unknown): string {
  // 1. Normalize payload
  const normalized = normalizePayload(payload);
  
  // 2. Create timestamp bucket (5-minute window)
  const timestampBucket = Math.floor(Date.now() / 300000);
  
  // 3. Hash normalized payload + timestamp bucket
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized) + timestampBucket)
    .digest('hex');
  
  return hash;
}
```

---

## 🎓 Topic 3: Webhook Idempotency Service

### What is Idempotency?

**Idempotency** means processing the same webhook multiple times produces the same result as processing it once. In webhook processing, this means **each unique webhook event is processed exactly once**, even if the provider sends it multiple times.

**Think of it like:**
- **Idempotency** = Patient registration system (same patient registered once)
- **Duplicate webhook** = Same patient trying to register again
- **Idempotency check** = "Have we seen this patient ID before?"
- **Idempotency table** = Patient registry (tracks who's been registered)

### Why Do We Need Idempotency?

**Without Idempotency:**
- Same webhook processed multiple times
- Duplicate database records
- Duplicate actions (e.g., booking same appointment twice)
- Data inconsistencies
- Wasted processing resources
- Compliance violations (duplicate records)

**With Idempotency:**
- Each webhook processed exactly once
- No duplicate records
- Consistent data state
- Efficient resource usage
- Compliance with reliability requirements

**Think of it like:**
- **Without idempotency** = Registering same patient multiple times
- **With idempotency** = Checking registry first, registering only if new

### Idempotency Flow

**The Complete Flow:**
1. **Webhook arrives** → Extract event ID
2. **Check idempotency** → Query `webhook_idempotency` table
3. **If already processed** → Return 200 OK (already handled)
4. **If not processed** → Mark as "pending" → Process webhook → Mark as "processed"
5. **If processing fails** → Mark as "failed" → Retry or move to DLQ

**Think of it like:**
- **Check idempotency** = "Is this patient already registered?"
- **Already processed** = "Yes, already registered" → Skip
- **Not processed** = "No, new patient" → Register
- **Processing fails** = "Registration failed" → Retry or flag for review

### Idempotency Table Structure

**Table: `webhook_idempotency`**

**Required Columns:**
```sql
id              UUID PRIMARY KEY          -- Unique identifier
event_id        TEXT NOT NULL             -- Platform event ID or hash
provider        TEXT NOT NULL             -- 'facebook' | 'instagram' | 'whatsapp'
status          TEXT NOT NULL             -- 'pending' | 'processed' | 'failed'
correlation_id  TEXT NOT NULL             -- Request correlation ID
received_at     TIMESTAMPTZ NOT NULL      -- When webhook was received
processed_at    TIMESTAMPTZ               -- When processing completed
error_message   TEXT                       -- Error message if failed
retry_count     INTEGER DEFAULT 0         -- Number of retry attempts
```

**Think of it like:**
- **id** = Registry entry number
- **event_id** = Patient ID (unique identifier)
- **provider** = Which platform sent the webhook
- **status** = Registration status (pending/processed/failed)
- **correlation_id** = Internal tracking number
- **received_at** = When webhook arrived
- **processed_at** = When processing completed
- **error_message** = Why processing failed (if applicable)

### Idempotency Service Functions

**1. `isWebhookProcessed(eventId, provider)`**
- Checks if webhook was already processed
- Returns existing record if found (with status)
- Returns null if not found

**2. `markWebhookProcessing(eventId, provider, correlationId)`**
- Marks webhook as "pending" (processing started)
- Inserts or updates idempotency record
- Stores event_id, provider, correlation_id, received_at

**3. `markWebhookProcessed(eventId, provider)`**
- Marks webhook as "processed" (completed successfully)
- Updates status to 'processed'
- Sets processed_at timestamp

**4. `markWebhookFailed(eventId, provider, errorMessage)`**
- Marks webhook as "failed" (processing failed)
- Updates status to 'failed'
- Stores error_message and increments retry_count

**Think of it like:**
- **isWebhookProcessed** = "Is this patient registered?"
- **markWebhookProcessing** = "Starting registration process"
- **markWebhookProcessed** = "Registration completed successfully"
- **markWebhookFailed** = "Registration failed, need to retry"

### Idempotency States

**State Machine:**
```
[New Webhook]
    ↓
[pending] ← markWebhookProcessing()
    ↓
    ├─→ [processed] ← markWebhookProcessed() ✅
    │
    └─→ [failed] ← markWebhookFailed() ❌
            ↓
        [Retry or DLQ]
```

**Think of it like:**
- **pending** = Patient registration in progress
- **processed** = Registration completed successfully
- **failed** = Registration failed, needs retry or review

---

## 🎓 Topic 4: Security Best Practices

### Signature Verification Best Practices

**1. Verify BEFORE Processing:**
```typescript
// ✅ CORRECT: Verify first
if (!verifyWebhookSignature(req)) {
  throw new UnauthorizedError('Invalid signature');
}
// Then process...

// ❌ WRONG: Process then verify
processWebhook(req);
if (!verifyWebhookSignature(req)) { ... }
```

**2. Use Raw Body:**
```typescript
// ✅ CORRECT: Use raw body buffer
const rawBody = req.body; // Buffer, not parsed JSON
const hash = computeHMAC(rawBody, secret);

// ❌ WRONG: Use parsed JSON
const hash = computeHMAC(JSON.stringify(req.body), secret);
```

**3. Never Log Secrets:**
```typescript
// ✅ CORRECT: Log metadata only
logger.info({ event_id, provider }, 'Webhook verified');

// ❌ WRONG: Log signature or payload
logger.info({ signature, payload }, 'Webhook verified');
```

**4. Handle Missing Headers:**
```typescript
// ✅ CORRECT: Return false for missing header
if (!signature) {
  return false; // Invalid (missing signature)
}

// ❌ WRONG: Throw error immediately
if (!signature) {
  throw new Error('Missing signature'); // Too verbose
}
```

### Idempotency Best Practices

**1. Check Idempotency Early:**
```typescript
// ✅ CORRECT: Check before processing
const existing = await isWebhookProcessed(eventId, provider);
if (existing?.status === 'processed') {
  return { status: 'already_processed' };
}
// Then process...

// ❌ WRONG: Check after processing
await processWebhook(req);
const existing = await isWebhookProcessed(eventId, provider);
```

**2. Mark Processing State:**
```typescript
// ✅ CORRECT: Mark as pending before processing
await markWebhookProcessing(eventId, provider, correlationId);
try {
  await processWebhook(req);
  await markWebhookProcessed(eventId, provider);
} catch (error) {
  await markWebhookFailed(eventId, provider, error.message);
}

// ❌ WRONG: Don't mark processing state
await processWebhook(req); // No state tracking
```

**3. Handle Race Conditions:**
```typescript
// ✅ CORRECT: Use database constraints (unique event_id + provider)
// Database prevents duplicate inserts

// ❌ WRONG: Rely only on application logic
// Race condition: Two requests check simultaneously, both process
```

### Event ID Best Practices

**1. Prefer Platform IDs:**
```typescript
// ✅ CORRECT: Use platform ID if available
const eventId = extractInstagramEventId(req.body) 
  || generateFallbackEventId(req.body);

// ❌ WRONG: Always use fallback
const eventId = generateFallbackEventId(req.body);
```

**2. Normalize for Fallback:**
```typescript
// ✅ CORRECT: Normalize before hashing
const normalized = normalizePayload(payload);
const hash = hashPayload(normalized);

// ❌ WRONG: Hash raw payload
const hash = hashPayload(JSON.stringify(payload)); // Inconsistent
```

**3. Use Timestamp Buckets:**
```typescript
// ✅ CORRECT: 5-minute bucket for consistency
const bucket = Math.floor(Date.now() / 300000);

// ❌ WRONG: Exact timestamp (too granular)
const bucket = Date.now(); // Different hash for same payload
```

---

## 🎓 Topic 5: Implementation Patterns

### Signature Verification Pattern

**Complete Implementation:**
```typescript
import crypto from 'crypto';
import { env } from '../config/env';

export function verifyInstagramSignature(
  signature: string | undefined,
  rawBody: Buffer,
  correlationId: string
): boolean {
  // 1. Check if signature exists
  if (!signature) {
    logger.warn({ correlationId }, 'Missing signature header');
    return false;
  }

  // 2. Extract hash from header (format: sha256=<hash>)
  const match = signature.match(/^sha256=(.+)$/);
  if (!match) {
    logger.warn({ correlationId }, 'Invalid signature format');
    return false;
  }
  const receivedHash = match[1];

  // 3. Compute HMAC-SHA256
  const computedHash = crypto
    .createHmac('sha256', env.INSTAGRAM_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  // 4. Compare hashes (constant-time comparison)
  const isValid = crypto.timingSafeEqual(
    Buffer.from(receivedHash),
    Buffer.from(computedHash)
  );

  if (!isValid) {
    logger.warn({ correlationId }, 'Signature verification failed');
  }

  return isValid;
}
```

**Key Points:**
- Use `crypto.timingSafeEqual()` for constant-time comparison (prevents timing attacks)
- Extract hash from `sha256=<hash>` format
- Use raw body buffer (not parsed JSON)
- Log only metadata (never signature or payload)

### Event ID Extraction Pattern

**Complete Implementation:**
```typescript
export function extractInstagramEventId(payload: unknown): string | null {
  // Try to extract platform-specific ID
  if (
    payload &&
    typeof payload === 'object' &&
    'entry' in payload &&
    Array.isArray((payload as any).entry) &&
    (payload as any).entry.length > 0 &&
    (payload as any).entry[0]?.id
  ) {
    return String((payload as any).entry[0].id);
  }

  // Fallback to hash
  return null;
}

export function generateFallbackEventId(payload: unknown): string {
  // 1. Normalize payload
  const normalized = normalizePayload(payload);

  // 2. Create timestamp bucket (5-minute window)
  const timestampBucket = Math.floor(Date.now() / 300000);

  // 3. Hash normalized payload + timestamp bucket
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized) + timestampBucket)
    .digest('hex');

  return hash;
}

function normalizePayload(payload: unknown): unknown {
  // Remove timestamps, sort keys, remove whitespace
  // Implementation details...
  return payload;
}
```

### Idempotency Service Pattern

**Complete Implementation:**
```typescript
import { getSupabaseAdminClient } from '../config/database';
import { asyncHandler } from '../utils/async-handler';
import { NotFoundError, InternalError } from '../utils/errors';

export const isWebhookProcessed = asyncHandler(
  async (eventId: string, provider: WebhookProvider) => {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      throw new InternalError('Service role client not available');
    }

    const { data, error } = await supabase
      .from('webhook_idempotency')
      .select('*')
      .eq('event_id', eventId)
      .eq('provider', provider)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw new InternalError('Failed to check idempotency');
    }

    return data || null;
  }
);

export const markWebhookProcessing = asyncHandler(
  async (
    eventId: string,
    provider: WebhookProvider,
    correlationId: string
  ) => {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      throw new InternalError('Service role client not available');
    }

    const { data, error } = await supabase
      .from('webhook_idempotency')
      .upsert({
        event_id: eventId,
        provider,
        status: 'pending',
        correlation_id: correlationId,
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new InternalError('Failed to mark webhook processing');
    }

    return data;
  }
);
```

---

## 🎓 Topic 6: Compliance & Security Requirements

### Compliance Requirements

**From COMPLIANCE.md:**
- **Signature verification is MANDATORY** (section H)
- **Idempotency handling is MANDATORY** (section H)
- **Rate limiting on webhook endpoint is MANDATORY** (section H)
- **Never log PII/PHI** (only metadata)

**Think of it like:**
- **Signature verification** = Security checkpoint (mandatory)
- **Idempotency** = Patient registry (prevent duplicates, mandatory)
- **Rate limiting** = Queue management (prevent overload, mandatory)
- **No PII logging** = Privacy protection (mandatory)

### Security Requirements

**MANDATORY Security Rules:**
1. **Verify signature BEFORE any processing**
2. **Reject invalid signatures immediately** (401 Unauthorized)
3. **Check idempotency BEFORE processing**
4. **Never log signatures, payloads, or secrets**
5. **Use constant-time comparison** for signatures
6. **Store secrets in environment variables**

**Think of it like:**
- **Verify first** = Check passport before allowing entry
- **Reject invalid** = Turn away unauthorized visitors
- **Check idempotency** = Check registry before processing
- **Never log secrets** = Don't write down sensitive information
- **Constant-time comparison** = Prevent timing attacks
- **Environment variables** = Secure vault for secrets

---

## 🎓 Topic 7: Common Pitfalls & Solutions

### Pitfall 1: Using Parsed JSON for Signature Verification

**Problem:**
```typescript
// ❌ WRONG: Using parsed JSON
const hash = computeHMAC(JSON.stringify(req.body), secret);
```

**Why it fails:**
- JSON.stringify() may reorder keys
- Whitespace differences
- Different serialization = different hash

**Solution:**
```typescript
// ✅ CORRECT: Use raw body buffer
const hash = computeHMAC(req.body, secret); // req.body is Buffer
```

### Pitfall 2: Not Checking Idempotency Early

**Problem:**
```typescript
// ❌ WRONG: Check after processing
await processWebhook(req);
const existing = await isWebhookProcessed(eventId, provider);
```

**Why it fails:**
- Duplicate processing if check happens after
- Race conditions
- Wasted resources

**Solution:**
```typescript
// ✅ CORRECT: Check before processing
const existing = await isWebhookProcessed(eventId, provider);
if (existing?.status === 'processed') {
  return; // Already processed
}
await processWebhook(req);
```

### Pitfall 3: Not Using Constant-Time Comparison

**Problem:**
```typescript
// ❌ WRONG: Regular string comparison
const isValid = receivedHash === computedHash;
```

**Why it fails:**
- Timing attacks possible
- Attacker can learn hash bits by measuring response time

**Solution:**
```typescript
// ✅ CORRECT: Constant-time comparison
const isValid = crypto.timingSafeEqual(
  Buffer.from(receivedHash),
  Buffer.from(computedHash)
);
```

### Pitfall 4: Logging Sensitive Data

**Problem:**
```typescript
// ❌ WRONG: Log signature or payload
logger.info({ signature, payload }, 'Webhook received');
```

**Why it fails:**
- Security risk (signatures exposed)
- Compliance violation (PII in logs)
- Attack surface increased

**Solution:**
```typescript
// ✅ CORRECT: Log metadata only
logger.info({ event_id, provider, correlation_id }, 'Webhook received');
```

---

## 🎓 Topic 8: Testing Strategies

### Testing Signature Verification

**Test Cases:**
1. **Valid signature** → Should return `true`
2. **Invalid signature** → Should return `false`
3. **Missing header** → Should return `false`
4. **Malformed signature** → Should return `false`
5. **Wrong secret** → Should return `false`

**Test Pattern:**
```typescript
describe('verifyInstagramSignature', () => {
  it('should return true for valid signature', () => {
    const rawBody = Buffer.from(JSON.stringify(testPayload));
    const signature = computeValidSignature(rawBody);
    expect(verifyInstagramSignature(signature, rawBody, 'test')).toBe(true);
  });

  it('should return false for invalid signature', () => {
    const rawBody = Buffer.from(JSON.stringify(testPayload));
    const signature = 'sha256=invalid_hash';
    expect(verifyInstagramSignature(signature, rawBody, 'test')).toBe(false);
  });
});
```

### Testing Event ID Extraction

**Test Cases:**
1. **Platform ID available** → Should return platform ID
2. **Platform ID missing** → Should return fallback hash
3. **Same payload** → Should return same hash (consistency)
4. **Different payloads** → Should return different hashes

### Testing Idempotency Service

**Test Cases:**
1. **New webhook** → Should return `null` (not processed)
2. **Already processed** → Should return record with status 'processed'
3. **Mark processing** → Should create/update record with status 'pending'
4. **Mark processed** → Should update status to 'processed'
5. **Mark failed** → Should update status to 'failed' with error message

---

## 📚 Summary

### Key Concepts

1. **Signature Verification** = Cryptographic proof of webhook authenticity
2. **Event ID Extraction** = Unique identifier for each webhook event
3. **Idempotency** = Ensuring each webhook is processed exactly once
4. **HMAC-SHA256** = Cryptographic algorithm for signature verification
5. **Platform-Specific IDs** = Preferred identifiers from providers
6. **Fallback Hash** = Generated ID when platform ID unavailable

### Key Rules

1. **ALWAYS verify signature BEFORE processing**
2. **ALWAYS check idempotency BEFORE processing**
3. **NEVER log signatures, payloads, or secrets**
4. **Use raw body buffer for signature verification**
5. **Use constant-time comparison for signatures**
6. **Store secrets in environment variables**

### Implementation Checklist

- [ ] Signature verification utility created
- [ ] Event ID extraction utility created
- [ ] Idempotency service created
- [ ] All functions use asyncHandler
- [ ] All functions throw AppError on errors
- [ ] TypeScript types defined
- [ ] Tests written and passing
- [ ] Documentation complete

---

**Related Files:**
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Webhook security rules
- [RECIPES.md](../../Reference/RECIPES.md) - Implementation patterns
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Security requirements
- [Task 3: Webhook Security & Verification Utilities](../Daily-plans/2026-01-21/e-task-3-webhook-security.md)

**Last Updated:** 2026-01-26
