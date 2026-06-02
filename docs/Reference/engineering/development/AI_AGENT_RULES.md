# AI Agent Rules (Agent Contract)

**Governs how AI agents work in this repo — not how the code behaves.** This is the short list of Clariva-specific rules a model can't infer from the code. General engineering discipline (don't refactor unasked, keep diffs small, prefer explicit over implicit, stop when genuinely stuck) is assumed and not re-spelled here.

---

## Hard rules (project-specific)

**Code structure & contracts:**
- **Never** access `process.env` directly — use validated `config/env.ts`.
- Use `asyncHandler` for all async controllers — **no `try-catch` in controllers**. Let `asyncHandler` forward to the global error middleware.
- `ZodError → ValidationError` mapping happens **only** in the global error middleware. Don't wrap `.parse()` in try-catch in controllers/services.
- Validate **all** external input (`req.body/query/params`, webhook payloads) with Zod, in the controller, before calling services.
- Throw typed `AppError` subclasses — never raw `Error`.
- Use the response helpers and canonical contract — see [STANDARDS.md](./STANDARDS.md) → "Canonical Contracts" (single source of truth).
- Controllers orchestrate only (validate → call service → respond). Business rules, permissions, and invariants live in **services**. Controllers must not touch the DB directly.

**Compliance & safety (highest priority):**
- If a change touches **PHI / patient data, logging/observability, external AI, or external APIs/webhooks**: check [COMPLIANCE.md](../compliance/COMPLIANCE.md) **first**, default to the strictest interpretation (HIPAA/GDPR/DPDP baseline), and **STOP and ask** if anything is unclear.
- **Never log PII/PHI** (names, phones, DOBs) or raw request objects.

**Patterns & scope:**
- Prefer existing patterns in [RECIPES.md](./RECIPES.md) and the codebase over improvising. If no pattern fits, confirm before introducing a new one.
- Operate within the requested scope. If a request forces you to expand across layers (API + DB + service) or touch unrelated files, surface it before proceeding.

**Frontend:** When editing frontend (Next.js/React, `app/`, `components/`, frontend `lib/`), read [FRONTEND_ARCHITECTURE.md](../architecture/FRONTEND_ARCHITECTURE.md) + [FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md), use [FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md), and consume the API per [CONTRACTS.md](../architecture/CONTRACTS.md).

---

## Conflict resolution

When docs disagree, follow the order in **[DECISION_RULES.md](./DECISION_RULES.md)** (canonical). Summary: **COMPLIANCE → STANDARDS → CONTRACTS → ARCHITECTURE → RECIPES.** A lower-priority doc that contradicts a higher one is stale — follow the higher doc and flag the drift.

---

## Doc drift guard

If you change behavior, schema, or contracts, update the matching doc in the **same change-set**:
- New/changed pattern → [RECIPES.md](./RECIPES.md)
- Rule change → [STANDARDS.md](./STANDARDS.md)
- Schema change → [DB_SCHEMA.md](../architecture/DB_SCHEMA.md)
- Contract change → [CONTRACTS.md](../architecture/CONTRACTS.md) (requires explicit approval)

---

## See also

- **Tier 0:** [COMPLIANCE.md](../compliance/COMPLIANCE.md) (overrides everything when PHI/logging/external AI is involved)
- **Tier 1:** [STANDARDS.md](./STANDARDS.md), [CONTRACTS.md](../architecture/CONTRACTS.md), [ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
- **Tier 2:** [CODING_WORKFLOW.md](./CODING_WORKFLOW.md), [RECIPES.md](./RECIPES.md), [TESTING.md](./TESTING.md)
- **Data/security:** [DB_SCHEMA.md](../architecture/DB_SCHEMA.md), [RLS_POLICIES.md](../compliance/RLS_POLICIES.md), [EXTERNAL_SERVICES.md](../operations/EXTERNAL_SERVICES.md)
- **Bot/DM work:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md)
- Full doc map: [Reference README](../../README.md)

**Last updated:** 2026-05-31
