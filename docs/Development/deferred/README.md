# Deferred Items

This folder tracks work that is **intentionally deferred** (postponed) to a later phase—e.g. until prerequisites exist, or until production/launch—rather than forgotten or blocked without a plan.

---

## Deferred vs other statuses

| Term | Meaning |
|------|--------|
| **Deferred** | Deliberately postponed; trigger (date, milestone, or condition) is documented. |
| **Pending** | Waiting on something (dependency, decision); often unclear when it will run. |
| **Blocked** | Cannot proceed until an external dependency is unblocked. |

Here we use **deferred** so each item has a clear **reason** and **when to do it** (e.g. “when frontend exists”, “when we start selling”).

---

## Current deferred items

| Item | Original task / ref | Defer until | Doc |
|------|--------------------|-------------|-----|
| RLS policies testing (authenticated user, service role, cross-user) | [e-task-2-rls-policies](../../Daily-plans/2026-01-20/e-task-2-rls-policies.md) | Frontend + user creation available | [deferred-rls-testing-2026-01-20.md](./deferred-rls-testing-2026-01-20.md) |
| Error tracking (Sentry) for backend and frontend | [e-task-8](../../Daily-plans/2026-02-07/e-task-8-deployment-and-launch-prep.md) §2.1 | Production / when you start selling | [deferred-sentry-e-task-8.md](./deferred-sentry-e-task-8.md) |

---

## Workflow

1. **When to add something here**
   - You decide to do it later (e.g. “Sentry when we go live”).
   - Prerequisites are missing and you document the trigger (e.g. “when frontend auth exists”).

2. **What to add**
   - A short doc (or row in this README) with: **what**, **original task**, **defer until**, and **steps or link** for when you pick it up.

3. **When to remove or update**
   - When you start the work: move steps back into the main task or a Daily plan and update links.
   - When the trigger changes: update “Defer until” and the doc.

4. **File naming**
   - `deferred-{short-name}-{date-or-ref}.md` (e.g. `deferred-sentry-e-task-8.md`, `deferred-rls-testing-2026-01-20.md`).

---

**Last updated:** 2026-02-07
