# Execution order — p1 language resolver

> Batch: [`../plan-p1-language-resolver-batch.md`](../plan-p1-language-resolver-batch.md)

---

## Pre-flight (before any code)

- [ ] Confirm **LANG-D1…D9** and **LANG1-D1…D6** with founder — especially **LANG-D2** (no automatic snap-back to English) and **LANG-D7** (non-en/hi/pa scripts render English copy in v1).
- [ ] Read the current language surface end to end:
  - `backend/src/utils/safety-messages.ts:49-79` (`detectSafetyMessageLocale`)
  - `backend/src/utils/localize-reply.ts:27-41` (`detectPatientLanguageHint`)
  - `backend/src/services/ai-service.ts:407-431` (`RESPONSE_SYSTEM_PROMPT_BASE`, the `LANGUAGE` + `STABILITY` block at :411)
  - `backend/src/workers/dm/run-conversation-turn.ts` (turn assembly + state persist)
  - `backend/src/workers/dm/handle-turn.ts:24-45` (gates → stage router)
- [ ] Confirm next migration number is **190** (`ls backend/migrations | sort -V | tail`).

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Pure logic** | `lang-01` ✅ | No dependencies. Land the resolver + tests first so the rule is reviewable in isolation. |
| **2 — Storage** | `lang-02` ✅ | **Opus.** Migration only. Can run parallel to wave 1. |
| **3 — Wiring** | `lang-03` ✅ | **Opus.** Needs 01 + 02. Threads `turnLanguage` through the turn and persists it. |
| **4 — Prompt** | `lang-04` ✅ | Needs 03 (consumes `turnLanguage`). This is the wave that visibly fixes the bug. |
| **5 — Gate** | `lang-05` | Live smoke on the Instagram thread that produced the bug. |

---

## Task files

| # | File |
|---|------|
| 01 | [`task-lang-01-conversation-language-resolver.md`](./task-lang-01-conversation-language-resolver.md) |
| 02 | [`task-lang-02-conversation-language-migration.md`](./task-lang-02-conversation-language-migration.md) |
| 03 | [`task-lang-03-resolve-thread-persist.md`](./task-lang-03-resolve-thread-persist.md) |
| 04 | [`task-lang-04-llm-explicit-language-directive.md`](./task-lang-04-llm-explicit-language-directive.md) |
| 05 | [`task-lang-05-close-gate-p1.md`](./task-lang-05-close-gate-p1.md) |

---

**Created:** 2026-08-02.
