# Task lang-23: Comment DMs, throttle ack, fallback, OOB stragglers

> **Links:** batch [`../plan-p5-copy-coverage-batch.md`](../plan-p5-copy-coverage-batch.md) · exec [`./EXECUTION-ORDER-p5-copy-coverage.md`](./EXECUTION-ORDER-p5-copy-coverage.md)

---

## 📋 Task Overview

The last ~10 strings, grouped because they share one problem: **none of them has a `ctx.turnLanguage` to read.**

They fire on paths outside a normal turn — a comment arriving before any DM thread exists, a burst-throttle ack, a stage fallback, a background sender. Each needs its language resolved from somewhere else, which is why they are last and why they were missed.

They also matter more than their count suggests. `FALLBACK_REPLY` and the throttle ack are error-adjacent — sometimes the only message a patient receives.

**Program / Phase:** bot-language-policy · p5 · Wave 4
**Estimated Time:** ~4–5 hours
**Status:** ✅ Done (eng)
**Change Type:** Copy migration + language sourcing for non-turn paths
**Model:** Sonnet
**Depends on:** `lang-22`. Reuse the out-of-band stored-column pattern from `lang-11` rather than re-deriving it.

---

## ✅ Task Breakdown

### 1. `FALLBACK_REPLY`

- [x] 1.1 Builder `buildFallbackReplyMessage` + `FALLBACK_REPLY_EN`.
- [x] 1.2 Stage fallback / empty LLM / conflict recovery pass `turnLanguage`.
- [x] 1.3 Conflict recovery uses resolved `turnLanguage` (same path as normal turns).
- [x] 1.4 Unknown-page / no-doctor keeps `FALLBACK_REPLY` English constant — exception list.

### 2. Throttle ack

- [x] 2.1 `buildThrottleAckMessage`.
- [x] 2.2 Uses `turnOut.meta.turnLanguage` (conversation already loaded; **no extra DB read**).
- [x] 2.3 Documented: reuse turn meta, not a new query.

### 3. Comment proactive DMs

- [x] 3.1 Shared `buildCommentProactiveDmMessage` (IG + FB).
- [x] 3.2 All high-intent arms covered.
- [x] 3.3 `resolveCommentOutreachLanguage` — linked conversation or `en` (LANG5-D6).
- [x] 3.4 Explicit comments: never detect from comment text.
- [x] 3.5 `COMMENT_PUBLIC_REPLY_TEXT` on exception list (stays English).

### 4. Out-of-band stragglers

- [x] 4.1 `sendConsultationLinkToPatient` → `buildConsultationReadyDm` (video) + stored language. **Documented English shape change** (one-liner → multi-line consult-ready; task-mandated consolidation).
- [x] 4.2 Slot selected / duplicate booking / reschedule confirm use builders + `getConversationLanguage`.
- [x] 4.3 SLA timeout covered in lang-22 §2.5.
- [x] 4.4 Welcome-back segment takes `language` (`buildWelcomeBackSegmentMessage`).

### 5. Exception list

- [x] 5.1 `DM_COPY_ENGLISH_ONLY_EXCEPTIONS` in `dm-copy.ts`.
- [x] 5.2 Asserted in `dm-copy-lang-23.test.ts` for lang-24 sweep.

### 6. Tests

- [x] 6.1–6.8 Covered in `dm-copy-lang-23.test.ts`, `comment-outreach-language.test.ts`, snaps, composer + idle-fee tests.

---

## 📁 Files

```
UPDATE: backend/src/utils/dm-copy.ts
UPDATE: backend/src/services/comment-outreach-language.ts (new)
UPDATE: backend/src/workers/dm/run-conversation-turn.ts
UPDATE: backend/src/workers/instagram-dm-webhook-handler.ts
UPDATE: backend/src/workers/instagram-comment-webhook-handler.ts
UPDATE: backend/src/workers/facebook-comment-webhook-handler.ts
UPDATE: backend/src/services/slot-selection-service.ts
UPDATE: backend/src/services/notification-service.ts
UPDATE: backend/src/utils/dm-reply-composer.ts
UPDATE: backend/tests/unit/utils/dm-copy-lang-23.test.ts
DO NOT TOUCH: COMMENT_PUBLIC_REPLY_TEXT beyond exception-list wiring
DO NOT TOUCH: comment lead capture, dedupe, or DM-eligibility logic
DO NOT TOUCH: throttle/burst detection thresholds
```

---

## ✅ Acceptance Criteria

- [x] `FALLBACK_REPLY`, throttle ack, and comment DMs all resolve a language or are on the exception list.
- [x] One shared comment-DM builder across Instagram and Facebook.
- [x] Comment text provably cannot set a conversation's language.
- [x] Welcome-back prefix matches its composed language arm.
- [x] Exception list exists and is asserted by tests.
- [x] `en` byte-identical except consult-link consolidation (§4.1).
- [x] Typecheck + lint (touched) + tests green.

---

**Created:** 2026-08-02.
**Completed:** 2026-08-02.
