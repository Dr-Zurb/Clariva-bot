# e-task-phil-07 — Catalog matcher & learning: documentation clarity

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T1b  
**Planning source:** [rt-06-catalog-matcher-learning-findings-and-planned-changes.md](../planning/rt-06-catalog-matcher-learning-findings-and-planned-changes.md) §4, §6  
**Maps to:** [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../../../../../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md): learning tasks; philosophy §9

---

## Objective

Eliminate **“intent-routing-policy.ts service”** confusion; link **matcher stages** to data contract; keep **Stage A / B** boundary documented.

---

## Tasks

- [x] Add **`backend/src/services/README-matcher.md`** (or section in existing `docs/Reference`) stating: **policy** lives in **`ai-service`**; tests named **`intent-routing-policy.test.ts`**; no `intent-routing-policy.ts` module.
- [x] Optional link from `STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md` to **`service-catalog-matcher.ts`** header (ARM-04).
- [x] **No code change** unless naming refactor approved — doc-only task preferred.

---

## Acceptance criteria

- New engineer can find **one** paragraph explaining deterministic vs LLM Stage B and where post-classification policies live.

---

## Out of scope

- Changing matcher algorithm — separate feature work.
