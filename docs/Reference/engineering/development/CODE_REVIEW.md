# Code Review Guide

**Purpose:** What to verify before marking a task complete (AI self-review) or merging. Focuses on the **Clariva-specific gates** — compliance, contracts, tests — not generic review etiquette.

**Related:** [CODE_QUALITY.md](./CODE_QUALITY.md) | [STANDARDS.md](./STANDARDS.md) | [SECURITY.md](../compliance/SECURITY.md) | [COMPLIANCE.md](../compliance/COMPLIANCE.md) | [TESTING.md](./TESTING.md)

---

## Review checklist

**Standards & architecture**
- [ ] Follows [STANDARDS.md](./STANDARDS.md) (Zod validation, `asyncHandler`, typed errors, `successResponse`/canonical contract)
- [ ] Correct layer: controller orchestrates, service holds business logic, no DB access from controllers ([ARCHITECTURE.md](../architecture/ARCHITECTURE.md))
- [ ] Reuses existing [RECIPES.md](./RECIPES.md)/codebase patterns; no needless new patterns

**Security & compliance (hard gate)**
- [ ] No secrets in code (all via `config/env.ts`)
- [ ] **No PHI in logs** (names, phones, DOBs); raw request objects never logged
- [ ] All external input validated with Zod; user-provided text sanitized (DOMPurify)
- [ ] Auth/RLS enforced on protected endpoints (JWT; RLS or explicit ownership checks)
- [ ] Webhook signatures verified; rate limiting on public endpoints
- [ ] See [SECURITY.md](../compliance/SECURITY.md) + [COMPLIANCE.md](../compliance/COMPLIANCE.md)

**Tests**
- [ ] Unit tests for services/utils; integration tests for endpoints; error/edge cases covered
- [ ] **Fake placeholders only** — `PATIENT_TEST`, `+10000000000`; never real PHI ([TESTING.md](./TESTING.md))
- [ ] `npm test` and `npm run type-check` pass

**Observability & docs**
- [ ] Logs carry correlation ID + useful metadata (no PHI); audit events logged for sensitive ops
- [ ] Doc drift handled in the same change-set: new patterns → RECIPES, schema → DB_SCHEMA, contracts → CONTRACTS, new env vars → `.env.example` (see [AI_AGENT_RULES.md](./AI_AGENT_RULES.md))

**Deployment**
- [ ] Migrations backward-compatible (or downtime/rollback plan); breaking API changes get a MAJOR bump; partial features behind a flag

---

## AI self-review loop

Before marking a task complete: re-read the task file → confirm acceptance criteria → run the checklist above → fix issues → update the task file (check items, note anything notable).

---

**Last updated:** 2026-05-31
