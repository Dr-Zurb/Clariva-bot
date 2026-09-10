# Task lang-20: Cancel / reschedule / status copy

> **Links:** batch [`../plan-p5-copy-coverage-batch.md`](../plan-p5-copy-coverage-batch.md) · exec [`./EXECUTION-ORDER-p5-copy-coverage.md`](./EXECUTION-ORDER-p5-copy-coverage.md)

---

## 📋 Task Overview

Migrate the ~20 hardcoded strings in the cancel / reschedule / status flow into `dm-copy.ts` builders.

This cluster has a wrinkle the others do not: the **same message is emitted from two places**. `cancel-reschedule-status.ts` renders it deterministically, and `action-executor-service.ts` renders it again as the result of an LLM tool call. `Cancel appointment on ${dateStr}? Reply **Yes** or **No**.` exists verbatim in both. Migrating them separately would create two builders that must be kept in sync by hand — exactly the drift `dm-copy.ts` exists to prevent.

Follow the six-step recipe in the execution order. This task lists what to migrate, not how.

**Program / Phase:** bot-language-policy · p5 · Wave 1
**Estimated Time:** ~6–8 hours
**Status:** ✅ Eng done (2026-08-02)
**Change Type:** Copy migration (no behaviour change)
**Model:** **Opus** (two emitters converging on one builder; the LLM tool-result path is easy to break silently)
**Depends on:** the `dm-copy.ts` split decision from pre-flight ✅ — **stay single-file for this task**

---

## ✅ Task Breakdown

### 1. Reconcile duplicates first

- [ ] 1.1 Diff the two emitters and list every string that appears in both. Known pairs: the cancel confirm prompt, `That appointment wasn't found…`, and `Please reply 1, 2, or ${n}.`
- [ ] 1.2 One builder per message, called from both sites (LANG5-D7). If the two versions differ by a character, that is a **pre-existing inconsistency** — pick one, note which in the PR, and flag it as the only intentional English change in the task.
- [ ] 1.3 `cancel-reschedule-status.ts:243` and `:287` duplicate `resolveNoUpcomingAppointmentsMessage`, which already exists and is already locale-dispatched. Delete the duplicates and call the helper. Do not migrate a duplicate into a new builder.

### 2. Cancel

- [ ] 2.1 Numeric pick not found (`:68`).
- [ ] 2.2 Confirm prompt (`:76`) — shared with the action executor (`:180`).
- [ ] 2.3 Numeric invalid (`:85`) — shared with reschedule (`:176`); one builder taking the count.
- [ ] 2.4 Confirm fallback (`:149`).
- [ ] 2.5 Action executor: appointment not found (`:95`), cancelled confirmation (`:128`), declined (`:139`), pick-not-found (`:164-166`).

### 3. Reschedule

- [ ] 3.1 Numeric pick not found (`:163`).
- [ ] 3.2 Multi-choice prompt (`:305`).
- [ ] 3.3 Single-appointment path uses `formatRescheduleLinkDm` from `booking-link-copy.ts` — **leave it**, that module is `lang-22`. Note the dependency so the two tasks do not both edit it.
- [ ] 3.4 Action executor `:193` renders its own reschedule link and **ignores the queue-mode variants** in `booking-link-copy.ts`. Migrate it to call the shared helper. This is a real bug fix; call it out separately in the PR rather than burying it in the migration.

### 4. Status

- [ ] 4.1 Self-only, no self appointment (`:209`) — interpolates another patient's name. **`phi: true`** (LANG5-D3).
- [ ] 4.2 Single appointment (`:213`) — **`phi: true`**, interpolates a name.
- [ ] 4.3 List header + `(showing first 10)` (`:222`, `:224`) — one builder; the cap note is part of the same message.
- [ ] 4.4 `post_booking_ack` (`:319`).

### 5. Wiring

- [ ] 5.1 All in-turn call sites pass `ctx.turnLanguage`.
- [ ] 5.2 `action-executor-service.ts` has no `ctx`. Thread the language in from the caller rather than reading the DB inside the executor — it runs mid-turn and the value is already resolved.
- [ ] 5.3 If threading it means changing the executor's signature, do that. Do **not** add a `getConversationLanguage` call on the turn path (latency).
- [ ] 5.4 `appointmentConsultationTypeToLabel` is already localized and already takes `turnLanguage`. Confirm the migrated builders reuse it instead of re-deriving labels.

### 6. Tests

- [ ] 6.1 Byte-identical `en` assertion for all ~20 strings. Snapshot the current output **before** touching anything and diff after.
- [ ] 6.2 Per-locale golden snapshots for each new builder.
- [ ] 6.3 Both emitters of a shared message produce identical output — the test that makes LANG5-D7 stick.
- [ ] 6.4 Existing `cancel-reschedule-status.test.ts` passes unmodified. If a test needs changing, the migration changed behaviour and is wrong.
- [ ] 6.5 Cover the `:243`/`:287` deduplication: both branches now emit the helper's string.
- [ ] 6.6 Action-executor reschedule link honours queue mode (§3.4).

---

## 📁 Files

```
UPDATE: backend/src/utils/dm-copy.ts (or dm-copy/appointments.ts if split)
UPDATE: backend/src/workers/dm/stages/cancel-reschedule-status.ts
UPDATE: backend/src/services/action-executor-service.ts
UPDATE: backend/tests/unit/utils/dm-copy.snap.test.ts
UPDATE: backend/tests/unit/utils/dm-copy-locale-invariants.test.ts
UPDATE: backend/tests/unit/workers/dm/stages/cancel-reschedule-status.test.ts (only if a call signature changed)
DO NOT TOUCH: backend/src/utils/booking-link-copy.ts (lang-22)
DO NOT TOUCH: backend/src/utils/dm-appointment-status.ts (already localized; call it, don't edit it)
DO NOT TOUCH: cancel/reschedule routing, predicates, or state transitions
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **No English text changes**, with the two documented exceptions: the duplicate reconciliation in §1.2 and the queue-mode fix in §3.4. Both go in the PR description.
- **No translation.** All arms English (LANG5-D1).
- Do not change which branch fires, when a confirm prompt appears, or how appointments are picked. Strings only.
- Do not add a DB read to `action-executor-service` (§5.3).
- No try-catch in controllers; no DB access from a controller. Not expected here, but the executor sits close to that line.

---

## ✅ Acceptance Criteria

- [ ] Zero patient-facing English literals left in `cancel-reschedule-status.ts` or the cancel/reschedule paths of `action-executor-service.ts`.
- [ ] Shared messages have exactly one builder, proven by test 6.3.
- [ ] `en` output byte-identical for every string except the two documented exceptions.
- [ ] Name-interpolating status builders marked `phi: true`.
- [ ] Existing behavioural tests pass unmodified.
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
