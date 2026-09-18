# Task lang-14: Undecided threads stay `NULL`

> **Links:** batch [`../plan-p4-resolver-accuracy-batch.md`](../plan-p4-resolver-accuracy-batch.md) · exec [`./EXECUTION-ORDER-p4-resolver-accuracy.md`](./EXECUTION-ORDER-p4-resolver-accuracy.md)

---

## 📋 Task Overview

Stop writing `en` to `conversations.language` when nothing was actually detected. The turn still replies in English — LANG-D1 is unchanged as a *rendering* default. What changes is that the fallback no longer masquerades as an observation.

Today, one plain-English opening message commits the thread to English for its lifetime, and escaping requires a two-marker message. That is the whole of turns 1–2 in the reproduction.

Smallest diff in the phase and the one that fixes the reported bug.

**Program / Phase:** bot-language-policy · p4 · Wave 1
**Estimated Time:** ~2 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Behaviour change to existing util + its persist caller
**Model:** Sonnet
**Depends on:** nothing

---

## ✅ Task Breakdown

### 1. Resolver

- [ ] 1.1 In `resolveTurnLanguage`, the `stored == null` + non-strong branch returns `changed: **false**`:

  ```ts
  return { language: 'en', changed: false, reason: 'default' };
  ```

  `language: 'en'` is what the turn renders. `changed: false` is what stops the write. `reason: 'default'` already distinguishes this from `'stored'` in logs — keep it.
- [ ] 1.2 Same treatment for the empty-text + `stored == null` branch (currently `changed: true`, `reason: 'default'`). A non-text first message must not commit the thread either.
- [ ] 1.3 Update the module header. It documents LANG-D2 stickiness; add LANG4-D1 next to it, stating that `en` from the default path is **not** an established language and that the `NULL` state is load-bearing.
- [ ] 1.4 Verify no other caller keys off `changed` for anything except persistence. Grep `languageResolution` and `\.changed`.

### 2. Caller

- [ ] 2.1 `run-conversation-turn.ts:322-341` needs no logic change — `languagePersist` already keys off `changed`. Confirm by reading, do not edit defensively.
- [ ] 2.2 The `conversation_language_resolved` log currently only fires when `changed`. A defaulted turn will now be silent. Either drop it to `debug` for `reason: 'default'` or leave it to `lang-18`'s `dm_language_decision_total` — **do not** leave the resolution unobservable. Pick one and note it in the PR.
- [ ] 2.3 Confirm `conversation = { ...conversation, language: turnLanguage }` (the in-memory patch after resolution) still sets `'en'` for the current turn. Downstream gates and stages must see a concrete language, never `null`.

### 3. Downstream `NULL` handling

- [ ] 3.1 `getConversationLanguage` already coerces `NULL` → `'en'`. Confirm, do not change. Out-of-band senders on an undecided thread must keep sending English.
- [ ] 3.2 Grep for any other reader of `conversation.language` that assumes non-null after the first turn. `?? null` and `?? 'en'` are both fine; a bare non-null assertion is not.
- [ ] 3.3 Threads that already have `en` persisted from before this task are **not** migrated back to `NULL`. Note the consequence explicitly: existing English-committed threads keep needing a strong signal. New threads get the fixed behaviour. No backfill — a migration to un-set a column based on a guess about how it got there is worse than the bug.

### 4. Tests

- [ ] 4.1 **Update** `conversation-language.test.ts:115-128` — `'single marker on fresh thread → en (not hi-Latn)'` keeps `language: 'en'` but now expects `changed: false`. Retitle so the intent is legible: the language shown is English, the thread stays undecided.
- [ ] 4.2 **Update** `turn-language.test.ts:196-206` — fresh thread + `hey hallo` no longer persists. Assert `updateConversationState` is called **without** a language option, and that `ctx.turnLanguage` is still `'en'`. Both halves matter; asserting only the first would pass with the reply language broken.
- [ ] 4.3 New: fresh thread, three consecutive plain-English turns → zero language writes, every reply English.
- [ ] 4.4 New: fresh thread → `hey hallo` (no write) → then `mujhe kal appointment chahiye` → persists `hi-Latn`. The path that was previously blocked.
- [ ] 4.5 New: fresh thread, first message is empty/non-text → no write, replies English.
- [ ] 4.6 Regression: `stored = 'en'` (explicitly persisted) + strong Hinglish → still switches. This task must not affect already-established threads.
- [ ] 4.7 Regression: `stored = 'hi-Latn'` + plain English → stays `hi-Latn` (LANG-D2).

---

## 📁 Files

```
UPDATE: backend/src/utils/conversation-language.ts (resolveTurnLanguage default branches + header)
UPDATE: backend/tests/unit/utils/conversation-language.test.ts
UPDATE: backend/tests/unit/workers/dm/turn-language.test.ts
READ-ONLY: backend/src/workers/dm/run-conversation-turn.ts (confirm, likely no edit)
DO NOT TOUCH: backend/migrations/** — no schema change, the NULL state already exists
DO NOT TOUCH: marker lists (lang-15)
DO NOT TOUCH: any dm-copy or locale table
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **No migration and no backfill.** Migration 190 is already nullable with the right CHECK. Do not add a data-fix migration for rows written before this task (§3.3).
- Do not change what language the turn *renders*. LANG-D1 stands: no signal → English reply.
- Do not touch marker lists, thresholds, or the Punjabi ordering. That is `lang-15` and it will conflict.
- Do not "fix" the two existing tests by deleting them. They must be *updated* and their new intent stated.
- Never read `process.env` — use `config/env.ts`.

---

## ✅ Acceptance Criteria

- [ ] A thread opening with `hey hallo` replies in English and leaves `conversations.language` `NULL`.
- [ ] That same thread switches to `hi-Latn` on a later strong Hinglish message.
- [ ] Threads with an explicitly persisted language behave exactly as before.
- [ ] `getConversationLanguage` still returns `'en'` for `NULL` — out-of-band senders unaffected.
- [ ] Both pre-existing tests updated with a stated reason, not deleted.
- [ ] Typecheck + lint + language suite green.

---

**Created:** 2026-08-02.
