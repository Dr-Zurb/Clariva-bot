# Codex model selection — Clariva Bot

**Purpose:** choose the lowest-cost Codex model and effort that can safely complete the next bounded task. This file owns Codex routing; `CURSOR_MODEL_SELECTION.md` remains valid only for work executed in Cursor.

## Default routing

| Work | Model | Effort |
|---|---|---|
| Clear implementation task, focused bug fix, routine test, bounded UI polish | Terra | Medium |
| Ambiguous product analysis, unknown-cause debugging, task planning | Astra | High |
| Cross-layer design or difficult planning across several systems | Astra | XHigh |
| RLS, auth boundaries, PHI fields, audit logging, payments, migrations, external-AI consent, close-gate review | Astra | Max |

Use task blast radius and ambiguity to choose effort. Feature importance alone does not justify a stronger model.

## Routing rules

1. Begin with a bounded task and explicit acceptance criteria.
2. Use Terra Medium when implementation follows an existing pattern and focused tests can catch mistakes.
3. Use Astra High when the root cause or product behavior is unclear.
4. Use Astra XHigh for a design decision spanning frontend, API, services, and data behavior.
5. Use Astra Max for the hard-rule list above, even when the diff looks small.
6. Return to Terra Medium after the design or safety decision is locked.
7. Do not interrupt a safe running task solely to change models. Switch at a clean checkpoint.

## Conversation boundaries

- One product area per task.
- Start a new task when the product area changes or a clean model checkpoint is needed.
- Carry forward the decision, acceptance gate, relevant file links, checks run, and residuals. Do not carry an entire unrelated transcript.
- Never claim that a model changed unless the destination task visibly confirms the selected model and effort.

## Hard-rule references

Before work involving patient data or system boundaries, read:

- `AI_AGENT_RULES.md`
- `../compliance/COMPLIANCE.md`
- `STANDARDS.md` or `FRONTEND_STANDARDS.md`
- `../architecture/CONTRACTS.md`

**Created:** 2026-09-10
