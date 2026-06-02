# Performance Guide

**Purpose:** Our performance **targets and defaults** (timeouts, retry, caching) for this system. General optimization practice (measure first, select only needed columns, avoid N+1, parallelize independent work with `Promise.all`, batch inserts) is assumed.

**Related:** [STANDARDS.md](./STANDARDS.md) | [DB_SCHEMA.md](../architecture/DB_SCHEMA.md) | [EXTERNAL_SERVICES.md](../operations/EXTERNAL_SERVICES.md) | [OBSERVABILITY.md](../operations/OBSERVABILITY.md)

---

## Targets (production)

| Metric | Goal (p95) | Critical (p99) |
|---|---|---|
| API response time | <200ms | <500ms |
| Webhook processing | <1s | <5s |
| DB queries | <100ms | <200ms |
| External API calls | <2s | <10s |
| Queue job processing | <30s | <2min |

Optimize when p95/p99 consistently exceeds goal, there's user-facing impact (slow booking/confirmations), or cost impact. `request-timing.ts` already logs response time — trace slow requests by correlation ID. Alert on p95 >1s (API) / >5s (webhooks), DB queries >100ms, external error rate >1%.

## Timeouts (MUST set on all external calls)

- Payment gateways: **10s** · OpenAI: **30s** · Instagram Graph API: **10s** · DB queries: **5s** (Supabase default).

## Retry

- Retry only transient failures (network, 5xx, timeout) with exponential backoff (1s, 2s, 4s…, **max 3–5**). **Never retry 4xx.** Patterns: [EXTERNAL_SERVICES.md](../operations/EXTERNAL_SERVICES.md).

## Caching

- Cache read-heavy, slow-changing data; **never cache PHI** unless encrypted and user-scoped, and don't cache real-time state (live appointment status).
- In-memory for static/config (e.g. PayPal access token until expiry). Redis (already present for BullMQ) for shared/multi-instance caches, e.g. `availability:${doctorId}:${date}` TTL ~1h — **invalidate on write**.
- HTTP cache headers (`Cache-Control: private, max-age=…`, `ETag`) for public-ish data like a doctor's availability.

---

**Last updated:** 2026-05-31
