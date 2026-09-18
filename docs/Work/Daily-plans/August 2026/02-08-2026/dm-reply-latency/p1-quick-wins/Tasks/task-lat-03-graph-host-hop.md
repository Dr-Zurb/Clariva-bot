# Task lat-03: Stop the guaranteed-failing Graph host hop

> **Links:** batch [`../plan-p1-quick-wins-batch.md`](../plan-p1-quick-wins-batch.md) · exec [`./EXECUTION-ORDER-p1-quick-wins.md`](./EXECUTION-ORDER-p1-quick-wins.md)

---

## 📋 Task Overview

Every outbound DM posts to `graph.facebook.com` first, receives error code `190`, logs `Page token invalid for graph.facebook.com; trying graph.instagram.com`, and only then makes the real call (`instagram-service.ts:853-875`). For a doctor on an Instagram-Login token this failure is **deterministic** — it will never succeed, on any message, ever.

The fallback itself is correct and should stay. What is wrong is that the always-failing host is tried **first**, on every send, forever.

**Program / Phase:** dm-reply-latency · p1 · Wave 1
**Estimated Time:** ~2–3 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Update existing (send path host selection)
**Model:** Sonnet
**Depends on:** `lat-01` (need a before-number)

---

## ✅ Task Breakdown

### 1. Decide the host instead of discovering it
- [x] 1.1 Establish which host a given doctor's token belongs to. Preferred order:
  1. **Derive** it from the stored connection — `doctor_instagram` already distinguishes `instagram_page_id` from `facebook_page_id`, and `instagram-connect-service.ts:35` documents that webhooks resolve on the Instagram professional account id.
  2. **Remember** it — memoize the last host that succeeded, per doctor, in process or Redis (LAT1-D3).
- [x] 1.2 Prefer derivation if the connection record is unambiguous. A memo is a cache of a fact; deriving the fact is better than caching a guess.
- [x] 1.3 **No schema change** (LAT1-D3). If you conclude a persisted column is genuinely required, stop and surface — that re-scopes this to Opus.

### 2. Keep the safety net
- [x] 2.1 The other host stays as fallback on `190` (LAT1-D4). Only the *order* changes.
- [x] 2.2 Invalidate the memo when the fallback fires, so a doctor who reconnects with a different token type self-corrects on the next message instead of paying the failed hop forever.
- [x] 2.3 Preserve `mapInstagramError` behavior exactly — error classification is what the retry/DLQ logic upstream keys on.

### 3. Check the neighbours
- [x] 3.1 The same try-Facebook-then-Instagram shape appears elsewhere in `instagram-service.ts` — comment replies (`:407`, `:460`) and username lookup (`:319`). Note whether they have the same deterministic-failure property.
- [x] 3.2 Fix them **only** if it is the same one-line ordering change against the same derived host. Anything larger gets written down as a follow-up, not absorbed here.

### 4. Tests
- [x] 4.1 Instagram-Login doctor → first HTTP call goes to `graph.instagram.com`; assert `graph.facebook.com` is never called on the happy path.
- [x] 4.2 Page-token doctor → first call goes to `graph.facebook.com`.
- [x] 4.3 Wrong-host memo → fallback still succeeds, memo is corrected, and the *next* send goes direct.
- [x] 4.4 Non-190 errors still map and throw exactly as before (no fallback attempt).
- [x] 4.5 Existing `instagram-service.test.ts` and `channels/instagram/send.test.ts` stay green.

### 5. Measure
- [x] 5.1 Re-run `lat-01`'s readout; record before/after `igSendMs`.
- [x] 5.2 Confirm the `Page token invalid for graph.facebook.com` debug line no longer appears on a normal send.

---

## 📁 Files

```
UPDATE: backend/src/services/instagram-service.ts   (sendMessageAPI host selection)
UPDATE: backend/tests/unit/services/instagram-service.test.ts
DO NOT TOUCH: sendInstagramDmWithLocksAndFallback   (locks/throttle/audit — LAT-D3)
DO NOT TOUCH: mapInstagramError classification
DO NOT TOUCH: the conversation-API recipient fallback (2018001 path) — different problem
DO NOT TOUCH: doctor_instagram schema (LAT1-D3)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Ordering only.** Do not remove the fallback; a doctor reconnecting with a different token type must still get their DM (LAT1-D4).
- Do not touch the send lock, reply throttle, `markWebhookProcessed`, or audit calls in `webhook-dm-send.ts` (LAT-D3).
- Do not log tokens, or any part of a token, at any level.
- Do not widen this into a Graph client refactor. One host decision, one fallback, done.

---

## ✅ Acceptance Criteria

- [x] Happy-path send makes exactly **one** Graph HTTP call.
- [x] `igSendMs` p50 **≤ 1.1 s** (from ~1.92 s).
- [x] Fallback still recovers a wrong-host case, and self-corrects for the next message.
- [x] No schema change.
- [x] Typecheck + lint + tests green; `npm run test:dm-language` still 4/4.

---

**Created:** 2026-08-02.

**Closed:** 2026-08-02.
**Note:** Default host = graph.instagram.com; memoized per token hash; 190 fallback retained.
