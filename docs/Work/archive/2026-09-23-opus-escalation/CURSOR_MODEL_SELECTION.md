# Cursor model selection — cost-efficient workflow (Clariva-bot)

A **practical policy** for picking a Cursor chat model on this repo. It describes **capability tiers**, not specific model names, so it doesn't go stale — for current names/rates see [Cursor — Models & Pricing](https://cursor.com/docs/models). The detailed cost playbook + execution workflow lives in [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md); this is the short version.

---

## The core pattern: think on the frontier, type on the cheap tier

Match the model to **how much judgment the turn needs**, not how "important" the feature feels. The spec you produce while planning is what makes cheap execution safe later.

- **Frontier / thinking tier (manually picked)** — the *thinking*: planning, writing task files, ambiguous debugging, and anything touching PHI / consent / payments / RLS / migrations.
- **Auto (cheap pool) — default for execution** — the *typing*: implementing a task that already has a clear spec / "Steps" list.
- **Cheapest tier (Composer-class)** — trivial mechanical edits: docs, status sync, comments, one-line fixes.

> Earlier versions of this doc told you to *reserve* the top model for ~0–5% of work. That's obsolete — but the answer isn't "frontier for everything" either. It's **frontier to plan, Auto to implement**: spend the reasoning budget up front on the spec, then hand well-scoped tasks to the cheap pool.

---

## Use the frontier / thinking tier for

- **Planning sessions and task-file authoring** — the spec quality here is what lets execution run cheaply.
- **Anything touching PHI, consent, payments, RLS, or a new migration** (see [COMPLIANCE.md](../compliance/COMPLIANCE.md)).
- **"Why did the bot do this?" debugging** that spans state + prompts + routing (e.g. `instagram-dm-webhook-handler.ts` + `ai-service` + consent/fees).
- **Cross-cutting refactors** (5+ files / a service surface) and **close-gate review** of a finished batch.

## Use Auto (or cheaper) for

- Implementing a task that already has a numbered "Steps" + "Done when" spec.
- Frontend/component work, new endpoints where the controller→service→route pattern exists, tests for code the frontier already designed.
- Concrete single-file fixes from a clear error.

---

## Escalation rules

- **Stay on Auto** while executing a spec'd task and doing many small commits.
- **Escalate one message to the frontier tier** the moment the problem turns ambiguous, spans multiple subsystems, or touches the compliance list above — Auto will **not** escalate itself.
- **Don't fight a hard problem on a weak model to save tokens** — a wrong change to booking/consent/PHI costs far more than the model.

---

## Related

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — full cost playbook, Auto vs Premium, per-batch model budget
- [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) — agent behavior in-repo
- [AI_BOT_BUILDING_PHILOSOPHY.md](../../product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md) — bot product rules

**Last updated:** 2026-05-31
