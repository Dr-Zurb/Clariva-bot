# Performance Guide

**Purpose:** Performance optimization rules and patterns for the Clariva bot. Follow these guidelines to ensure the system scales and responds quickly.

**Audience:** AI agents and developers implementing features.

**Related:** [STANDARDS.md](./STANDARDS.md) | [ARCHITECTURE.md](./ARCHITECTURE.md) | [DB_SCHEMA.md](./DB_SCHEMA.md)

---

## ⚡ Core Performance Principles

### 1. No Premature Optimization

- **MUST:** Write clear, correct code first; optimize only when needed
- **Optimize when:** Performance issue is measured/observed (slow API, high DB load)
- **Do not:** Optimize "just in case" without evidence of a problem

### 2. Measure Before Optimizing

- **MUST:** Measure current performance (response time, DB query time, memory)
- **Use:** Request timing middleware (already in place: `request-timing.ts`)
- **Set baseline:** Know what "slow" means (e.g., API goal: <200ms p95; webhook: <1s p95)

### 3. Optimize the Bottleneck

- Focus on the slowest part first (database queries, external API calls, N+1 queries)
- Use correlation IDs and logs to trace slow requests

---

## 🗄️ Database Performance

### Query Optimization

**1. Select only needed fields**

```typescript
// ✅ GOOD - Select only what you need
const { data } = await supabase
  .from('appointments')
  .select('id, patient_name, appointment_date, status')
  .eq('doctor_id', userId);

// ❌ BAD - Select all columns when you only need a few
const { data } = await supabase
  .from('appointments')
  .select('*')
  .eq('doctor_id', userId);
```

**2. Use indexes for common queries**

- **MUST:** Add indexes for columns used in `WHERE`, `JOIN`, `ORDER BY`
- **Example:** `appointments(doctor_id, appointment_date)` index for "get my upcoming appointments" query
- **See:** Migration files for index creation

**3. Avoid N+1 queries**

```typescript
// ❌ BAD - N+1 query (one query per appointment to get patient details)
const appointments = await getAppointments(doctorId);
for (const apt of appointments) {
  const patient = await getPatient(apt.patient_id); // Separate query per appointment
}

// ✅ GOOD - Single query with JOIN or select
const { data } = await supabase
  .from('appointments')
  .select('*, patients(*)')
  .eq('doctor_id', doctorId);
```

**4. Pagination for large result sets**

- **MUST:** Use pagination for endpoints that return lists
- **Default limit:** 20–50 items per page
- **See:** [PAGINATION.md](./PAGINATION.md) for cursor vs offset patterns (when implemented)

### Database Connection Pooling

- **Supabase:** Connection pooling is handled by Supabase (no action needed)
- **For self-hosted:** Use connection pooler (e.g., PgBouncer)

---

## 🚀 Async Patterns

### Parallel vs Sequential

**Rule:** When operations are independent, run them in parallel

```typescript
// ✅ GOOD - Parallel (independent operations)
const [appointments, availability] = await Promise.all([
  getAppointments(doctorId),
  getAvailability(doctorId, date),
]);

// ❌ BAD - Sequential (when operations are independent)
const appointments = await getAppointments(doctorId);
const availability = await getAvailability(doctorId, date);
```

**Rule:** When operations depend on each other, run them sequentially

```typescript
// ✅ GOOD - Sequential (dependent operations)
const appointment = await bookAppointment(data);
const payment = await createPaymentLink({ appointmentId: appointment.id });
```

### Batching

**When to batch:**
- Multiple similar operations (e.g., send 10 DMs, insert 10 records)
- External API supports batch endpoints

```typescript
// ✅ GOOD - Batch insert
const { error } = await supabase.from('availability_slots').insert(slots); // Array of slots

// ❌ BAD - Loop with individual inserts
for (const slot of slots) {
  await supabase.from('availability_slots').insert(slot);
}
```

---

## 🔄 Caching Strategies

### When to Cache

- **Cache when:** Data is read frequently and changes infrequently
- **Examples:** Doctor availability (changes daily), payment gateway config (changes rarely)
- **Do not cache:** PHI unless encrypted and scoped to user; real-time data (current appointment status)

### Caching Layers

**1. In-memory cache (for config/static data)**

```typescript
// ✅ GOOD - Cache payment gateway config in memory
let cachedPayPalToken: { token: string; expiresAt: number } | null = null;

async function getPayPalAccessToken(): Promise<string> {
  if (cachedPayPalToken && Date.now() < cachedPayPalToken.expiresAt) {
    return cachedPayPalToken.token;
  }
  // Fetch new token, cache it
  const token = await fetchNewToken();
  cachedPayPalToken = { token, expiresAt: Date.now() + 3600 * 1000 };
  return token;
}
```

**2. Redis cache (for user data, session data)**

- **When to use:** Multi-instance deployments; shared cache across servers
- **Example:** Cache doctor availability slots (key: `availability:${doctorId}:${date}`, TTL: 1 hour)
- **See:** Redis already configured for BullMQ queues; can reuse for caching

**3. HTTP cache headers (for API responses)**

- **When:** Public or semi-public data (e.g., doctor's public availability)
- **Use:** `Cache-Control`, `ETag` headers
- **Example:** `Cache-Control: private, max-age=300` for doctor's availability API

### Cache Invalidation

**Rule:** Invalidate cache when data changes

```typescript
// When doctor updates availability
await updateAvailability(doctorId, slots);
await redis.del(`availability:${doctorId}:${date}`); // Invalidate cache
```

---

## ⏱️ Timeout & Retry

### Timeouts

**MUST:** Set timeouts for all external API calls

```typescript
// ✅ GOOD - Timeout for external API
const response = await axios.post(url, data, { timeout: 10000 }); // 10s timeout

// ❌ BAD - No timeout (could hang indefinitely)
const response = await axios.post(url, data);
```

**Recommended timeouts:**
- Payment gateways: 10s
- OpenAI: 30s
- Instagram Graph API: 10s
- Database queries: 5s (Supabase default)

### Retry Logic

**MUST:** Retry transient failures for external APIs

- **Retry:** Network errors, 5xx errors, timeouts
- **Do not retry:** 4xx errors (client errors, bad input)
- **Exponential backoff:** 1s, 2s, 4s, 8s... (max 3–5 retries)

**See:** [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) for retry patterns

---

## 📊 Performance Monitoring

### Request Timing

- **Enabled:** Request timing middleware logs response time for all requests
- **Use:** Correlation ID to trace slow requests in logs
- **Alert on:** p95 > 1s for API endpoints; p95 > 5s for webhooks

### Database Query Monitoring

- **Monitor:** Slow queries (>100ms), query count per request
- **Use:** Supabase dashboard (or self-hosted: `pg_stat_statements`)
- **Optimize:** Add indexes, reduce N+1, select only needed fields

### External API Monitoring

- **Track:** Response time, error rate, retry count for each external service
- **Alert on:** Error rate >1%, response time >10s, repeated retries

---

## 🎯 Performance Goals

**Target performance (production):**

| Metric | Goal (p95) | Critical (p99) |
|--------|------------|----------------|
| API response time | <200ms | <500ms |
| Webhook processing | <1s | <5s |
| Database queries | <100ms | <200ms |
| External API calls | <2s | <10s |
| Queue job processing | <30s | <2min |

**When to optimize:**
- p95 or p99 exceeds goal consistently
- User-facing impact (slow booking, delayed confirmations)
- Cost impact (excessive DB queries, API calls)

---

## 🔗 Related Documentation

- [STANDARDS.md](./STANDARDS.md) — Coding rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Project structure
- [DB_SCHEMA.md](./DB_SCHEMA.md) — Database schema and indexes
- [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) — Retry, timeout patterns
- [OBSERVABILITY.md](./OBSERVABILITY.md) — Logging and monitoring

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
