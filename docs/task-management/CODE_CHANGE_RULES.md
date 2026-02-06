# Code Change Rules

**Purpose:** Standard rules for any task that **changes** existing code (updates, refactors, or removes behavior). Use this document whenever a task modifies already-implemented features—not only for new feature addition.

**Location:** `docs/task-management/` — Reference this file during planning and execution of **change** tasks.

**Related:** [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md) | [TASK_TEMPLATE.md](./TASK_TEMPLATE.md)

---

## When These Rules Apply

- **Task type:** The task **updates** existing behavior, services, config, or data flow (e.g. "switch fee from env to doctor settings," "add region-specific currency," "replace PayPal with Stripe").
- **Not for:** Greenfield "add new feature" tasks where you only add new code and do not modify existing logic.

**Rule:** When creating or executing a task that changes existing code, follow this document in addition to the [TASK_MANAGEMENT_GUIDE](./TASK_MANAGEMENT_GUIDE.md).

---

## Before Changing Code (MANDATORY)

### 1. Audit Current Implementation

**MUST:** Before writing or changing anything, establish what exists:

- **Which files** implement the current behavior? (config, env, services, controllers, workers, routes, types)
- **Which functions** are involved? (create/read/update flows, callers, entry points)
- **Where is it used?** (routes, workers, other services, tests)
- **What config/env** does it depend on? (env vars, defaults, schema)

**How:** Search codebase for related names, read the relevant files, trace callers. Document findings in the task file "Current State" and "Files to Create/Update" sections.

### 2. Clarify Desired Change

**MUST:** Be explicit about:

- **What stays** (unchanged behavior, same contracts)
- **What is replaced** (e.g. "fee from env" → "fee from doctor settings")
- **What is removed** (e.g. global `APPOINTMENT_FEE_*` usage, dead branches)

Avoid vague "update the service" — specify the before/after behavior and data source.

### 3. Map Impact

**MUST:** List every place that must change:

- **Config / env:** New or removed vars, schema changes, defaults
- **Services:** Which services change; new parameters, return shapes, or data sources
- **Workers / controllers:** Call sites that pass or use the changed data
- **Types:** Updated types or interfaces
- **Tests:** Tests that assert old behavior; tests to add for new behavior
- **Docs:** STANDARDS, RECIPES, COMPLIANCE, README, .env.example — only if contracts or patterns change

**Output:** A short "impact list" in the task (or in Notes) so nothing is missed during implementation.

### 4. When the Change Involves Database Migrations

**MUST:** Before creating any new migration file:

- **Read all previous migrations** (in the migrations folder, in numeric order) to understand:
  - Existing schema (tables, columns, indexes, constraints)
  - Naming and patterns (e.g. snake_case, RLS policies, triggers)
  - How the project connects to the database (Supabase, auth, service role)
- Follow [MIGRATIONS_AND_CHANGE.md](../Reference/MIGRATIONS_AND_CHANGE.md): reuse existing triggers/functions where applicable; keep RLS and naming consistent.
- **Rationale:** Migrations build on each other; reading prior migrations prevents duplicate objects, conflicting names, and inconsistent patterns.

---

## While Updating Code

### 1. Change in the Right Layer

- Follow [ARCHITECTURE.md](../Reference/ARCHITECTURE.md): config → service → controller/worker.
- Do not put business logic in controllers; do not skip the service layer for behavior that belongs there.

### 2. Remove Obsolete Code

**MUST:**

- **Delete** env vars, config keys, or defaults that are no longer used (or document why they are kept for a transition period).
- **Remove** dead branches, commented-out blocks, and unused parameters or return values.
- **Do not** leave "for later" or "legacy" code without a task reference or comment explaining why it remains.

### 3. Avoid Leaving Dead Code

- Prefer **delete** over "comment out" when removing behavior.
- If something is intentionally kept for migration or rollout, add a short comment and (if applicable) a task/issue reference.

### 4. Keep Naming and Docs Consistent

- If the **concept** changes (e.g. "appointment fee" → "doctor's appointment fee"), update names, JSDoc, and any referenced docs so the codebase stays consistent.

---

## After Changing Code

### 1. Tests

- **Update or add** tests for the new behavior.
- **Remove or adjust** tests that asserted the old behavior.
- Ensure type-check and lint still pass (see [TESTING.md](../Reference/TESTING.md)).

### 2. References and Docs

- Update [STANDARDS.md](../Reference/STANDARDS.md), [RECIPES.md](../Reference/RECIPES.md), [COMPLIANCE.md](../Reference/COMPLIANCE.md), or README **only if** patterns, contracts, or security/compliance rules changed (see "Doc Drift Guard" in [AI_AGENT_RULES.md](../Reference/AI_AGENT_RULES.md)).

### 3. Env and Config

- **Update** `.env.example` and any config documentation when env or config shape changes.
- **Remove** or mark deprecated any env vars that are no longer used.

---

## Checklist for Change Tasks

Use this during **task execution** when the task changes existing code:

- [ ] **Audit** — Listed current files, functions, callers, and config/env for the area being changed
- [ ] **Clarify** — Desired change is explicit (what stays, what is replaced, what is removed)
- [ ] **Map impact** — Listed all places to change (config, services, workers, types, tests, docs)
- [ ] **Implement** — Changes made in the correct layers; naming and comments consistent
- [ ] **Remove obsolete** — Deleted or deprecated unused env/config, dead code, and obsolete branches
- [ ] **Tests** — Updated or added tests; removed/adjusted tests for old behavior; type-check and lint pass
- [ ] **Docs/env** — Updated .env.example and reference docs only where contracts or patterns changed

---

## Summary

| Phase        | Rule |
|-------------|------|
| **Before**  | Audit current implementation; clarify desired change; map impact to files and callers. |
| **During**  | Change in the right layer; remove obsolete code; no dead code; consistent naming. |
| **After**   | Update tests; update docs/env only when contracts or patterns change. |

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](./TASK_MANAGEMENT_GUIDE.md)
