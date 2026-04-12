# Task learn-03: Shadow evaluation and internal metrics

**Date:** 2026-04-12  
**Plan:** [plan-staff-feedback-learning-system.md](../plan-staff-feedback-learning-system.md)

---

## Task overview

Implement **shadow mode**: at matcher / staff-review creation time, compute a **hypothetical** suggestion from historical learning examples (per learn-02 aggregation rules) and **log** `would_suggest_service_key`, `similarity_score`, `source_example_ids` — **without** changing patient-facing behavior or skipping staff review.

**Architecture — v1 vs optional AI:** **v1** retrieval should use **structured** match only (same pattern key / feature vector from allowed fields, or simple k-NN in **structured** space). That is sufficient to validate “would we have agreed with staff?” **Optional later:** embedding-based or LLM-assisted similarity for **messier** paraphrases — **only** if learn-01 approves and feature-flagged; default **off**.

**Estimated time:** 3–5 days  
**Status:** Complete (semantic / embedding spike 1.3 still deferred)  
**Change type:** New feature (read path + logging + optional admin query)

**Depends on:** e-task-learn-02  
**Unlocks:** e-task-learn-04

---

## Current state

- Matcher produces proposal + confidence; staff review created for low/medium paths.
- **`service_match_shadow_evaluations`** + view **`service_match_shadow_resolution_metrics`** (migration `044`); hook in **`upsertPendingStaffServiceReviewRequest`** after new insert only.

---

## Task breakdown

### 1. Similarity / retrieval (v1)

- [x] 1.1 Pattern key: [SERVICE_MATCH_PATTERN_KEY.md](../../../../../Reference/SERVICE_MATCH_PATTERN_KEY.md); `pattern_key` column on **`service_match_learning_examples`** (ingest). Linked from [plan §2](../plan-staff-feedback-learning-system.md#2-learning-loop-conceptual) via docs.
- [x] 1.2 Same `doctor_id` + `pattern_key`, up to 50 examples, majority vote on `final_catalog_service_key` — `service-match-learning-shadow.ts`. No LLM.
- [ ] 1.3 (Optional / later) Semantic similarity — **deferred**; see [plan §1a](../plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope).

### 2. Shadow logging

- [x] 2.1 Table **`service_match_shadow_evaluations`** (`044_service_match_shadow_learning.sql`).
- [x] 2.2 Log when **new** pending review row is created (not when idempotent pending exists).

### 3. Metrics

- [x] 3.1 View **`service_match_shadow_resolution_metrics`** + [SERVICE_MATCH_SHADOW_METRICS.md](../../../../../Reference/SERVICE_MATCH_SHADOW_METRICS.md).
- [x] 3.2 Metabase: query view with service role; definitions in metrics doc.

### 4. Feature flags

- [x] 4.1 **`SHADOW_LEARNING_ENABLED`** in `env.ts` (default on; `false` / `0` disables).

### 5. Tests

- [x] 5.1 `service-match-learning-pattern.test.ts`, `service-match-learning-shadow.test.ts`.

---

## Design constraints

- Shadow must **never** alter `ConversationState` or skip review without learn-04/05 policy.
- No PHI in shadow log rows.

---

## Global safety gate

- [x] **Data touched?** Y  
- [x] **External AI?** No — structured vote only (v1)

---

## Acceptance criteria

- [x] With flag on, shadow rows written for new pending reviews; resolvable vs staff via view.
- [x] Agreement / abstain definitions in [SERVICE_MATCH_SHADOW_METRICS.md](../../../../../Reference/SERVICE_MATCH_SHADOW_METRICS.md).

---

## Related tasks

- Prev: [e-task-learn-02](./e-task-learn-02-learning-store-and-ingest.md)  
- Next: [e-task-learn-04](./e-task-learn-04-opt-in-notification-autobook-policy.md)

---

**Last updated:** 2026-03-31 (implementation landed)
