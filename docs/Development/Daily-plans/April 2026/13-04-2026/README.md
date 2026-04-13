# 13 Apr 2026 — Bot philosophy alignment audit (agent workbench)

**Purpose:** Systematic **read-through** of Clariva receptionist code against [AI_BOT_BUILDING_PHILOSOPHY.md](../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md). This folder is for **review and planning**, not patient-facing copy.

**Owner:** Engineering / AI agent sessions doing deep audit.

**Folders:**

| Folder | Contents |
|--------|----------|
| [reading tasks](./reading%20tasks/) | **Read order** + checklists per subsystem (what to open, what to verify vs philosophy) |
| [planning](./planning/) | Consolidated gap analysis and **proposed change themes** (after reads complete) |
| [execution](./execution/README.md) | **`e-task-phil-01` … `e-task-phil-10`** — executable tasks; maps to `tm-bot-audit-*` |

**Philosophy in one line:** LLM-first understanding, context before keywords, deterministic execution + DB facts, minimal regex sprawl, no duplicate classifiers in three places.

**Do not treat reading tasks as user action items** — they are **agent instructions** for thorough review.
