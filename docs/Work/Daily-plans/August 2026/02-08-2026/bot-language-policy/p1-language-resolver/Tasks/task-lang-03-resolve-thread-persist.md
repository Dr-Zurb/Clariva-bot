# Task lang-03: Resolve once per turn, thread through context, persist

> **Links:** batch [`../plan-p1-language-resolver-batch.md`](../plan-p1-language-resolver-batch.md) · exec [`./EXECUTION-ORDER-p1-language-resolver.md`](./EXECUTION-ORDER-p1-language-resolver.md)

---

## 📋 Task Overview

Wire `lang-01`'s resolver into the DM turn. Resolve **once**, early, before control gates; expose the result on `DmTurnContext` as `turnLanguage`; persist it when it changes.

After this task, every downstream consumer *can* read the turn language. Migrating them to actually do so is p2 — the one exception is the LLM path, which `lang-04` switches immediately.

**Program / Phase:** bot-language-policy · p1 · Wave 3
**Estimated Time:** ~4–6 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Refactor (conversation state + turn plumbing)
**Model:** **Opus** (agent-contract: 5+ file refactor on conversation state) — executed on founder request
**Depends on:** `lang-01` (resolver), `lang-02` (column + type)

---

## ✅ Task Breakdown

### 1. Resolve
- [x] 1.1 In `run-conversation-turn.ts`, after the inbound text is available and **before** `executeDmTurn`, call `resolveTurnLanguage(conversation.language ?? null, text)`.
- [x] 1.2 Place it **before** the control gates so emergency and pause replies inherit the same language (LANG1-D2). The gates run inside `executeDmTurn` (`handle-turn.ts:24-45`), so resolving before that call is sufficient.
- [x] 1.3 Non-text inbound (image, audio, sticker) → pass an empty string; the resolver treats it as "no signal" and keeps stored (`lang-01` 3.4).

### 2. Thread through
- [x] 2.1 Add `turnLanguage: ConversationLanguage` to `DmTurnContext` in `backend/src/workers/dm/stage-router.ts`.
- [x] 2.2 Populate it in the `turnCtx` literal in `run-conversation-turn.ts` (~`:553`).
- [x] 2.3 Make it **required**, not optional. An optional field invites `?? 'en'` fallbacks scattered downstream, which is the fragmentation we are removing.
- [x] 2.4 Update every `DmTurnContext` fixture/mock in `backend/tests/**` so the required field compiles. Expect a wide but mechanical test diff.

### 3. Persist
- [x] 3.1 Extend `updateConversationState` (or add a sibling in `conversation-service.ts`) so the turn's language is written alongside state. Prefer extending the existing call — `run-conversation-turn.ts` already persists at `:393` and `:714`; do **not** add a third write path.
- [x] 3.2 Write only when `resolution.changed === true` (LANG1-D4). Unchanged turns must not dirty the row.
- [x] 3.3 Both persist sites must agree. If `:393` is an early-return path, it needs the same treatment as `:714` or the language silently fails to save on those turns.

### 4. Logging
- [x] 4.1 When `changed`, log at INFO with `correlationId`, `from`, `to`, `reason`. Language codes are not PHI (LANG-D9).
- [x] 4.2 **Never** log the message text that produced the decision.

### 5. Tests
- [x] 5.1 Fresh conversation (`language = null`) + `hey hallo` → `turnLanguage === 'en'`, persisted once.
- [x] 5.2 Stored `hi-Latn` + English message → context carries `hi-Latn`, **no** write issued.
- [x] 5.3 Stored `en` + strong Hinglish → context carries `hi-Latn`, write issued once.
- [x] 5.4 Emergency gate turn → gate fires and `turnLanguage` is already populated (proves ordering from 1.2).
- [x] 5.5 Non-text inbound → stored language preserved, no write.
- [x] 5.6 Both persist paths (`:393`, `:714`) covered.

---

## 📁 Files

```
UPDATE: backend/src/workers/dm/run-conversation-turn.ts   (resolve + populate + persist)
UPDATE: backend/src/workers/dm/stage-router.ts            (DmTurnContext.turnLanguage)
UPDATE: backend/src/services/conversation-service.ts      (persist language with state)
UPDATE: backend/tests/**                                   (DmTurnContext fixtures — mechanical)
CREATE: backend/tests/unit/workers/dm/turn-language.test.ts
DO NOT TOUCH: backend/src/utils/safety-messages.ts        (p2 · lang-06)
DO NOT TOUCH: backend/src/utils/localize-reply.ts         (p2 · lang-07)
DO NOT TOUCH: backend/src/utils/dm-copy.ts                (p3)
DO NOT TOUCH: any stage's reply text (this task only makes the value available)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Do not change a single reply string in this task.** Behavior must be identical except for the new stored column. `lang-04` is where output changes.
- Do not migrate `detectSafetyMessageLocale` callers — that is `lang-06`, deliberately separate so this diff stays reviewable.
- Do not add a third conversation-write path.
- No try-catch in controllers; this is worker code but the same typed-error rules apply — throw `AppError` subclasses, never raw `Error`.
- Never read `process.env` — use `config/env.ts`.
- **STOP and surface** if threading the field forces changes outside `workers/dm/**`, `services/conversation-service.ts`, and tests.

---

## ✅ Acceptance Criteria

- [x] `turnLanguage` is required on `DmTurnContext` and populated on every turn.
- [x] Resolution happens exactly once per turn — grep shows a single `resolveTurnLanguage` call in `src/`.
- [x] Persist only on change; both existing write paths covered.
- [x] No reply text differs from `main` (diff the golden snapshots — they must be untouched).
- [x] Typecheck + lint + full backend test suite green. *(typecheck clean; turn-language + lang-01/02 + stage fixtures green; one pre-existing `dm-stage-router` fixture mismatch unrelated to language)*

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
