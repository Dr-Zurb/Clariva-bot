# 2026-04-12 — Staff feedback learning (smart receptionist v2)

**Date:** 2026-04-12  
**Theme:** Turn **staff confirm / reassign / optional notes** into **durable learning signals** so similar ambiguous cases route better over time — without hand-maintaining every edge case. Includes **explicit doctor consent** before any **auto-book / auto-finalize** behavior, and a **strict PHI / compliance** posture for a global product.

**Status:** Planning — implementation not started

---

## Documents

| Doc | Purpose |
|-----|---------|
| [plan-staff-feedback-learning-system.md](./plan-staff-feedback-learning-system.md) | Master plan: phases, risks, consent-before-autobook, PHI principles, success metrics |
| [tasks/](./tasks/) | Executable breakdown: `e-task-learn-01` … `e-task-learn-05` |

---

## Why this plan exists

- Static catalog fields and one-off rules do not scale when patient language and visit-type signals are **open-ended** (see [AI_BOT_BUILDING_PHILOSOPHY.md](../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md)).
- We already persist **staff resolutions** (`service_staff_review_requests`, audit events) — the next step is a **structured learning layer** with **governance**, not silent ML on raw chat.
- Product requirement: **notify the doctor** when the system has observed **enough consistent reassignment (or confirmation) patterns** and request **permission** before changing behavior to **auto-finalize** similar cases — with **explainable reasoning**.

---

## Initiative hub

- [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../../../../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md)

---

## Locked principles (summary)

1. **Enough examples** — No autobook until thresholds met; cold-start uses existing matcher + staff review only.
2. **Generalization, not exact phrase** — Features favor structured matcher outputs, buckets, candidate sets; any use of message-derived signals requires explicit privacy review.
3. **Consent before autobook** — Doctor receives a **proposed policy** (pattern summary + counts + example reason codes) and must **opt in** before automation applies.
4. **PHI creep** — Default learning store **no free-text patient content**; align with [PRIVACY_BY_DESIGN.md](../../../Reference/PRIVACY_BY_DESIGN.md) and [COMPLIANCE.md](../../../Reference/COMPLIANCE.md); regional retention and deletion.

### Architecture note (learning vs NLU)

- **Learning loop (this plan):** v1 = **human labels** + **structured features** + **deterministic** aggregation, shadow, and policy match — **no** required learning-specific LLM. Optional later: **semantic** similarity (embeddings / LLM) only after privacy sign-off.
- **Patient NLU** (existing stack): Open-ended language still uses **LLM + structured output** where appropriate for *interpretation*; that is **orthogonal** to how we reuse staff decisions. See [plan §1a](./plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope).

---

**Last updated:** 2026-03-31
