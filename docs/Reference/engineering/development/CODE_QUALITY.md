# Code Quality & Style Guide

**Purpose:** The Clariva-specific naming/style **choices** — the conventions a model can't guess. General clean-code practice (DRY, small functions, meaningful names, no dead code) is assumed.

**Related:** [STANDARDS.md](./STANDARDS.md) | [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) | [CODE_REVIEW.md](./CODE_REVIEW.md)

---

## Naming conventions (our choices)

| Thing | Convention | Example |
|---|---|---|
| Files / directories | `kebab-case.ts` | `appointment-service.ts` |
| Functions / variables | `camelCase` | `createPaymentLink`, `appointmentId` |
| Types / interfaces / classes | `PascalCase` | `CreatePaymentLinkInput`, `RazorpayAdapter` |
| True constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES`, `WEBHOOK_JOB_NAME` |
| Config objects | `camelCase` | `razorpayConfig` |
| DB tables / columns | `snake_case` | `patient_name`, `appointment_date` |

---

## TypeScript rules (our deltas)

- **No `any`** without `eslint-disable-next-line` + a comment explaining why. Prefer `unknown` for external/untyped data and narrow with a type guard.
- Prefer `?.` and `??` over `||` for null/undefined handling (`patient?.phone ?? 'N/A'`).
- Use generics for genuinely reusable helpers (e.g. `successResponse<T>`).
- **Import order:** Node built-ins → external packages → internal (`config`/`utils`/`services`) → `import type`.

---

## Comments

- Comment the **why**, not the what. No narration comments (`i++; // increment`).
- **JSDoc on all exported functions** (services, utils, controllers): 1–2 line description, `@param`, `@returns`, `@throws` if it throws specific errors.

---

## File size

- Target ~200–300 lines; complex services may exceed.
- When a file passes ~500 lines, split: extract helpers to `utils/`, split a service into domain-specific services, move types to `types/`.

---

## Self-checklist (before marking a task done)

- [ ] Naming matches the table above (files kebab, fns camel, types Pascal, DB snake)
- [ ] No `any` without an `eslint-disable` + reason; external data typed as `unknown`
- [ ] Imports ordered; no unused imports/vars (prefix intentionally-unused with `_`)
- [ ] JSDoc on exported functions; non-obvious logic explained
- [ ] No dead/commented-out code or unreachable branches
- [ ] File under ~500 lines (or split)
- [ ] Follows existing patterns in the codebase

---

**Last updated:** 2026-05-31
