# Staff feedback learning — smart receptionist (v2)

**Purpose:** Use **staff confirm / reassign / optional resolution notes** as **supervised signals** to improve routing for **similar** ambiguous cases over time, with **shadow evaluation**, **doctor notification**, **explicit opt-in before auto-finalize**, and **privacy-first** data handling suitable for a **global** product.

**Architecture stance:** v1 is **structured-first** (human labels + deterministic aggregation + policy on structured features). **Optional** semantic similarity (embeddings / LLM) is a **later, gated** add-on — see [plan §1a](../Development/Daily-plans/April%202026/12-04-2026/plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope). **Patient NLU** in the existing matcher remains **orthogonal** (LLM where appropriate for open-ended text per [AI_BOT_BUILDING_PHILOSOPHY.md](../Reference/AI_BOT_BUILDING_PHILOSOPHY.md)).

**Status:** Planning  
**Created:** 2026-04-12  
**Plan:** [plan-staff-feedback-learning-system.md](../Development/Daily-plans/April%202026/12-04-2026/plan-staff-feedback-learning-system.md)  
**Philosophy:** [AI_BOT_BUILDING_PHILOSOPHY.md](../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) §9  
**Data contract (v1):** [STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md](../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md) — gates learn-02+

---

## Prerequisites

- **ARM-06** staff review persistence and resolution flows (`service_staff_review_requests`, `service_staff_review_audit_events`) — see [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](./AI_RECEPTIONIST_MATCHING_INITIATIVE.md).
- Matcher + conversation state produce **structured** reason codes and candidates (no reliance on raw phrase matching as primary strategy).

---

## Task list (execution order)

| Order | Task |
|-------|------|
| 1 | [e-task-learn-01](../Development/Daily-plans/April%202026/12-04-2026/tasks/e-task-learn-01-privacy-and-data-contract.md) — Privacy charter + data contract (gates all implementation) |
| 2 | [e-task-learn-02](../Development/Daily-plans/April%202026/12-04-2026/tasks/e-task-learn-02-learning-store-and-ingest.md) — Learning store schema + ingest on staff resolution |
| 3 | [e-task-learn-03](../Development/Daily-plans/April%202026/12-04-2026/tasks/e-task-learn-03-shadow-evaluation-and-metrics.md) — Shadow mode + internal metrics (no behavior change) |
| 4 | [e-task-learn-04](../Development/Daily-plans/April%202026/12-04-2026/tasks/e-task-learn-04-opt-in-notification-autobook-policy.md) — Doctor notification + opt-in records before autobook |
| 5 | [e-task-learn-05](../Development/Daily-plans/April%202026/12-04-2026/tasks/e-task-learn-05-assist-ui-and-gated-autobook.md) — Assist UI + gated production autobook + audit |

---

## Locked product decisions

1. **No auto-finalize** until **enough examples** (thresholds TBD per environment) **and** doctor **opt-in** for that pattern/policy.  
2. **Generalize** via **structured features** — not “same exact phrase.” Raw patient text in learning tables is **out of scope for v1** unless privacy review approves.  
3. **Notify** doctor before enabling autobook; show **reasoning** (counts, pattern summary, structured signals).  
4. **PHI minimization** — align [PRIVACY_BY_DESIGN.md](../Reference/PRIVACY_BY_DESIGN.md), [COMPLIANCE.md](../Reference/COMPLIANCE.md); no PHI in logs; retention/deletion paths documented.  
5. **No mandatory learning-only LLM** for v1 — pattern detection and policy match are **deterministic** on structured fields; NL / embeddings are **optional** later.

---

## Related

- [AI_RECEPTIONIST_MATCHING_INITIATIVE.md](./AI_RECEPTIONIST_MATCHING_INITIATIVE.md) — v1 matching + inbox (orthogonal **layer** on top).  
- [TASK_TEMPLATE.md](./TASK_TEMPLATE.md), [CODE_CHANGE_RULES.md](./CODE_CHANGE_RULES.md) — when implementing.

---

**Last updated:** 2026-03-31
