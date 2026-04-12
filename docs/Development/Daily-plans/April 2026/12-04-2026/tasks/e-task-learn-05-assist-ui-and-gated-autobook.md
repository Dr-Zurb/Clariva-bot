# Task learn-05: Assist UI and gated autobook (production)

**Date:** 2026-04-12  
**Plan:** [plan-staff-feedback-learning-system.md](../plan-staff-feedback-learning-system.md)

---

## Task overview

**Assist mode:** In the staff review inbox, show **non-blocking** hints (“similar cases were resolved as X, N times”) when data exists. **Autobook / auto-finalize:** Only when an **enabled policy** from learn-04 matches the current case **and** global feature flags allow; otherwise unchanged v1 behavior. Full **audit** on every auto decision; **one-click disable** for policy.

**Architecture:** “Match” for policy application uses the **same structured feature contract** as learn-03 (deterministic). The **existing** patient-facing matcher may still use **LLM** upstream; this task does **not** add a second LLM for learning — it applies **saved staff-derived policies** when structured equality/thresholds say so.

**Estimated time:** 5–10 days  
**Status:** Pending  
**Change type:** Update existing matcher + inbox + conversation transitions — follow [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

**Depends on:** e-task-learn-04

---

## Current state

- [ServiceReviewsInbox.tsx](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — confirm / reassign / cancel.
- Matcher + DM webhook gate staff review per ARM-05/06.

---

## Task breakdown

### 1. Assist UI

- [ ] 1.1 Fetch hint payload from API (structured counts + labels from catalog).
- [ ] 1.2 Display below proposal — **does not** replace staff decision.

### 2. Autobook path (narrow)

- [ ] 2.1 In matcher or pre-review gate: if `policy.enabled` and features match, **skip creating staff review** OR **auto-apply final selection** per product decision — **document chosen behavior** in plan (prefer: **high-confidence auto-finalize** only when match is exact per policy scope).
- [ ] 2.2 Write **audit** row: policy id, correlation id, feature snapshot hash.
- [ ] 2.3 **Fallback:** if any invariant fails → staff review as today.
- [ ] 2.4 **Idempotency:** same conversation / same pattern must not double-apply autobook or leave duplicate terminal states (align with plan §8 operational notes).

### 3. Safety

- [ ] 3.1 Kill switch env: `LEARNING_AUTOBOOK_ENABLED=false`.
- [ ] 3.2 Metrics: count autobook vs staff override (reuse learn-03 pipelines).

### 4. Tests

- [ ] 4.1 Integration: policy on → case matches → no pending review / state finalized per spec.
- [ ] 4.2 Integration: policy on → case fuzzy → staff review still created.

### 5. Docs

- [ ] 5.1 Update [RECIPES.md](../../../../../Reference/RECIPES.md) booking gate section.
- [ ] 5.2 Doctor-facing help: what assist + autobook mean.

---

## Design constraints

- **Platform executes** — autobook must set state via same code paths as staff confirm ([AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md)).
- **No duplicate classification** — single helper for “should autobook.”

---

## Global safety gate

- [ ] **PHI in logs?** No  
- [ ] **RLS** unchanged for patient data  
- [ ] **Rollback:** disabling policy immediately stops autobook

---

## Acceptance criteria

- [ ] Assist visible when examples exist; autobook only with opt-in policy + flag.
- [ ] QA checklist: wrong-service regression **blocked** by tests or flag.

---

## Related tasks

- Prev: [e-task-learn-04](./e-task-learn-04-opt-in-notification-autobook-policy.md)

---

**Last updated:** 2026-03-31
