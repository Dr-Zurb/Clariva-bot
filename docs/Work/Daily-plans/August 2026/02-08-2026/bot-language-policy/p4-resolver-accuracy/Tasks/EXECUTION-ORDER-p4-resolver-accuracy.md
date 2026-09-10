# Execution order — p4 resolver accuracy

> Batch: [`../plan-p4-resolver-accuracy-batch.md`](../plan-p4-resolver-accuracy-batch.md)

---

## Pre-flight (before any code)

- [x] **Get a founder decision on LANG4-D4** (classifier language signal amends LANG-D6). ✅ **Yes** (2026-08-02) — `lang-17` shipped.
- [ ] Confirm **LANG4-D1** — a thread that opens in plain English keeps `conversations.language = NULL` rather than `'en'`. Replies are still English. Cheap to state, easy to misread as "we stopped defaulting to English".
- [ ] Re-verify the line numbers cited in the task files. They were captured 2026-08-02 against the current worktree and drift with any edit.
- [ ] Read the surface end to end:
  - `backend/src/utils/conversation-language.ts` — whole file, ~330 lines
  - `backend/src/workers/dm/run-conversation-turn.ts:320-341` (resolve + persist)
  - `backend/src/services/conversation-service.ts` `getConversationLanguage` / `coerceConversationLanguage` (NULL → `en` at the edge)
  - `backend/migrations/190_conversation_language.sql` — confirm nullable + CHECK already allow the `NULL` state
- [ ] Run the existing suite green **before** starting, and note which tests encode current behaviour:
  - `backend/tests/unit/utils/conversation-language.test.ts:115-128` — `'single marker on fresh thread → en (not hi-Latn)'`
  - `backend/tests/unit/workers/dm/turn-language.test.ts:196-206` — asserts a fresh thread **persists** `{ language: 'en' }`

  Both are correct assertions about today's behaviour and **wrong about the behaviour we want**. `lang-14` updates them deliberately. Changing them is the point of the task, not collateral damage — say so in the PR.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Pure logic** | `lang-14` ✅, `lang-15` ✅ | Independent of each other; both are `conversation-language.ts` + its unit test. Land `lang-14` first — it is the smallest diff and fixes the reproduction on its own. If they run in parallel, expect a merge conflict in the same test file. |
| **2 — Thread context** | `lang-16` ✅ | Needs `lang-14` (the `NULL` state is what gates accumulation) and `lang-15` (accumulates over the corrected counter). First task to change the resolver's **signature**, so it touches the caller. |
| **3 — Ratchet** | `lang-17` | **Opus.** Blocked on the LANG4-D4 pre-flight answer. Needs `lang-16` — the ratchet is an additional evidence source feeding the same decision point. |
| **4 — Evidence** | `lang-18` ✅ | Can start any time after wave 1 and should: the corpus is how waves 2–3 are judged. Land the telemetry early so `lang-19`'s smoke has logs to read. |
| **5 — Gate** | `lang-19` | 🟡 Stress pack + §15 closed; **founder IG smoke** still open ([02-language.md](../../../../../../Reference/product/receptionist-bot/bot-testing/02-language.md)). |

**If you only ship one wave:** wave 1. `lang-14` + `lang-15` fix the reported bug. Waves 2–3 are about the misses nobody has reported yet.

---

## Task files

| # | File |
|---|------|
| 14 | [`task-lang-14-undecided-language-not-persisted.md`](./task-lang-14-undecided-language-not-persisted.md) |
| 15 | [`task-lang-15-marker-contention-pa-hi.md`](./task-lang-15-marker-contention-pa-hi.md) |
| 16 | [`task-lang-16-cross-turn-marker-accumulation.md`](./task-lang-16-cross-turn-marker-accumulation.md) |
| 17 | [`task-lang-17-classifier-language-signal.md`](./task-lang-17-classifier-language-signal.md) |
| 18 | [`task-lang-18-language-regression-corpus.md`](./task-lang-18-language-regression-corpus.md) |
| 19 | [`task-lang-19-close-gate-p4.md`](./task-lang-19-close-gate-p4.md) |

---

**Created:** 2026-08-02.
