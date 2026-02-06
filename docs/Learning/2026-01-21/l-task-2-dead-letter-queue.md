# Learning Topics - Dead Letter Queue Schema & Migration
## Task #2: Failed Webhook Payload Storage & Recovery

---

## 📚 What Are We Learning Today?

Today we're learning about **Dead Letter Queue (DLQ)** - a critical pattern for handling failed webhook processing. Think of it like **a secure filing cabinet for failed medical records** - when a webhook (like a patient message) fails to process after multiple retries, we store it securely in an encrypted "dead letter" table for manual review and recovery. This ensures we never lose important data and can recover from failures!

We'll learn about:
1. **Dead Letter Queue Concept** - What it is and why we need it
2. **Database Schema Design** - How to structure the dead letter table
3. **Encryption Requirements** - Why payloads must be encrypted
4. **RLS Policies** - Restricting access to sensitive data
5. **Service Implementation** - Creating functions to store and retrieve dead letters
6. **Recovery Mechanisms** - How to reprocess failed webhooks
7. **Compliance Considerations** - PHI/PII protection requirements
8. **Best Practices** - Security and operational patterns

---

## 🎓 Topic 1: What is a Dead Letter Queue?

### What is a Dead Letter Queue?

A **Dead Letter Queue (DLQ)** is a storage mechanism for messages that fail to process after all retry attempts are exhausted.

**Think of it like:**
- **Regular Queue** = Inbox (messages waiting to be processed)
- **Dead Letter Queue** = "Failed Mail" box (messages that couldn't be delivered after multiple attempts)
- **Like a hospital's "Undeliverable Records" file** = Patient records that couldn't be processed, stored securely for review

### Why Do We Need a Dead Letter Queue?

**Without Dead Letter Queue:**
- Failed webhooks are lost forever
- No way to recover from processing errors
- No audit trail for failures
- Cannot manually review and fix issues
- Compliance violations (lost patient data)

**With Dead Letter Queue:**
- Failed webhooks are preserved (encrypted)
- Can manually review failures
- Can reprocess after fixing issues
- Complete audit trail
- Compliance with data retention requirements

**Think of it like:**
- **Without DLQ** = Lost mail that can never be recovered
- **With DLQ** = Secure storage for failed mail that can be reviewed and redelivered

### When Do Webhooks Go to Dead Letter Queue?

**Webhook moves to DLQ when:**
1. **Max retries exceeded** (3 attempts failed)
2. **Signature verification fails** (after retries)
3. **Permanent processing error** (not retryable)
4. **Database errors** (connection failures, constraint violations)
5. **External service failures** (API timeouts, rate limits)

**Think of it like:**
- **Max retries** = Tried to deliver mail 3 times, all failed
- **Signature verification fails** = Mail is suspicious/fake
- **Permanent error** = Address doesn't exist (can't be fixed by retrying)

---

## 🎓 Topic 2: Database Schema Design

### Dead Letter Queue Table Structure

**Required Columns:**
```sql
id                  UUID PRIMARY KEY          -- Unique identifier
event_id            TEXT NOT NULL             -- Platform event ID or hash
provider            TEXT NOT NULL             -- 'facebook' | 'instagram' | 'whatsapp'
received_at         TIMESTAMPTZ NOT NULL      -- When webhook was received
correlation_id      TEXT NOT NULL             -- Request correlation ID
payload_encrypted   TEXT NOT NULL             -- Encrypted webhook payload
error_message       TEXT NOT NULL             -- Error that caused failure
retry_count         INTEGER NOT NULL          -- Number of retry attempts
failed_at           TIMESTAMPTZ NOT NULL      -- When it was moved to DLQ
```

**Think of it like:**
- **id** = File number in the filing cabinet
- **event_id** = Original mail tracking number
- **provider** = Which mail service (Instagram, Facebook, etc.)
- **received_at** = When mail arrived
- **correlation_id** = Internal tracking number
- **payload_encrypted** = Encrypted contents (locked in safe)
- **error_message** = Why delivery failed
- **retry_count** = How many times we tried
- **failed_at** = When we gave up and filed it

### Indexes for Performance

**Required Indexes:**
```sql
-- Find by provider (common query)
CREATE INDEX idx_dead_letter_provider ON dead_letter_queue(provider);

-- Find by failure date (for cleanup)
CREATE INDEX idx_dead_letter_failed_at ON dead_letter_queue(failed_at);

-- Find by event ID (for recovery)
CREATE INDEX idx_dead_letter_event_id ON dead_letter_queue(event_id);
```

**Think of it like:**
- **Provider index** = Organized by mail service (Instagram section, Facebook section)
- **Failed date index** = Organized by date (for cleanup of old items)
- **Event ID index** = Quick lookup by tracking number

### Constraints

**Required Constraints:**
```sql
-- Provider must be valid
CHECK (provider IN ('facebook', 'instagram', 'whatsapp'))

-- Retry count must be non-negative
CHECK (retry_count >= 0)

-- Required fields
NOT NULL constraints on: event_id, provider, received_at, correlation_id, payload_encrypted, error_message, retry_count, failed_at
```

**Think of it like:**
- **Provider constraint** = Only accept mail from known services
- **Retry count constraint** = Can't have negative retry attempts
- **NOT NULL** = All required information must be present

---

## 🎓 Topic 3: Encryption Requirements

### Why Must Payloads Be Encrypted?

**CRITICAL:** Webhook payloads contain PII/PHI (patient identifiers, message content).

**Compliance Requirements:**
- **HIPAA (US):** PHI must be encrypted at rest
- **GDPR (EU):** Personal data must be encrypted
- **PIPEDA (Canada):** Personal information must be protected
- **PDPA (Singapore):** Personal data must be secured

**Think of it like:**
- **Unencrypted payload** = Patient records in unlocked filing cabinet
- **Encrypted payload** = Patient records in locked safe
- **Compliance** = Legal requirement to lock the safe

### Encryption Algorithm

**Required:** AES-256-GCM (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode)

**Why AES-256-GCM?**
- **AES-256:** Strong encryption (256-bit key)
- **GCM mode:** Authenticated encryption (detects tampering)
- **Industry standard:** Widely used and trusted
- **Performance:** Fast encryption/decryption

**Think of it like:**
- **AES-256** = Military-grade lock
- **GCM mode** = Lock with tamper detection
- **Industry standard** = Certified security system

### Encryption Key Management

**Key Storage:**
- Store encryption key in environment variables
- Never commit keys to version control
- Use different keys for development/production
- Rotate keys periodically (every 90 days)

**Key Format:**
```typescript
// Environment variable
ENCRYPTION_KEY=base64-encoded-32-byte-key

// Generate key (one-time setup)
const key = crypto.randomBytes(32); // 256 bits
const keyBase64 = key.toString('base64');
```

**Think of it like:**
- **Environment variable** = Safe combination stored securely
- **Never in code** = Don't write combination on paper
- **Different keys** = Different combinations for different locations
- **Rotate keys** = Change combination periodically

---

## 🎓 Topic 4: Row-Level Security (RLS) Policies

### Why RLS is Required

**Security Requirement:**
- Dead letter queue contains encrypted PHI/PII
- Only authorized personnel should access
- Service role needs full access (for storing/retrieving)
- Admin users need read-only access (for compliance reviews)
- Regular users should have NO access

**Think of it like:**
- **Service role** = Hospital staff who can file and retrieve records
- **Admin users** = Compliance officers who can review records
- **Regular users** = Patients who cannot access records

### RLS Policy Structure

**Service Role Policy (Full Access):**
```sql
-- Service role can do everything
CREATE POLICY "service_role_full_access" ON dead_letter_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Admin User Policy (Read-Only):**
```sql
-- Admin users can only read (for compliance reviews)
CREATE POLICY "admin_read_only" ON dead_letter_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );
```

**Deny All Other Access:**
```sql
-- Default deny (no other access)
-- RLS is enabled, so only policies above apply
```

**Think of it like:**
- **Service role policy** = Staff can file and retrieve
- **Admin policy** = Compliance officers can review
- **Default deny** = Everyone else is locked out

---

## 🎓 Topic 5: Service Implementation

### Dead Letter Service Functions

**Required Functions:**

1. **`storeDeadLetterWebhook`** - Store failed webhook
2. **`getDeadLetterWebhook`** - Retrieve by ID
3. **`listDeadLetterWebhooks`** - List with filters
4. **`reprocessDeadLetterWebhook`** - Re-queue for processing

**Think of it like:**
- **Store** = File failed mail in cabinet
- **Get** = Retrieve specific file
- **List** = Browse files by criteria
- **Reprocess** = Re-send mail after fixing issue

### Store Function Implementation

**Steps:**
1. Encrypt payload using encryption utility
2. Store encrypted payload in database
3. Store metadata (event_id, provider, correlation_id, error_message, retry_count)
4. Log to audit table (metadata only, no payload)
5. Return stored record ID

**Example:**
```typescript
async function storeDeadLetterWebhook(
  eventId: string,
  provider: 'facebook' | 'instagram' | 'whatsapp',
  payload: unknown,
  errorMessage: string,
  retryCount: number,
  correlationId: string
): Promise<string> {
  // 1. Encrypt payload
  const encryptedPayload = await encryptPayload(JSON.stringify(payload));
  
  // 2. Store in database
  const { data, error } = await supabase
    .from('dead_letter_queue')
    .insert({
      event_id: eventId,
      provider,
      correlation_id: correlationId,
      payload_encrypted: encryptedPayload,
      error_message: errorMessage,
      retry_count: retryCount,
      failed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  
  if (error) throw new DatabaseError('Failed to store dead letter webhook');
  
  // 3. Log to audit (metadata only)
  await logAuditEvent(correlationId, null, 'dead_letter_stored', 'low', null, {
    event_id: eventId,
    provider,
    retry_count: retryCount,
  });
  
  return data.id;
}
```

**Think of it like:**
- **Step 1** = Lock the document in a safe
- **Step 2** = File it in the cabinet
- **Step 3** = Log that it was filed (without contents)

### Retrieval Functions

**Get by ID:**
```typescript
async function getDeadLetterWebhook(id: string): Promise<DeadLetterQueueWithDecrypted> {
  // 1. Retrieve from database
  const { data, error } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw new NotFoundError('Dead letter webhook not found');
  
  // 2. Decrypt payload
  const decryptedPayload = await decryptPayload(data.payload_encrypted);
  
  // 3. Return with decrypted payload
  return {
    ...data,
    payload: JSON.parse(decryptedPayload),
  };
}
```

**List with Filters:**
```typescript
async function listDeadLetterWebhooks(
  provider?: string,
  startDate?: Date,
  endDate?: Date
): Promise<DeadLetterQueue[]> {
  let query = supabase.from('dead_letter_queue').select('*');
  
  if (provider) {
    query = query.eq('provider', provider);
  }
  
  if (startDate) {
    query = query.gte('failed_at', startDate.toISOString());
  }
  
  if (endDate) {
    query = query.lte('failed_at', endDate.toISOString());
  }
  
  const { data, error } = await query.order('failed_at', { ascending: false });
  
  if (error) throw new DatabaseError('Failed to list dead letter webhooks');
  
  // Return without decrypted payload (for listing)
  return data;
}
```

**Think of it like:**
- **Get by ID** = Retrieve specific file and unlock it
- **List** = Browse file index (without unlocking)

---

## 🎓 Topic 6: Recovery Mechanisms

### Reprocessing Dead Letter Items

**Recovery Process:**
1. Retrieve dead letter record
2. Decrypt payload
3. Re-queue for processing (add to webhook queue)
4. Mark as reprocessed (optional: delete or add status field)
5. Log recovery action

**Example:**
```typescript
async function reprocessDeadLetterWebhook(id: string): Promise<void> {
  // 1. Retrieve and decrypt
  const deadLetter = await getDeadLetterWebhook(id);
  
  // 2. Re-queue for processing
  await webhookQueue.add({
    eventId: deadLetter.event_id,
    provider: deadLetter.provider,
    payload: deadLetter.payload,
    correlationId: deadLetter.correlation_id,
  });
  
  // 3. Mark as reprocessed (optional: delete or update status)
  await supabase
    .from('dead_letter_queue')
    .delete()
    .eq('id', id);
  
  // 4. Log recovery
  await logAuditEvent(
    deadLetter.correlation_id,
    null,
    'dead_letter_reprocessed',
    'low',
    null,
    { event_id: deadLetter.event_id, provider: deadLetter.provider }
  );
}
```

**Think of it like:**
- **Step 1** = Retrieve failed mail from filing cabinet
- **Step 2** = Unlock and read contents
- **Step 3** = Re-send mail (after fixing address)
- **Step 4** = Remove from failed mail file
- **Step 5** = Log that it was re-sent

### When to Reprocess

**Reprocess when:**
- Underlying issue is fixed (database connection restored)
- Bug in processing logic is fixed
- External service is back online
- Manual review confirms it's safe to retry

**Do NOT reprocess when:**
- Signature verification still fails (security issue)
- Payload is malformed (can't be fixed)
- Permanent error (address doesn't exist)

**Think of it like:**
- **Reprocess** = Re-send mail after fixing address
- **Don't reprocess** = Don't re-send mail to invalid address

---

## 🎓 Topic 7: Compliance Considerations

### PHI/PII Protection

**CRITICAL Rules:**
- **NEVER log payload content** - Contains PHI/PII
- **ALWAYS encrypt before storage** - Required by law
- **ONLY decrypt for authorized users** - Admin access only
- **Audit all access** - Who accessed what, when

**Allowed Logging:**
```typescript
// ✅ GOOD - Only metadata
logger.info('Dead letter stored', {
  event_id: eventId,
  provider: provider,
  correlation_id: correlationId,
  retry_count: retryCount,
});

// ❌ BAD - Never log payload
logger.info('Dead letter stored', {
  payload: payload, // Contains PHI!
});
```

**Think of it like:**
- **Allowed** = Log that mail was filed (metadata)
- **Not allowed** = Log mail contents (PHI)

### Retention Policy

**Required:** 90 days retention (per WEBHOOKS.md)

**Cleanup Process:**
- Delete records older than 90 days
- Run cleanup job daily
- Log cleanup actions
- Archive before deletion (optional)

**Example:**
```typescript
async function cleanupOldDeadLetters(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  const { data, error } = await supabase
    .from('dead_letter_queue')
    .delete()
    .lt('failed_at', cutoffDate.toISOString())
    .select('id');
  
  if (error) throw new DatabaseError('Failed to cleanup dead letters');
  
  // Log cleanup
  await logAuditEvent(
    'system',
    null,
    'dead_letter_cleanup',
    'low',
    null,
    { deleted_count: data.length, cutoff_date: cutoffDate.toISOString() }
  );
  
  return data.length;
}
```

**Think of it like:**
- **90 days** = Keep failed mail for 3 months
- **Cleanup** = Shred old mail after retention period
- **Log cleanup** = Record what was shredded

---

## 🎓 Topic 8: Best Practices

### Security Best Practices

**1. Encryption Key Management:**
- Store keys in environment variables
- Use different keys for dev/prod
- Rotate keys periodically
- Never commit keys to version control

**2. Access Control:**
- RLS policies restrict access
- Only service role can write
- Only admin users can read
- Regular users have no access

**3. Audit Logging:**
- Log all dead letter operations
- Log who accessed what
- Log when items were reprocessed
- Never log payload content

**Think of it like:**
- **Key management** = Secure safe combinations
- **Access control** = Locked filing cabinet
- **Audit logging** = Visitor log (who accessed what)

### Operational Best Practices

**1. Monitoring:**
- Monitor dead letter queue size
- Alert when queue grows too large
- Track failure rates by provider
- Monitor encryption/decryption errors

**2. Recovery Process:**
- Review dead letters daily
- Fix underlying issues
- Reprocess after fixes
- Document recovery actions

**3. Documentation:**
- Document common failure patterns
- Document recovery procedures
- Document encryption key rotation
- Document retention policy

**Think of it like:**
- **Monitoring** = Check filing cabinet regularly
- **Recovery** = Fix issues and re-send mail
- **Documentation** = Keep records of procedures

---

## 🎓 Topic 9: Integration with Webhook Processing

### How Dead Letter Queue Fits in Webhook Flow

**Complete Flow:**
```
1. Webhook received
   ↓
2. Verify signature → 401 if invalid
   ↓
3. Check idempotency → 200 if already processed
   ↓
4. Queue for processing
   ↓
5. Return 200 OK
   ↓
6. [Async] Process webhook
   ↓
7. If processing fails → Retry (max 3 attempts)
   ↓
8. If all retries fail → Dead Letter Queue
   ↓
9. Manual review required
```

**Think of it like:**
- **Steps 1-5** = Receive mail and file it
- **Step 6** = Try to process mail
- **Step 7** = Retry if processing fails
- **Step 8** = Move to failed mail file if all retries fail
- **Step 9** = Manual review and recovery

### Error Handling

**Retryable Errors:**
- Database connection failures
- External API timeouts
- Temporary service unavailability
- Rate limit exceeded (wait and retry)

**Non-Retryable Errors:**
- Signature verification fails
- Malformed payload
- Invalid event ID
- Permanent business logic errors

**Think of it like:**
- **Retryable** = Temporary issues (try again later)
- **Non-retryable** = Permanent issues (can't be fixed by retrying)

---

## 🎓 Topic 10: TypeScript Types

### Type Definitions

**Dead Letter Queue Type:**
```typescript
interface DeadLetterQueue {
  id: string;                    // UUID
  event_id: string;              // Platform event ID
  provider: 'facebook' | 'instagram' | 'whatsapp';
  received_at: string;           // ISO timestamp
  correlation_id: string;        // Request correlation ID
  payload_encrypted: string;      // Encrypted JSON string
  error_message: string;         // Error description
  retry_count: number;            // Number of retries
  failed_at: string;             // ISO timestamp
}

interface DeadLetterQueueInsert {
  event_id: string;
  provider: 'facebook' | 'instagram' | 'whatsapp';
  correlation_id: string;
  payload_encrypted: string;
  error_message: string;
  retry_count: number;
}

interface DeadLetterQueueWithDecrypted extends Omit<DeadLetterQueue, 'payload_encrypted'> {
  payload: unknown;              // Decrypted payload
}
```

**Think of it like:**
- **DeadLetterQueue** = File record (with encrypted contents)
- **DeadLetterQueueInsert** = New file to create
- **DeadLetterQueueWithDecrypted** = File with unlocked contents

---

## 📝 Summary

### Key Takeaways

1. **Dead Letter Queue stores failed webhooks** - After max retries are exhausted
2. **Payloads MUST be encrypted** - Contains PHI/PII, required by law
3. **RLS policies restrict access** - Only service role and admin users
4. **Recovery mechanism allows reprocessing** - After fixing underlying issues
5. **90-day retention policy** - Per WEBHOOKS.md
6. **Never log payload content** - Only log metadata
7. **Audit all operations** - Who accessed what, when

### When to Use Dead Letter Queue

- Webhook processing fails after max retries
- Signature verification fails (after retries)
- Permanent processing errors
- Database errors
- External service failures

### Security Checklist

- ✅ Payloads encrypted before storage
- ✅ Encryption key in environment variables
- ✅ RLS policies restrict access
- ✅ Only metadata logged (never payload)
- ✅ Audit logging for all operations
- ✅ 90-day retention policy enforced

---

## 🔗 Related Topics

- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Webhook processing rules
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - PHI encryption requirements
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - Database schema patterns
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - Row-level security rules

---

**Last Updated:** 2026-01-21  
**Related Task:** [e-task-2-dead-letter-queue.md](../Development/Daily-plans/2026-01-21/e-task-2-dead-letter-queue.md)  
**Pattern:** Dead letter queue pattern, encryption pattern, RLS pattern
