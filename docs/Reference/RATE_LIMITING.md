# Rate Limiting Guide

**Purpose:** Rate limiting patterns and configuration for protecting the Clariva bot from abuse and ensuring fair usage.

**Audience:** AI agents and developers implementing endpoints.

**Related:** [SECURITY.md](./SECURITY.md) | [RECIPES.md](./RECIPES.md) | [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md)

---

## 🚦 Core Principles

### 1. Prevent Abuse

- **Protect from:** Brute force attacks, DDoS, scraping, API abuse
- **Method:** Limit requests per IP or user per time window

### 2. Fair Usage

- **Ensure:** All users get fair access; no single user monopolizes resources
- **Method:** Per-user or per-IP limits

### 3. Fail Gracefully

- **When limit exceeded:** Return `429 Too Many Requests` with `Retry-After` header
- **Log:** Rate limit violations as security events (see [SECURITY.md](./SECURITY.md))

---

## 🔢 Rate Limit Configuration

### Existing Rate Limiters

**File:** `backend/src/middleware/rate-limiters.ts`

#### Webhook Limiter

- **Applied to:** `POST /webhooks/*` (Instagram, Razorpay, PayPal)
- **Limit:** 1000 requests per 15 minutes per IP
- **Rationale:** Meta/payment gateways send many webhooks; high limit to prevent blocking legitimate traffic
- **Key:** IP address

**Usage:**
```typescript
import { webhookLimiter } from '../middleware/rate-limiters';
router.post('/webhooks/instagram', webhookLimiter, handleInstagramWebhook);
```

---

## 📋 Recommended Rate Limits

### By Endpoint Type

| Endpoint Type | Limit | Window | Key | Rationale |
|---------------|-------|--------|-----|-----------|
| **Webhooks** | 1000 req | 15 min | IP | High volume from Meta/payment gateways |
| **Public API** (unauthenticated) | 100 req | 15 min | IP | Prevent scraping and abuse |
| **Auth endpoints** (`POST /login`) | 5 req | 15 min | IP | Prevent brute force |
| **Authenticated API** (general) | 1000 req | 15 min | User ID | Fair usage per doctor |
| **Write operations** (`POST`, `PUT`, `DELETE`) | 100 req | 15 min | User ID | Prevent spam; lower than reads |
| **Read operations** (`GET`) | 5000 req | 15 min | User ID | Higher limit for reads |
| **AI endpoints** (OpenAI calls) | 50 req | 1 hour | User ID | Cost control; prevent runaway AI costs |

### Global Rate Limit

- **Limit:** 10,000 req per 15 min (total across all endpoints)
- **Purpose:** Protect server from total overload
- **Implementation:** Global rate limiter applied to all routes (express-rate-limit)

---

## 🛠️ Implementation

### Creating a Rate Limiter

**Pattern:**

```typescript
import rateLimit from 'express-rate-limit';
import { TooManyRequestsError } from '../utils/errors';
import { errorResponse } from '../utils/response';
import { logSecurityEvent } from '../utils/audit-logger';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Max requests per window
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown', // User ID or IP
  handler: async (req: Request, res: Response) => {
    // Log rate limit violation
    await logSecurityEvent(
      req.correlationId || 'unknown',
      req.user?.id,
      'rate_limit_exceeded',
      'medium',
      req.ip
    );
    const error = new TooManyRequestsError('Too many requests, please try again later.');
    return res.status(429).json(errorResponse({
      code: 'TooManyRequestsError',
      message: error.message,
      statusCode: 429,
    }, req));
  },
  standardHeaders: true, // Return rate limit info in headers (RateLimit-*)
  legacyHeaders: false, // Disable X-RateLimit-* headers
});
```

### Applying Rate Limiter

```typescript
// Global limiter (all routes)
app.use(globalLimiter);

// Specific limiter (webhook routes)
router.post('/webhooks/instagram', webhookLimiter, handleInstagramWebhook);

// Per-route limiter
router.post('/api/v1/appointments', authenticateJWT, apiLimiter, createAppointmentHandler);
```

---

## 📊 Rate Limit Headers

**Standard headers** (returned with every request):

```
RateLimit-Limit: 1000           # Max requests per window
RateLimit-Remaining: 995        # Requests remaining in current window
RateLimit-Reset: 1643723400     # Unix timestamp when limit resets
Retry-After: 900                # Seconds to wait (when limit exceeded)
```

**Example response (429):**
```json
{
  "success": false,
  "error": {
    "code": "TooManyRequestsError",
    "message": "Too many requests, please try again later.",
    "statusCode": 429
  },
  "meta": {
    "timestamp": "2026-01-30T12:00:00.000Z",
    "requestId": "corr-123"
  }
}
```

---

## 🧪 Testing Rate Limits

### Test Cases

- [ ] **Under limit:** Requests under limit → 200 OK
- [ ] **At limit:** Request at exact limit → 200 OK
- [ ] **Over limit:** Request over limit → 429 Too Many Requests
- [ ] **Headers present:** `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` in response
- [ ] **Retry-After:** 429 response includes `Retry-After` header
- [ ] **After window:** Requests after window resets → 200 OK

### Example Test

```typescript
it('returns 429 when rate limit exceeded', async () => {
  // Make max requests
  for (let i = 0; i < 1000; i++) {
    await request(app).post('/webhooks/instagram').send({});
  }

  // Next request should fail
  const response = await request(app)
    .post('/webhooks/instagram')
    .send({})
    .expect(429);

  expect(response.body.error.code).toBe('TooManyRequestsError');
  expect(response.headers['retry-after']).toBeDefined();
});
```

---

## ⚙️ Advanced Configuration

### Dynamic Limits (per user tier)

**Future:** Different limits based on subscription tier

```typescript
export function createUserTierLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: async (req: Request) => {
      const userTier = req.user?.tier || 'free';
      if (userTier === 'enterprise') return 10000;
      if (userTier === 'pro') return 5000;
      return 1000; // Free tier
    },
    keyGenerator: (req: Request) => req.user?.id || req.ip,
    // ... handler
  });
}
```

### Whitelist / Blacklist

**Whitelist trusted IPs:**

```typescript
export const apiLimiter = rateLimit({
  skip: (req: Request) => {
    const trustedIPs = ['1.2.3.4', '5.6.7.8']; // Meta webhook IPs, monitoring tools
    return trustedIPs.includes(req.ip || '');
  },
  // ... rest of config
});
```

**Blacklist abusive IPs:**

```typescript
const blacklist = new Set(['9.9.9.9']); // IPs to block

app.use((req, res, next) => {
  if (blacklist.has(req.ip || '')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});
```

---

## 🔗 Related Documentation

- [SECURITY.md](./SECURITY.md) — Security rules and OWASP checklist
- [RECIPES.md](./RECIPES.md) — R-RATE-LIMIT-001 pattern
- [OBSERVABILITY.md](./OBSERVABILITY.md) — Security event logging

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
