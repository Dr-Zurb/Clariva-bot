# Coding Workflow

**Purpose:** The Clariva-specific structural facts for backend work — file order, middleware order, where things live. The careful-engineering process (understand the task, find similar code, plan, validate, test) is assumed; this file only captures what's specific to this repo.

**Canonical patterns live in [RECIPES.md](./RECIPES.md); rules in [STANDARDS.md](./STANDARDS.md); structure in [ARCHITECTURE.md](../architecture/ARCHITECTURE.md). When docs conflict, follow [DECISION_RULES.md](./DECISION_RULES.md).**

---

## ⚠️ Response contract

Use `successResponse(data, req)` and throw typed errors — never hand-roll `{ data }`/`{ error }`, always include `meta`. Canonical shape: [STANDARDS.md](./STANDARDS.md) → "Canonical Contracts".

---

## Scope

- **Default change-set limit: ≤ 5 files.** If a task needs more, surface it before proceeding.
- Stay within the requested scope; don't refactor adjacent code "for completeness."

---

## File creation order

```
1. types/        (new types)
2. config/env.ts (new env vars → add to Zod schema; never read process.env elsewhere)
3. utils/        (new helpers)
4. services/     (business logic — framework-agnostic, no Express imports)
5. controllers/  (HTTP handlers — validate → call service → respond)
6. routes/       (mount controllers; versioned under /api/v1)
7. routes/index.ts (mount the new route)
8. tests
```

Layer boundaries: routes → controllers → services → utils → types (see [ARCHITECTURE.md](../architecture/ARCHITECTURE.md)). Controllers never touch the DB; services never import Express.

**Zod schema location:** keep in the controller file unless used by 2+ controllers → then `validation/`.

---

## Middleware order

**Canonical, non-negotiable order lives in [STANDARDS.md](./STANDARDS.md) → "Non-Negotiable Middleware Order"** (and matches `backend/src/index.ts` — the source of truth). Don't duplicate the full list here. Key rules: **`correlationId` comes first — before body parsers** (so a correlation ID exists even if body parsing fails), `requestTiming` right after it, and `errorMiddleware` **last**. `trust proxy` only when behind a reverse proxy (Render/NGINX/Cloudflare) so `req.ip` is correct.

---

## Before marking a task done

- `npm run type-check`, `npm run lint`, `npm run build`, `npm test` all pass; `npm run format` applied.
- Run the [CODE_REVIEW.md](./CODE_REVIEW.md) checklist (compliance/PHI, contracts, tests).
- Update docs in the same change-set if behavior/schema/contracts changed (see [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) → Doc drift guard).
- Full ship criteria: [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md).

---

**Last updated:** 2026-05-31
