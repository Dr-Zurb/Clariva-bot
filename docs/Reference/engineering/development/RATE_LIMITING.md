# Rate Limiting Guide

**Purpose:** Our rate-limit **numbers and behavior** — what's configured and the limits to use. General "what is rate limiting" theory is assumed.

**Related:** [SECURITY.md](../compliance/SECURITY.md) | [RECIPES.md](./RECIPES.md) (`R-RATE-LIMIT-001`) | [OBSERVABILITY.md](../operations/OBSERVABILITY.md)

---

## What's configured

- Limiters live in `backend/src/middleware/rate-limiters.ts` (built on `express-rate-limit`).
- **Webhook limiter** (`POST /webhooks/*` — Instagram, Razorpay, PayPal): **1000 req / 15 min per IP** (gateways send high volume).
- **Global limiter:** **10,000 req / 15 min** across all routes.

## Limits to use by endpoint type

| Endpoint | Limit | Window | Key |
|---|---|---|---|
| Webhooks | 1000 | 15 min | IP |
| Public/unauthenticated API | 100 | 15 min | IP |
| Auth (`POST /login`) | 5 | 15 min | IP (brute-force) |
| Authenticated API (general) | 1000 | 15 min | User ID |
| Writes (POST/PUT/DELETE) | 100 | 15 min | User ID |
| Reads (GET) | 5000 | 15 min | User ID |
| AI endpoints (OpenAI) | 50 | 1 hour | User ID (cost control) |

Key strategy: `req.user?.id || req.ip`.

## On limit exceeded (MUST)

- Return **`429`** with the canonical error body (`code: TooManyRequestsError`) and a `Retry-After` header.
- Emit standard `RateLimit-*` headers (`standardHeaders: true`, `legacyHeaders: false`).
- Log the violation as a **security event** (see [OBSERVABILITY.md](../operations/OBSERVABILITY.md) / [SECURITY.md](../compliance/SECURITY.md)).

---

**Last updated:** 2026-05-31
