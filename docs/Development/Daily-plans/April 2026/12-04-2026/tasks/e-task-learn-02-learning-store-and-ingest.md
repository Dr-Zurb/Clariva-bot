# Task learn-02: Learning store schema and ingest pipeline

**Date:** 2026-04-12  
**Plan:** [plan-staff-feedback-learning-system.md](../plan-staff-feedback-learning-system.md)

---

## Task overview

Add **durable storage** for learning examples (labels from staff actions) and an **ingest path** triggered when a staff review is **confirmed** or **reassigned** (and optionally other resolutions per policy). Store **only** fields allowed by **[STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md)** — implement against [DC-ALLOW](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-allow) and [DC-DENY](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-deny).

**Architecture:** Ingest is **deterministic** (copy structured fields from review + state). **No** LLM call is required to write learning rows. Labels come from **staff**, not from a model inferring “what they meant.”

**Estimated time:** 3–5 days  
**Status:** Complete (optional backfill 3.1 not implemented)  
**Change type:** New feature (migration + service layer + hooks)

**Depends on:** e-task-learn-01  
**Unlocks:** e-task-learn-03

---

## Current state

- ✅ `service-staff-review-service.ts` resolves reviews, writes audit events, and calls **`ingestServiceMatchLearningExample`** after confirm/reassign.
- ✅ `service_match_learning_examples` + `043_service_match_learning_examples.sql`.
- ✅ `review_request_id` unique per learning row.

---

## Task breakdown

### 1. Schema

- [x] 1.1 Migration `043` — `service_match_learning_examples` with `doctor_id`, `review_request_id` (unique FK), `action`, keys, `feature_snapshot`, `correlation_id`, `created_at`.
- [x] 1.2 RLS: doctor reads own rows; `service_role` insert + read.
- [x] 1.3 Index `(doctor_id, created_at DESC)`.

### 2. Ingest

- [x] 2.1 After successful confirm/reassign + state persist; idempotent on `review_request_id` (23505 ignored).
- [x] 2.2 `feature_snapshot`: `review_row_at_resolution` + `conversation_state_after_resolution` — see `service-match-learning-ingest.ts` header.
- [x] 2.3 No patient free text (allowlisted `ConversationState` keys only).

### 3. Backfill (optional)

- [ ] 3.1 Script or one-off job: historical resolved reviews → examples (behind flag).

### 4. Tests

- [x] 4.1 `service-match-learning-ingest.test.ts`.
- [ ] 4.2 RLS smoke test (deferred; mirrors ARM-06 audit pattern).

### 5. Docs

- [x] 5.1 [RECIPES.md](../../../../../Reference/RECIPES.md) §19; DC-RET in data contract.

---

## Design constraints

- **No PHI** in logs; correlation IDs only.
- Migration: follow [MIGRATIONS_AND_CHANGE.md](../../../../../Reference/MIGRATIONS_AND_CHANGE.md).

---

## Global safety gate

- [x] **Data touched?** Y → **RLS** per migration
- [x] **PHI in logs?** No (ingest logs use correlation + ids only)
- [x] **Retention** documented (DC-RET + migration CASCADE)

---

## Acceptance criteria

- [x] Resolved reviews produce learning rows matching learn-01 contract.
- [x] `feature_snapshot` provenance in `service-match-learning-ingest.ts`.
- [x] Tests green; **apply migration** `043` in dev / staging.

---

## Related tasks

- Prev: [e-task-learn-01](./e-task-learn-01-privacy-and-data-contract.md)  
- Next: [e-task-learn-03](./e-task-learn-03-shadow-evaluation-and-metrics.md)

---

**Last updated:** 2026-03-31 (implementation landed)
