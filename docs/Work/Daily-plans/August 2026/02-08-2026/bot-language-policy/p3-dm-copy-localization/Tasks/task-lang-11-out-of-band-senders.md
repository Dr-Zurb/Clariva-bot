# Task lang-11: Migrate out-of-band senders (DB-read language)

> **Links:** batch [`../plan-p3-dm-copy-localization-batch.md`](../plan-p3-dm-copy-localization-batch.md) · exec [`./EXECUTION-ORDER-p3-dm-copy-localization.md`](./EXECUTION-ORDER-p3-dm-copy-localization.md)

---

## 📋 Task Overview

Make background-sent DMs speak the thread's language. These senders fire hours or days after the conversation, with no `DmTurnContext` — they must read `conversations.language` (the column `lang-02` added) and default to English when it is `NULL`.

This is the payoff for storing language instead of re-deriving it: a reminder sent tomorrow still knows what language yesterday's conversation was in.

**Program / Phase:** bot-language-policy · p3 · Wave 3
**Estimated Time:** ~4–5 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Refactor (background senders + a DB read)
**Model:** **Opus** (cross-service, touches consent/refund/deletion notification paths)
**Depends on:** `lang-09` (pattern). Parallel-safe with `lang-10`.

---

## ✅ Task Breakdown

### 1. Language lookup
- [x] 1.1 Add `getConversationLanguage(conversationId, correlationId): Promise<ConversationLanguage>` to `conversation-service.ts`.
- [x] 1.2 Returns `'en'` when the row is missing, the column is `NULL`, or the value fails the union check (LANG3-D3, LANG-D1).
- [x] 1.3 Never throws on a missing conversation — a notification must not fail because language lookup did. Log at WARN and return `'en'`.
- [x] 1.4 If a sender already loads the conversation row for other reasons, read `language` off that row instead of issuing a second query.

### 2. Senders
- [x] 2.1 `abandoned-booking-reminder.ts` — reminder in the thread's language. Highest-value case: the patient abandoned mid-funnel in Hinglish.
- [x] 2.2 `notification-service.ts` — consultation-ready, prescription-ready, post-consult chat link, transcript-downloaded, recording-replayed.
- [x] 2.3 `modality-refund-retry-worker.ts` — `buildRefundProcessingDm` (`:1685`), `buildRefundFailedDm` (`:1703`).
- [x] 2.4 `collection-service.ts` — whichever builders it invokes.
- [x] 2.5 `account-deletion-worker.ts` — `buildAccountDeletionExplainerDm` (`:1372`) stays **English-only** per LANG3-D7, but still route language through so the exemption is explicit rather than accidental.

### 3. Edge cases
- [x] 3.1 Account deletion: the conversation may be gone or cascading. Lookup must tolerate that and return `'en'`.
- [x] 3.2 Refund DMs: money copy. Verify LANG3-D6 invariants — ₹ amounts identical across locales.
- [x] 3.3 Notifications addressed to a patient with **no** conversation (if any such path exists) → `'en'`, no error.

### 4. Tests
- [x] 4.1 `getConversationLanguage`: happy path, `NULL` → `en`, missing row → `en` + WARN, invalid stored value → `en`.
- [x] 4.2 Abandoned-booking reminder on a `hi-Latn` conversation renders Hinglish.
- [x] 4.3 Refund DM: ₹ amount byte-identical across `en` / `hi`.
- [x] 4.4 Account-deletion DM is English even on a `hi` conversation, and the test says **why** (LANG3-D7) so a future reader does not "fix" it.
- [x] 4.5 No sender issues a duplicate conversation query (1.4).

---

## 📁 Files

```
UPDATE: backend/src/services/conversation-service.ts        (getConversationLanguage)
UPDATE: backend/src/services/abandoned-booking-reminder.ts
UPDATE: backend/src/services/notification-service.ts
UPDATE: backend/src/services/collection-service.ts
UPDATE: backend/src/workers/modality-refund-retry-worker.ts
UPDATE: backend/src/workers/account-deletion-worker.ts
UPDATE: backend/tests/**
DO NOT TOUCH: in-turn callers (lang-10)
DO NOT TOUCH: dm-copy.ts internals (lang-09 / lang-12)
DO NOT TOUCH: notification scheduling, retry, or delivery logic
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Language only.** Do not touch scheduling, retry/backoff, dedupe, or delivery in these workers. They are load-bearing and unrelated.
- Do not make a notification failure possible via language lookup. Every failure mode returns `'en'`.
- Do not translate the account-deletion or consent explainers (LANG3-D7).
- Never log message content or PII; language codes are fine (LANG-D9).
- Never read `process.env` — use `config/env.ts`.
- **STOP and surface** if a sender has no reachable conversation id at all — that needs a design call, not an invented fallback chain.

---

## ✅ Acceptance Criteria

- [x] Every out-of-band sender resolves language from stored state, never from message text and never hardcoded.
- [x] Lookup failures degrade to English silently (WARN only) and never break a send.
- [x] Refund/money copy passes the LANG3-D6 invariants.
- [x] Account-deletion English-only is explicit and tested.
- [x] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.

**Closed:** 2026-08-02.
