# Security Guide

**Purpose:** Security rules and patterns for the Clariva bot. Follow these guidelines to protect patient data, prevent attacks, and maintain trust.

**Audience:** AI agents and developers implementing features.

**Related:** [COMPLIANCE.md](./COMPLIANCE.md) | [STANDARDS.md](./STANDARDS.md) | [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md)

---

## 🔐 Core Security Principles

### 1. Defense in Depth

- **MUST:** Use multiple layers of security (authentication, authorization, input validation, encryption)
- **NEVER:** Rely on a single security control
- **Example:** JWT auth + RLS + input sanitization + rate limiting

### 2. Least Privilege

- **MUST:** Use the minimum permissions required for each operation
- **Service role:** Only for operations that bypass RLS (booking appointments, processing webhooks)
- **Anon key:** For user-facing operations (with RLS protecting data)
- **Example:** Doctors can only read their own appointments (RLS); webhook workers use service role to bypass RLS for system operations

### 3. Fail Secure

- **MUST:** Default to denial when security checks fail
- **Example:** Missing webhook signature → 401 (reject); RLS policy unsure → deny access
- **NEVER:** Fail-open for authentication or authorization

---

## 🛡️ Input Validation & Sanitization

### Rule: All Input is Untrusted

**MUST:** Validate and sanitize **all** external input:
- Request body (JSON, form data)
- Query parameters
- Path parameters
- Headers
- Webhook payloads

### Validation Strategy

**1. Use Zod for structure and type validation**

```typescript
// ✅ GOOD - Zod validates structure and types
const schema = z.object({
  patientName: z.string().min(1).max(100),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/),
  appointmentDate: z.string().datetime(),
});

const validated = schema.parse(req.body);
```

**2. Sanitize HTML/text to prevent XSS**

```typescript
import DOMPurify from 'isomorphic-dompurify';

// ✅ GOOD - Sanitize user-provided text before storing or displaying
const cleanText = DOMPurify.sanitize(userInput);
```

**See:** [STANDARDS.md](./STANDARDS.md) for Zod patterns; sanitize-input middleware for DOMPurify usage.

### SQL Injection Prevention

**MUST:** Use Supabase query builder (parameterized queries) — **NEVER** raw SQL with user input

```typescript
// ✅ GOOD - Supabase parameterizes automatically
const { data } = await supabase
  .from('appointments')
  .select('*')
  .eq('patient_phone', userPhone);

// ❌ BAD - Never construct raw SQL from user input
const { data } = await supabase.rpc('raw_query', { sql: `SELECT * FROM appointments WHERE phone='${userPhone}'` });
```

---

## 🔑 Authentication & Authorization

### Authentication (Who are you?)

**JWT for API endpoints**

```typescript
// MUST: Use auth middleware for protected endpoints
import { authenticateJWT } from '../middleware/auth';

router.get('/api/v1/appointments/:id', authenticateJWT, getAppointmentHandler);
```

**Webhook signature for webhooks**

```typescript
// MUST: Verify webhook signature before processing
if (!verifyInstagramSignature(signature, rawBody, correlationId)) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

### Authorization (What can you do?)

**Row-Level Security (RLS) for database**

- **MUST:** Enable RLS on all tables with user data
- **MUST:** Write policies that enforce ownership (e.g., doctors see only their appointments)
- **See:** [RLS_POLICIES.md](./RLS_POLICIES.md) for patterns

**Manual ownership checks (when using service role)**

```typescript
// When using service role client (bypasses RLS), validate ownership manually
const { data: appointment } = await supabase.from('appointments').select('doctor_id').eq('id', appointmentId).single();
if (!appointment || appointment.doctor_id !== userId) {
  throw new NotFoundError('Appointment not found');
}
```

---

## 🔐 Secrets Management

### Rule: Never Hardcode Secrets

**MUST:**
- Store secrets in `.env` (local/dev) or environment variables (prod)
- Add secrets to `.env.example` with placeholder values (`YOUR_KEY_HERE`)
- **NEVER** commit real secrets to Git

**MUST NOT:**
- Hardcode API keys, webhook secrets, or passwords in code
- Log secrets in any context (even debug logs)
- Return secrets in API responses

### Secret Rotation

**SHOULD:**
- Rotate secrets periodically (every 90 days for high-value secrets like database keys)
- Support zero-downtime rotation (accept old + new secret during transition)
- Document rotation procedure

**Example env secrets:**
```env
# ✅ GOOD - Secrets from env
RAZORPAY_KEY_SECRET=your_key_here
INSTAGRAM_APP_SECRET=your_app_secret

# ❌ BAD - Never in code
const secret = 'abc123xyz'; // NEVER DO THIS
```

---

## 🚨 OWASP Top 10 Checklist

**MUST:** Address these common vulnerabilities:

### 1. Broken Access Control
- [ ] RLS enabled on all user data tables
- [ ] API endpoints enforce authentication (JWT middleware)
- [ ] Manual ownership checks when using service role
- [ ] No direct object reference without validation (e.g., `GET /appointments/:id` checks userId)

### 2. Cryptographic Failures
- [ ] Secrets stored in env (not code)
- [ ] HTTPS/TLS for all external communication
- [ ] Webhook signature verification using HMAC-SHA256 or API-based validation
- [ ] No sensitive data in logs (PHI, PII, secrets)

### 3. Injection
- [ ] All input validated with Zod
- [ ] Supabase query builder used (no raw SQL with user input)
- [ ] Text sanitized with DOMPurify before storing/displaying
- [ ] No eval() or dynamic code execution with user input

### 4. Insecure Design
- [ ] Security requirements defined upfront (see [COMPLIANCE.md](./COMPLIANCE.md))
- [ ] Threat modeling for critical flows (payment, PHI access)
- [ ] Default-deny access model (RLS, auth required)

### 5. Security Misconfiguration
- [ ] `.env.example` has placeholders (no real secrets)
- [ ] Error messages do not leak stack traces or internal details to users
- [ ] Unnecessary services disabled (only essential endpoints exposed)

### 6. Vulnerable and Outdated Components
- [ ] Run `npm audit` regularly; fix high/critical vulnerabilities
- [ ] Keep dependencies up to date (`npm update`, semver ranges in package.json)
- [ ] Review security advisories for critical packages (Supabase, Express, OpenAI, Razorpay, PayPal)

### 7. Identification and Authentication Failures
- [ ] JWT tokens have expiration (`exp` claim)
- [ ] Refresh token rotation (if using refresh tokens)
- [ ] No weak credentials (enforce strong secrets for webhooks)

### 8. Software and Data Integrity Failures
- [ ] Webhook signature verification (prevents tampering)
- [ ] Idempotency for webhooks (prevents replay attacks)
- [ ] No unsigned/unverified data used in critical flows

### 9. Security Logging and Monitoring Failures
- [ ] Security events logged (webhook signature failures, auth failures) — see [OBSERVABILITY.md](./OBSERVABILITY.md)
- [ ] Correlation IDs for tracking requests
- [ ] Alerts for repeated auth failures or signature failures (future: monitoring)

### 10. Server-Side Request Forgery (SSRF)
- [ ] Do not allow user-provided URLs in API calls (if applicable)
- [ ] Validate external URLs if required (whitelist domains)

---

## 🔒 Webhook Security

**MUST:** Follow these rules for all webhooks (Instagram, Razorpay, PayPal, any future):

### 1. Signature Verification (MANDATORY)

- **MUST:** Verify webhook signature **before** any processing
- **Use raw request body** for signature verification (see [WEBHOOKS.md](./WEBHOOKS.md))
- **Reject** webhooks with missing or invalid signatures (401 Unauthorized)

```typescript
// ✅ GOOD - Verify signature first
if (!verifyInstagramSignature(signature, req.rawBody, correlationId)) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

### 2. Idempotency (Prevent Duplicates)

- **MUST:** Track processed webhook event IDs
- **Return 200** for duplicate webhooks without reprocessing
- **See:** [WEBHOOKS.md](./WEBHOOKS.md) for idempotency patterns

### 3. No Secrets in Logs

- **NEVER:** Log raw webhook payloads (may contain PII/PHI)
- **NEVER:** Log webhook signatures or secrets
- **Log:** Metadata only (event_id, provider, correlation_id, status)

---

## 🔐 Rate Limiting & Abuse Prevention

### API Rate Limiting

**MUST:** Apply rate limits to all public endpoints:

- **Webhook endpoints:** Strict limits (e.g., 100 req/min per IP) — see `webhookLimiter` in middleware/rate-limiters.ts
- **Public API endpoints:** Moderate limits (e.g., 1000 req/15min per IP)
- **Authenticated endpoints:** Higher limits per user (e.g., 5000 req/15min per user ID)

**See:** Rate limiter middleware in `src/middleware/rate-limiters.ts`

### Abuse Monitoring

**SHOULD:**
- Log repeated auth failures (potential brute-force)
- Alert on repeated signature verification failures (potential attack)
- Track request patterns for anomalies (future: automated blocking)

---

## 🛡️ Data Protection

### PHI/PII Handling

**MUST:** (See [COMPLIANCE.md](./COMPLIANCE.md) for full rules)
- No PHI in logs (patient names, phones, DOBs)
- No PHI in error messages returned to users
- Encrypt PHI at rest (database encryption via Supabase)
- Use HTTPS/TLS for all PHI in transit

### PCI Compliance (Payments)

**MUST:**
- **NEVER** store card numbers, CVV, or full card data
- Use payment gateway links (Razorpay, PayPal) — patients enter card details directly with the gateway
- Store only: `gateway_order_id`, `gateway_payment_id`, `amount_minor`, `currency`, `status`

---

## 🔍 Security Testing

### What to Test

- [ ] **Input validation:** Invalid/malicious input → ValidationError (400)
- [ ] **Auth bypass:** Missing JWT → UnauthorizedError (401)
- [ ] **Authorization bypass:** Wrong user accessing resource → NotFoundError (404, not 403 to avoid info leak)
- [ ] **SQL injection:** Special chars in input do not break queries
- [ ] **XSS:** HTML/script tags sanitized before storage
- [ ] **Webhook tampering:** Invalid signature → UnauthorizedError (401)
- [ ] **Rate limiting:** Exceeding limit → 429 Too Many Requests

### Security Test Pattern

```typescript
// Test auth bypass
it('returns 401 when JWT missing', async () => {
  const response = await request(app)
    .get('/api/v1/appointments/123')
    .expect(401);
  expect(response.body.error.code).toBe('UnauthorizedError');
});

// Test authorization (ownership)
it('returns 404 when user does not own resource', async () => {
  const response = await request(app)
    .get('/api/v1/appointments/other-doctor-appointment')
    .set('Authorization', 'Bearer valid-token')
    .expect(404);
  expect(response.body.error.code).toBe('NotFoundError');
});
```

---

## 🚨 Security Incident Response

### If a Security Issue is Discovered

1. **Stop:** Do not deploy affected code
2. **Assess:** Determine scope (what data is exposed, how many users affected)
3. **Fix:** Patch the vulnerability immediately
4. **Test:** Verify the fix with security tests
5. **Notify:** Inform affected users if PHI/PII was exposed (per [COMPLIANCE.md](./COMPLIANCE.md))
6. **Document:** Record incident, root cause, and fix in Notes or issue tracker
7. **Review:** Update this doc and [COMPLIANCE.md](./COMPLIANCE.md) if new patterns emerge

---

## 📋 Security Checklist (Per Feature)

Use this checklist when implementing any feature:

- [ ] **Input validation:** All inputs validated with Zod
- [ ] **Sanitization:** Text sanitized with DOMPurify before storage/display
- [ ] **Auth:** Protected endpoints use JWT middleware
- [ ] **Authorization:** RLS policies or manual ownership checks enforce access control
- [ ] **Secrets:** No hardcoded secrets; all from env
- [ ] **Logging:** No PHI, PII, or secrets in logs
- [ ] **Rate limiting:** Endpoint has appropriate rate limit
- [ ] **Error messages:** No stack traces or internal details exposed to users
- [ ] **Webhooks:** Signature verification + idempotency
- [ ] **Tests:** Security tests for auth bypass, authorization, input validation

---

## 🔗 Related Documentation

- [COMPLIANCE.md](./COMPLIANCE.md) — PHI, consent, audit, retention
- [STANDARDS.md](./STANDARDS.md) — Zod validation, error handling
- [WEBHOOKS.md](./WEBHOOKS.md) — Webhook signature and idempotency
- [RLS_POLICIES.md](./RLS_POLICIES.md) — Row-level security patterns
- [OBSERVABILITY.md](./OBSERVABILITY.md) — Security event logging

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
