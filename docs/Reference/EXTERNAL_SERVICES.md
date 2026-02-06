# External Services Integration Rules
## Patterns for Third-Party Service Integration

**⚠️ CRITICAL: External services are where production fires start. Follow these rules exactly.**

---

## 🎯 Purpose

This file governs integration with external services (Supabase, Meta platforms, AI services, etc.).

**This file owns:**
- Timeout defaults
- Retry policies
- Rate limit handling
- Cost protection
- Error handling patterns
- Idempotency requirements

**This file MUST NOT contain:**
- API contracts (see CONTRACTS.md)
- Implementation recipes (see RECIPES.md)
- Compliance rules (see COMPLIANCE.md)

---

## 📋 Related Files

- [COMPLIANCE.md](./COMPLIANCE.md) - Privacy and data handling requirements
- [SAFE_DEFAULTS.md](./SAFE_DEFAULTS.md) - Default timeout and retry values
- [STANDARDS.md](./STANDARDS.md) - Error handling and logging rules
- [RECIPES.md](./RECIPES.md) - Integration implementation patterns

---

## ⚡ Defaults (Global-Safe)

**Timeout:**
- Default: **3-8 seconds** (see SAFE_DEFAULTS.md for specific values)
- External API: 3-8 seconds
- Database queries: 3-5 seconds
- HTTP requests: 10-15 seconds

**Retries:**
- **Idempotent operations only** (GET, safe operations)
- **Writes require idempotency keys** before retry
- Max retries: 3 attempts
- Backoff: Exponential (1s, 2s, 4s)

**Rationale:**
- Prevents runaway costs from retries
- Prevents duplicate writes
- Fails fast to avoid blocking requests

---

## ✅ MUST Rules

### Handle Rate Limits Explicitly

**Rule:** All external service calls MUST handle rate limits explicitly.

**Implementation:**
- Check rate limit headers (X-RateLimit-Remaining, Retry-After)
- Implement exponential backoff on 429 responses
- Log rate limit hits (without payloads)
- Queue requests if rate limit is hit (don't fail immediately)

**Example:**
```typescript
// ✅ CORRECT - Handle rate limits
try {
  const response = await externalApi.call(data);
  return response;
} catch (error) {
  if (error.statusCode === 429) {
    const retryAfter = error.headers['retry-after'] || 60;
    // Queue for retry or return rate limit error
    throw new TooManyRequestsError(`Rate limit exceeded. Retry after ${retryAfter}s`);
  }
  throw error;
}
```

### Log Failures Without Payloads

**Rule:** Log external service failures with metadata only (no payloads, no secrets).

**Allowed Logging:**
- Service name (e.g., 'openai', 'supabase')
- Error type (e.g., 'rate_limit', 'timeout', 'auth_error')
- Status code
- Correlation ID
- Retry attempt number

**FORBIDDEN Logging:**
- Request payloads (may contain PHI)
- Response payloads (may contain PHI)
- API keys or secrets
- User identifiers (unless anonymized)

**Example:**
```typescript
// ✅ CORRECT - Log metadata only
logger.error('External API call failed', {
  service: 'openai',
  errorType: 'rate_limit',
  statusCode: 429,
  correlationId: req.correlationId,
  retryAttempt: 1,
  // ❌ NEVER: requestPayload, responsePayload, apiKey
});
```

### Protect Against Runaway Costs

**Rule:** Implement cost protection for paid external services.

**Protection Mechanisms:**
- Daily/monthly spending limits
- Per-request cost tracking
- Alert on cost thresholds
- Circuit breaker on repeated failures (prevents retry storms)

**Example:**
```typescript
// ✅ CORRECT - Cost protection
const dailyLimit = 100; // $100/day
const todaySpent = await getDailySpend('openai');

if (todaySpent >= dailyLimit) {
  throw new TooManyRequestsError('Daily API cost limit reached');
}

// Track cost after successful call
await trackApiCost('openai', estimatedCost);
```

---

## ❌ DO NOT Rules

### Retry Non-Idempotent Writes

**Rule:** NEVER retry non-idempotent writes without idempotency keys.

**Non-Idempotent Operations:**
- POST requests (creates new resources)
- PUT requests (updates resources)
- DELETE requests (removes resources)
- Any operation that changes state

**Exception:**
- Only retry if idempotency key is provided
- Idempotency key must be unique per operation
- Service must support idempotency (check service documentation)

**Example:**
```typescript
// ❌ WRONG - Retry without idempotency key
await retry(() => createAppointment(data), { maxRetries: 3 }); // DANGEROUS

// ✅ CORRECT - Retry with idempotency key
await retry(
  () => createAppointment(data, { idempotencyKey: req.correlationId }),
  { maxRetries: 3 }
);
```

### Log Secrets or Payloads

**Rule:** NEVER log API keys, secrets, or request/response payloads.

**FORBIDDEN:**
- API keys in logs
- Request bodies (may contain PHI)
- Response bodies (may contain PHI)
- Authentication tokens
- Webhook payloads

**See:** [COMPLIANCE.md](./COMPLIANCE.md) "Global Privacy Baseline" section

### Hard-Code Provider-Specific Logic in Controllers

**Rule:** Provider-specific logic MUST be in service layer, not controllers.

**Architecture:**
- Controllers → Services → External Service Adapters
- Adapters handle provider-specific logic
- Services are provider-agnostic
- Controllers are framework-specific (Express)

**Example:**
```typescript
// ❌ WRONG - Provider logic in controller
export const createAppointment = asyncHandler(async (req, res) => {
  // Provider-specific logic in controller
  if (provider === 'openai') {
    const response = await openai.chat.completions.create({...});
  } else if (provider === 'anthropic') {
    const response = await anthropic.messages.create({...});
  }
});

// ✅ CORRECT - Provider logic in service/adapter
export const createAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.create(validated); // Provider-agnostic
  return res.status(201).json(successResponse(result, req));
});
```

---

## 🔌 Service-Specific Patterns

### Supabase Integration

**Patterns:**
- Use connection pooling (automatic in Supabase client)
- Handle RLS policies (service role bypasses RLS - use carefully)
- Use transactions for multi-table writes (or compensating logic)
- Select specific fields (no `select *`)

**Error Handling:**
- Supabase errors are typed (PostgrestError, AuthError)
- Map to application errors (see ERROR_CATALOG.md)
- Handle connection errors gracefully

**See:** [DB_SCHEMA.md](./DB_SCHEMA.md) for schema patterns
**See:** [RLS_POLICIES.md](./RLS_POLICIES.md) for RLS patterns

### Meta Platform Integration (Facebook/Instagram/WhatsApp)

**Patterns:**
- Always verify webhook signatures
- Use platform-specific ID extraction for idempotency
- Handle rate limits (Meta has strict limits)
- Queue webhook processing (async)

**Error Handling:**
- 401 → Invalid signature (log and reject)
- 429 → Rate limit (queue for retry)
- 500 → Platform error (dead letter queue)

**Config:** When using webhooks and dead letter storage, `ENCRYPTION_KEY` is required (see [WEBHOOKS.md](./WEBHOOKS.md)).

**See:** [WEBHOOKS.md](./WEBHOOKS.md) for complete webhook patterns

### Payment Gateway Integration (Razorpay, PayPal)

**Dual Gateway Strategy (Best Customer Experience):**
- **India (INR):** Razorpay — UPI, cards, netbanking; amount in paise
- **International (USD/EUR/GBP):** PayPal — cards, Apple Pay, PayPal balance; amount in cents
- **Future:** Stripe preferred for international (lower fees) but invite-only in India; gateway abstraction enables swap when Stripe opens

**Patterns:**
- Use gateway abstraction layer (`PaymentGateway` interface) for future Stripe migration
- Route by `doctor.country` or `doctor.currency`: India → Razorpay; US/UK/EU → PayPal
- Always verify webhook signatures (raw request body); idempotency with `provider='razorpay'` or `'paypal'`
- Store only metadata: order_id, gateway_ref, amount_minor, currency, status; never card data (PCI)

**Error Handling:**
- 401 → Invalid signature (log and reject)
- 409 → Conflict/duplicate (idempotent 200, skip processing)
- 500 → Gateway error (dead letter queue, retry per WEBHOOKS.md)

**Config:** RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET; PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET

**See:** [WEBHOOKS.md](./WEBHOOKS.md) for webhook patterns; [DB_SCHEMA.md](./DB_SCHEMA.md) for payments table

### AI Service Integration (OpenAI, Anthropic, etc.)

**Patterns:**
- Implement cost tracking per request
- Use streaming for long responses (better UX)
- Handle token limits (input and output)
- Implement prompt injection protection

**Error Handling:**
- 429 → Rate limit (exponential backoff)
- 401 → Invalid API key (fail fast, alert)
- 500 → Service error (retry with backoff)
- 400 → Invalid request (don't retry, log error)

**Cost Protection:**
- Track tokens used per request
- Implement daily/monthly limits
- Alert on cost thresholds
- Circuit breaker on repeated failures

**PHI Handling:**
- Redact PHI before sending to AI services
- Log AI interactions (without PHI)
- Require explicit consent for PHI in AI prompts

**See:** [COMPLIANCE.md](./COMPLIANCE.md) "External AI" section

### Email (Resend) — e-task-5

**Provider:** Resend (https://resend.com). TLS 1.2+ by default (HTTPS).

**Patterns:**
- Use `config/email.ts` sendEmail helper; when RESEND_API_KEY is not set, no-op (log and skip, don't block flows)
- Inline templates for Phase 0; no PII in logs (only metadata: correlationId, emailId)
- Notification failures must not block booking or payment (fire-and-forget with catch log)

**Config:** RESEND_API_KEY (optional); DEFAULT_DOCTOR_EMAIL (optional fallback when doctor not in auth)

**See:** [COMPLIANCE.md](./COMPLIANCE.md) — no PII in logs; audit all notification events

---

## 🔄 Retry Strategy

### When to Retry

**Retry:**
- Network errors (ECONNREFUSED, ETIMEDOUT)
- 5xx server errors (temporary failures)
- 429 rate limit errors (with backoff)

**Don't Retry:**
- 4xx client errors (400, 401, 403, 404) - client error, not retryable
- Non-idempotent writes without idempotency keys
- Validation errors

### Retry Configuration

**Default:**
- Max retries: 3
- Backoff: Exponential (1s, 2s, 4s)
- Timeout: Per-service default (3-8 seconds)

**Example:**
```typescript
const retryConfig = {
  maxRetries: 3,
  backoff: {
    type: 'exponential',
    initialDelay: 1000, // 1 second
    maxDelay: 4000, // 4 seconds
  },
  retryable: (error) => {
    // Only retry on network or 5xx errors
    return error.code === 'ECONNREFUSED' ||
           error.code === 'ETIMEDOUT' ||
           (error.statusCode >= 500 && error.statusCode < 600);
  },
};
```

---

## 💰 Cost Management

### Cost Tracking

**Track:**
- Per-service costs (daily, monthly)
- Per-request costs (if available)
- Token usage (for AI services)
- API call counts

**Alert Thresholds:**
- 80% of daily limit → Warning
- 100% of daily limit → Block requests
- Unusual spike → Alert immediately

### Cost Protection

**Mechanisms:**
- Daily/monthly spending limits
- Per-user rate limits (prevent abuse)
- Circuit breaker on cost spikes
- Automatic shutdown on limit exceeded

**Example:**
```typescript
// Cost protection middleware
export async function checkCostLimit(service: string, estimatedCost: number) {
  const dailySpend = await getDailySpend(service);
  const dailyLimit = getDailyLimit(service);
  
  if (dailySpend + estimatedCost > dailyLimit) {
    throw new TooManyRequestsError(`Daily cost limit for ${service} exceeded`);
  }
}
```

---

## 🚨 Error Handling

### Error Mapping

**Map external service errors to application errors:**

- Network errors → `InternalError` (500)
- Timeout errors → `InternalError` (500)
- Rate limit errors → `TooManyRequestsError` (429)
- Auth errors → `UnauthorizedError` (401)
- Validation errors → `ValidationError` (400)
- Not found errors → `NotFoundError` (404)

**See:** [ERROR_CATALOG.md](./ERROR_CATALOG.md) for error classes

### Error Logging

**Log:**
- Service name
- Error type
- Status code
- Correlation ID
- Retry attempt

**Never Log:**
- Request payloads
- Response payloads
- API keys
- Secrets

**See:** [OBSERVABILITY.md](./OBSERVABILITY.md) "Metrics Baseline" section

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [COMPLIANCE.md](./COMPLIANCE.md) - Privacy and data handling
- [SAFE_DEFAULTS.md](./SAFE_DEFAULTS.md) - Default timeout and retry values
- [STANDARDS.md](./STANDARDS.md) - Error handling and logging
- [RECIPES.md](./RECIPES.md) - Implementation patterns
- [WEBHOOKS.md](./WEBHOOKS.md) - Webhook-specific patterns
