# Safe Defaults

**Purpose:** When a choice is genuinely ambiguous and no explicit rule/pattern/user instruction applies, fall back to these Clariva defaults (they bias toward security and consistency). Explicit rules in [STANDARDS.md](./STANDARDS.md), [CONTRACTS.md](../architecture/CONTRACTS.md), [COMPLIANCE.md](../compliance/COMPLIANCE.md), and [RECIPES.md](./RECIPES.md) always override these.

---

## Defaults

| When unsure about… | Default |
|---|---|
| **Data sensitivity** | **Assume it's PHI** — encrypt at rest, never log, never put in error messages/responses, redact before external AI calls. |
| **Auth** | **Required.** Mount `authenticateToken`; only leave public if explicitly documented (e.g. `/health`). |
| **Logging** | Minimal + IDs only: `correlationId` (required), `resourceId`, `userId`, `action`, `status`. Never `req.body`, names, phones, DOBs. |
| **Validation** | Strict Zod — `.strict()` (reject unknown fields), enforce types/formats (email, `^\+?[1-9]\d{1,14}$` phone). |
| **Error type** | Throw a typed `AppError` (e.g. `NotFoundError`), never return `null`. If the specific type is unclear, use `InternalError` (500) and refine later. |
| **Response shape** | Canonical `successResponse(data, req)` — never override (CONTRACTS.md). |
| **Slow work** | Queue it (BullMQ); keep the request fast. Only do it synchronously if it's <100ms and required for the response. |
| **Multi-table writes** | Treat as a transaction. Supabase has **no multi-statement transactions** → use compensating logic (undo the first write if the second fails) or an idempotency key. Single-table/read-only need none. |
| **Tests** | Unit (service/util) + integration (endpoint, Supertest); cover success, error, and edge cases. E2E only for critical workflows. |

## Pointers (don't duplicate)

- **Timeouts & retry policy:** [PERFORMANCE.md](./PERFORMANCE.md) and [EXTERNAL_SERVICES.md](../operations/EXTERNAL_SERVICES.md). Summary: retry only transient failures/idempotent ops, max 3–5, exponential backoff; never retry writes without an idempotency key.
- **Middleware order:** [STANDARDS.md](./STANDARDS.md) → "Non-Negotiable Middleware Order".
- **Conflict resolution:** [DECISION_RULES.md](./DECISION_RULES.md).

---

**Last updated:** 2026-05-31
