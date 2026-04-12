# Task learn-04: Opt-in notification and autobook policy records

**Date:** 2026-04-12  
**Plan:** [plan-staff-feedback-learning-system.md](../plan-staff-feedback-learning-system.md)

---

## Task overview

When **shadow metrics** (learn-03) show a **stable pattern** (e.g. repeated reassignment from A→B with similar features), **notify** the doctor and persist an **opt-in policy** record: doctor must **explicitly approve** before any automation applies. **No auto-finalize** in this task — only **notification + policy storage + API**.

**Architecture:** Stability detection uses **structured** counts / pattern keys from learn-02–03 — **not** an LLM “summarizing” the practice. Optional **LLM** only for **doctor-facing copy** polish (e.g. friendlier explanation) is **out of scope** unless product asks; counts and keys must come from **DB aggregates**.

**Estimated time:** 4–6 days  
**Status:** Pending  
**Change type:** New feature (DB + APIs + notification channel)

**Depends on:** e-task-learn-03  
**Unlocks:** e-task-learn-05

---

## Current state

- No `learning_autobook_policies` (or equivalent) table.
- Doctor notification patterns exist elsewhere (email, in-app) — reuse patterns from [RECIPES.md](../../../../../Reference/RECIPES.md).

---

## Task breakdown

### 1. Stability detection (job or synchronous)

- [ ] 1.1 Define thresholds: min N resolutions, min window W, same pattern key (tunable via config).
- [ ] 1.2 Emit **internal event** or row: `pending_policy_suggestion` when thresholds met and **no** active policy exists.

### 2. Policy schema

- [ ] 2.1 Migration: store **pattern key**, `doctor_id`, `enabled` boolean, `enabled_at`, `enabled_by_user_id`, `scope` JSON (which signals), `disabled_at` optional.
- [ ] 2.2 RLS: doctor owns policies.

### 3. Notification

- [ ] 3.1 In-app notification: title + body summarizing **counts**, **proposed→final** pair, **structured signal summary** (no raw patient text).
- [ ] 3.2 Optional email — behind flag.

### 4. APIs

- [ ] 4.1 `GET` pending suggestions + `POST` accept / decline / snooze.
- [ ] 4.2 Audit log entry on accept/decline.

### 5. Tests

- [ ] 5.1 Unit: threshold logic; policy lifecycle.

---

## Design constraints

- Copy must be **explainable** (align [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) — facts from DB, not LLM-invented counts).
- Notification content: **aggregates only** unless learn-01 allows more.

---

## Global safety gate

- [ ] **PHI in notification body?** No patient narrative
- [ ] **RLS** on policy table

---

## Acceptance criteria

- [ ] Doctor can **approve** or **decline** a suggested policy; record is immutable except `disabled_at`.
- [ ] **No** change to matcher behavior until learn-05 consumes `enabled` policies.

---

## Related tasks

- Prev: [e-task-learn-03](./e-task-learn-03-shadow-evaluation-and-metrics.md)  
- Next: [e-task-learn-05](./e-task-learn-05-assist-ui-and-gated-autobook.md)

---

**Last updated:** 2026-03-31
