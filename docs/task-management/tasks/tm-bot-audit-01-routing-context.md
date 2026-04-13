# tm-bot-audit-01 — Routing & dialog context epic

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Philosophy:** §4.2, §4.5, §4.8, P-F (state drives routing)

---

## Objective

Reduce **substring / keyword** routing in favor of **`lastPromptKind` + structured LLM** where the user’s reply depends on **what we just asked**.

---

## Preconditions

- [x] [tm-bot-audit-00-reading-complete.md](./tm-bot-audit-00-reading-complete.md) gate satisfied
- [ ] Findings identify concrete duplicate branches

---

## Scope (to refine from findings)

- `instagram-dm-webhook-handler.ts` — consolidate `effectiveAskedFor*` with state
- `conversation` metadata — ensure prompt kind set on every template send
- Remove or isolate **debug-only** regex shortcuts

---

## Out of scope

- Changing Instagram API integration
- Full file split (unless planned as separate epic)

**Execution (13-04-2026):** [e-task-phil-01](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-01-ai-service-guardrails-intent-fee.md), [e-task-phil-02](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-02-booking-relation-terms-module.md), [e-task-phil-03](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-03-webhook-lastpromptkind-audit.md), [e-task-phil-05](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-05-conversation-promptkind-extensions.md) — [index README](../../../Development/Daily-plans/April%202026/13-04-2026/execution/README.md)

**Status:** ⏳ Ready for implementation (reading gate done)
