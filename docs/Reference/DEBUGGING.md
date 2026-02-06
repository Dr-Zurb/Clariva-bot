# Debugging Guide

**Purpose:** Troubleshooting checklist and debugging strategies for the Clariva bot. Use this when things break or behave unexpectedly.

**Audience:** AI agents and developers.

**Related:** [OBSERVABILITY.md](./OBSERVABILITY.md) | [ONBOARDING.md](./ONBOARDING.md) | [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md)

---

## 🔍 General Debugging Strategy

### 1. Read the Error Message

- **What:** Full error message, stack trace, error code
- **Where:** Logs, console, error response
- **Correlation ID:** Use to trace request through logs

### 2. Reproduce the Issue

- **Local:** Can you reproduce locally with same input?
- **Consistent:** Does it happen every time or intermittently?
- **Scope:** Specific endpoint, all endpoints, specific user, all users?

### 3. Isolate the Component

- **Trace the flow:** Webhook → queue → worker → service → DB → external API
- **Find the failure point:** Where does the request fail? (controller, service, database, external API)
- **Use logs:** Correlation ID in logs to trace the request

### 4. Check the Basics

- [ ] **Env vars:** Are all required vars set? (`.env` matches `.env.example`)
- [ ] **Services running:** Backend server, Redis (queues), database, ngrok (webhooks)
- [ ] **External APIs:** Are API keys valid? Are services up?
- [ ] **Network:** Can local server reach external APIs? (firewall, proxy)

---

## 🐛 Common Issues & Solutions

### Issue: "Webhook not received"

**Symptoms:** Instagram/Razorpay/PayPal webhook not triggering

**Check:**
1. [ ] **ngrok running?** `ngrok http 3000` (get new URL if restarted)
2. [ ] **Webhook URL correct?** Dashboard has current ngrok URL (e.g., `https://abc123.ngrok-free.app/webhooks/instagram`)
3. [ ] **Server running?** `npm run dev` in backend
4. [ ] **Endpoint exists?** `POST /webhooks/instagram`, `/webhooks/razorpay`, `/webhooks/paypal` in routes
5. [ ] **Signature verification?** Check logs for "Invalid webhook signature" (401)
6. [ ] **Test locally:** Use `curl` or Postman to POST to webhook endpoint with sample payload

**Logs to check:**
- Request received log (correlation ID, provider, event_id)
- Signature verification log (valid/invalid)
- Queue add log (job added to queue)

---

### Issue: "Database query fails"

**Symptoms:** `Supabase error: ...`, `Failed to fetch appointment`, etc.

**Check:**
1. [ ] **Supabase URL/keys correct?** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
2. [ ] **RLS policies?** If using anon client, does RLS policy allow this operation?
3. [ ] **Table exists?** Run migration if table is missing
4. [ ] **Column names match?** DB uses `snake_case`; code uses `snake_case` for DB queries
5. [ ] **Test connection:** Run `testConnection()` from `config/database.ts` or check `/health` endpoint

**Debug:**
```typescript
// Add temp logging
const { data, error } = await supabase.from('appointments').select('*').eq('id', appointmentId);
console.log('DB query result:', { data, error, appointmentId });
```

---

### Issue: "External API fails" (OpenAI, Instagram, Razorpay, PayPal)

**Symptoms:** `Timeout`, `401 Unauthorized`, `429 Too Many Requests`, `500 Internal Server Error`

**Check:**
1. [ ] **API key valid?** Check env (`OPENAI_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, etc.)
2. [ ] **API key permissions?** Some keys have limited scopes (e.g., Instagram token needs `pages_messaging`)
3. [ ] **Rate limit?** 429 error → wait or increase limit
4. [ ] **Timeout?** Network slow or API slow → increase timeout or retry
5. [ ] **API status:** Check external service status page (e.g., `status.openai.com`)
6. [ ] **Request format?** Check API docs for correct payload structure

**Debug:**
```typescript
// Log request/response (redact secrets!)
logger.info({ url, method, statusCode, correlationId }, 'External API call');
```

---

### Issue: "Queue job not processing"

**Symptoms:** Webhook queued but job not running; jobs stuck in `waiting` or `active`

**Check:**
1. [ ] **Redis running?** Worker needs Redis for BullMQ
2. [ ] **Worker running?** Check worker logs (should see "Webhook worker started")
3. [ ] **Job in queue?** Check Redis or BullMQ dashboard for job status
4. [ ] **Worker concurrency?** Default is 5; might be maxed out
5. [ ] **Job errors?** Check dead letter queue or failed jobs

**Debug:**
```bash
# Check Redis connection
redis-cli ping
# Check BullMQ queue
# (Future: Add BullMQ dashboard for visual monitoring)
```

---

### Issue: "Payment link creation fails"

**Symptoms:** `Failed to create payment link`, `Razorpay error`, `PayPal error`

**Check:**
1. [ ] **Gateway configured?** Razorpay keys for India; PayPal keys for international
2. [ ] **Correct gateway?** `selectGatewayByCountry(doctorCountry)` returns expected gateway
3. [ ] **Amount/currency valid?** Amount in smallest unit (paise/cents); currency matches gateway
4. [ ] **Test mode?** Razorpay test keys (`rzp_test_*`); PayPal sandbox mode
5. [ ] **API response?** Log error from gateway API (redact secrets)

**Debug:**
```typescript
// Add logging in payment-service
logger.info({ gateway, amountMinor, currency, correlationId }, 'Creating payment link');
```

---

### Issue: "Auth fails" (JWT, RLS, ownership)

**Symptoms:** `401 Unauthorized`, `404 Not Found` (when resource exists)

**Check:**
1. [ ] **JWT present?** `Authorization: Bearer <token>` header in request
2. [ ] **JWT valid?** Not expired; correct secret used to sign
3. [ ] **RLS policy?** Does policy allow this user to access this resource?
4. [ ] **Ownership check?** Manual check (e.g., `appointment.doctor_id === userId`)
5. [ ] **Service role vs anon?** Worker/webhook uses service role; API uses anon + JWT

**Debug:**
```typescript
// Log auth context
logger.info({ userId: req.user?.id, appointmentId, correlationId }, 'Auth check');
```

---

## 📋 Debugging Checklist

Use this checklist when debugging any issue:

### Environment
- [ ] `.env` file exists and has all required vars (compare with `.env.example`)
- [ ] Secrets are correct (not placeholders like `YOUR_KEY_HERE`)
- [ ] `NODE_ENV` is set correctly (`development`, `test`, `production`)

### Services
- [ ] Backend server running (`npm run dev`)
- [ ] Redis running (for queues)
- [ ] Supabase reachable (check `/health` endpoint)
- [ ] ngrok running (for webhook testing)

### Logs
- [ ] Check logs for correlation ID (trace request flow)
- [ ] Check for error logs (error level, stack trace)
- [ ] Check for warning logs (signature verification, idempotency)

### External APIs
- [ ] API keys valid and not expired
- [ ] API rate limits not exceeded
- [ ] API service status (check status pages)

### Database
- [ ] Migrations run (all `*.sql` files applied)
- [ ] RLS policies enabled (if using anon client)
- [ ] Test connection works (`/health` endpoint)

### Code
- [ ] Type-check passes (`npm run type-check`)
- [ ] Lint passes (`npm run lint`)
- [ ] Tests pass (`npm test`)

---

## 🔬 Advanced Debugging Techniques

### Trace Request with Correlation ID

**Every request has a correlation ID** (UUID). Use it to trace the request:

```bash
# Search logs for correlation ID
grep "corr-abc-123" logs/*.log
```

**Typical flow:**
1. Request arrives → correlation ID generated (middleware)
2. Controller → service → database (all log with same correlation ID)
3. Webhook queued → worker processes (job has correlation ID)
4. Error or success logged with correlation ID

### Use Debugger

**For complex logic:**

```typescript
// Add breakpoint in VSCode or use debugger statement
debugger; // Pauses execution when dev tools open
```

**Run with debugger:**
```bash
# VSCode: F5 or "Run and Debug"
# OR use Node inspector
node --inspect-brk dist/index.js
```

### Test in Isolation

**Isolate the failing component:**

- **Service:** Write a unit test that calls the service with same input
- **Controller:** Use Supertest to test the endpoint directly
- **Worker:** Manually add a job to queue and watch worker process it

---

## 🚨 When to Ask for Help

**Ask when:**
- Issue persists after trying checklist
- Root cause is unclear
- External service issue (not in your control)
- Security or compliance concern

**How to ask:**
- Provide correlation ID
- Include error message and stack trace
- Describe what you tried
- Share relevant logs (redact secrets/PHI)

---

## 🔗 Related Documentation

- [OBSERVABILITY.md](./OBSERVABILITY.md) — Logging and correlation IDs
- [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) — External API troubleshooting
- [ONBOARDING.md](./ONBOARDING.md) — Dev setup and common questions
- [ERROR_CATALOG.md](./ERROR_CATALOG.md) — Error classes and when to use them

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
