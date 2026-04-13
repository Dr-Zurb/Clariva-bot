# Initiative — Bot philosophy elite audit (2026)

**Status:** Reading & planning complete — **execution tasks** drafted ([13-04-2026/execution](../Development/Daily-plans/April%202026/13-04-2026/execution/README.md))  
**North star:** [AI_BOT_BUILDING_PHILOSOPHY.md](../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) — LLM-first, context before keywords, deterministic facts, minimal regex sprawl.

**Why:** Align the entire receptionist codebase with a **human-like** experience: understand **what we last asked** and **what the thread already contains**, then act — not keyword roulette or ever-growing `if` chains.

---

## Workbench (Daily plan folder)

| Resource | Path |
|----------|------|
| Index | [13-04-2026/README.md](../Development/Daily-plans/April%202026/13-04-2026/README.md) |
| Reading tasks (agent) | [13-04-2026/reading tasks/](../Development/Daily-plans/April%202026/13-04-2026/reading%20tasks/) |
| Master plan | [plan-philosophy-alignment-audit-2026.md](../Development/Daily-plans/April%202026/13-04-2026/planning/plan-philosophy-alignment-audit-2026.md) |
| Findings | [findings-log.md](../Development/Daily-plans/April%202026/13-04-2026/planning/findings-log.md) |
| Execution phases | [13-04-2026/execution/README.md](../Development/Daily-plans/April%202026/13-04-2026/execution/README.md) (`e-task-phil-01` … `10`) |

---

## Task files (this folder)

| ID | File | Purpose |
|----|------|---------|
| — | [tasks/tm-bot-audit-00-reading-complete.md](./tasks/tm-bot-audit-00-reading-complete.md) | Gate: all RT-* done, findings logged |
| — | [tasks/tm-bot-audit-01-routing-context.md](./tasks/tm-bot-audit-01-routing-context.md) | Epic: routing + `lastPromptKind` + reduce duplicate classifiers |
| — | [tasks/tm-bot-audit-02-extraction-thread.md](./tasks/tm-bot-audit-02-extraction-thread.md) | Epic: extraction + thread-aware reason |
| — | [tasks/tm-bot-audit-03-consent-confirm-corpus.md](./tasks/tm-bot-audit-03-consent-confirm-corpus.md) | Epic: consent/confirm + test corpus |
| — | [tasks/tm-bot-audit-04-triage-fees.md](./tasks/tm-bot-audit-04-triage-fees.md) | Epic: reason-first + fee flow alignment |
| — | [tasks/tm-bot-audit-05-docs-sync.md](./tasks/tm-bot-audit-05-docs-sync.md) | Epic: RECEPTIONIST_BOT + branch inventory sync |

**Daily execution (13-04-2026):** [execution/README.md](../Development/Daily-plans/April%202026/13-04-2026/execution/README.md) — granular `e-task-phil-01` … `e-task-phil-10` mapped to each epic above.

---

## Rules of engagement

- Follow [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) for any code change.
- Prefer **one PR per epic** with tests; no drive-by regex unless explicitly scoped.
- **Product owner** decides if philosophy becomes mandatory for every bot PR (currently philosophy doc says optional — may revise after audit).

---

## Related initiatives

- [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](./AI_RECEPTIONIST_MATCHING_INITIATIVE.md)
- [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](./STAFF_FEEDBACK_LEARNING_INITIATIVE.md)
