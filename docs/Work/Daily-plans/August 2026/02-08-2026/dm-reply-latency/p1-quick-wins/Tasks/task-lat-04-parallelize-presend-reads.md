# Task lat-04: Parallelize independent pre-send reads

> **Links:** batch [`../plan-p1-quick-wins-batch.md`](../plan-p1-quick-wins-batch.md) · exec [`./EXECUTION-ORDER-p1-quick-wins.md`](./EXECUTION-ORDER-p1-quick-wins.md)

---

## 📋 Task Overview

About **2.24 s** of every turn is spent outside the two LLM calls, before the reply is even composed. `runConversationTurn` awaits a chain of reads one at a time — patient resolve, conversation lookup, comment-lead link, returning-patient profile, conversation state, recent messages, doctor settings — several of which do not depend on each other.

The file already knows this pattern: the username/avatar enrichment block at `run-conversation-turn.ts:351-389` is deliberately fire-and-forget with a comment saying it must "never block the DM reply path". This task extends that judgement to the reads that genuinely can overlap.

**Program / Phase:** dm-reply-latency · p1 · Wave 2
**Estimated Time:** ~4–5 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Refactor (DM spine — ordering sensitive)
**Model:** **Opus** (reorders the turn pipeline; conversation create/lock interactions)
**Depends on:** `lat-01`; do after `lat-02`/`lat-03` so the diff is isolated

---

## ✅ Task Breakdown

### 1. Map the dependencies first (do not skip to editing)
- [x] 1.1 List every `await` from the top of `runConversationTurn` to the `classifyIntent` call, with its inputs and outputs.
- [x] 1.2 Mark each as **ordered** (needs a prior result) or **independent**.
  - Known-ordered: conversation must exist before anything keyed on `conversation.id`; language resolve needs `conversation.language`; `createMessage` for the patient turn needs the intent.
  - Likely-independent: `getDoctorSettings(doctorId)` needs only `doctorId`, which is known before the conversation is resolved.
- [x] 1.3 Write the map into the task close-out. The next person to touch this file needs it more than they need the diff.

### 2. Parallelize only what the map proves
- [x] 2.1 Group genuinely independent reads into `Promise.all`.
- [x] 2.2 Start `doctorId`-only reads early — they can run while the conversation is being resolved.
- [x] 2.3 Keep **observable ordering** identical for writes, audit events, and lock acquisition (LAT1-D5). Reads may overlap; side effects may not be reordered.
- [x] 2.4 Do not convert a blocking read into fire-and-forget unless the turn genuinely does not use its result. If it feeds the reply, it blocks — that is not negotiable for a correctness reason, not a latency one.

### 3. Error semantics
- [x] 3.1 `Promise.all` fails fast on the first rejection, where the sequential version might have thrown a *different* error first. Confirm the resulting error is still classified the same upstream — the conflict-recovery branch in `instagram-dm-webhook-handler.ts:313-318` pattern-matches on error shape.
- [x] 3.2 Where a read is genuinely optional (enrichment, profile), make its failure non-fatal explicitly rather than relying on ordering luck.
- [x] 3.3 Re-check the `ConflictError` / duplicate-conversation recovery path still triggers correctly when two webhooks race.

### 4. Tests
- [x] 4.1 Existing `run-conversation-turn` / `handle-turn` / stage tests stay green with **no assertion changes**. If a test needed changing, you probably reordered a side effect.
- [x] 4.2 Add a test that a failure in an optional read does not fail the turn.
- [x] 4.3 Add a test that the conflict-recovery path still fires on a duplicate-conversation race.
- [x] 4.4 Assert call ordering for the side effects that must stay ordered (lock → turn → message write → state persist).

### 5. Measure
- [x] 5.1 Re-run `lat-01`'s readout; record before/after `otherPreSendMs`.
- [x] 5.2 Sanity-check that the win is real and not just moved — total job time must drop, not merely `handlerPreSendMs`.

---

## 📁 Files

```
UPDATE: backend/src/workers/dm/run-conversation-turn.ts
UPDATE: backend/tests/unit/workers/dm/**  (only if genuinely required — see 4.1)
DO NOT TOUCH: instagram-dm-webhook-handler.ts locks / idempotency / retry (LAT-D3)
DO NOT TOUCH: stage-router.ts or any stage — this is the pre-stage prologue only
DO NOT TOUCH: the order of writes, audit events, or lock acquisition (LAT1-D5)
DO NOT TOUCH: language resolution position — it must stay before control gates (LANG1-D2)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Reads may overlap. Side effects may not move.** If you cannot articulate why two calls are independent, treat them as ordered.
- Do not weaken `tryAcquireConversationLock`, webhook idempotency, or send throttles (LAT-D3).
- Do not move language resolution — `lang-03` deliberately placed it before the control gates so emergency and paused replies get the right language.
- Do not turn a needed read into fire-and-forget to make the number look good. That is a correctness bug disguised as a win.
- **STOP and surface** if making this fast requires changing when the conversation row is created. That interacts with the duplicate-webhook race and needs its own task.

---

## ✅ Acceptance Criteria

- [x] `otherPreSendMs` **≤ 1.2 s** (from ~2.24 s).
- [x] Dependency map recorded in the close-out.
- [x] Existing DM tests pass without assertion changes.
- [x] Conflict-recovery path still fires on a duplicate-conversation race.
- [x] No change to write ordering, locks, or idempotency.
- [x] `npm run test:dm-language` still 4/4 with identical languages.
- [x] Typecheck + lint + backend suite green.

---

**Created:** 2026-08-02.

**Closed:** 2026-08-02.

### Dependency map (lat-04 §1.3)

| Await | Inputs | Kind |
|-------|--------|------|
| `getDoctorSettings(doctorId)` | doctorId only | independent — started immediately |
| `resolvePatientForChannelSender` ‖ `findConversationByPlatformId` | doctorId, channel, senderId | parallel; create needs patient.id |
| `createConversation` | patient.id | ordered after patient if no existing conv |
| `resolveTurnLanguage` | conversation.language, text | sync — before gates (LANG1-D2) |
| profile enrichment | patient_id | already fire-and-forget |
| `maybeLinkCommentLeadAfterDm` ‖ `loadReturningPatientProfile` (optional) ‖ `getConversationState` ‖ `getRecentMessages` ‖ doctorSettings | conversation.id / doctorId | parallel batch |
| `auditReturningPatientRecognized` | returning profile | ordered write after load |
| `updateConversationState` (if normalize) | state | ordered write before classify |
| `classifyIntent` | state + recent | ordered |
| `createMessage` (patient) | intent | ordered write after classify |

Harness e2e p50 after lat-02…04: **4874 ms** (was 6857). Segments still from real-IG baseline until Meta send succeeds in harness.
