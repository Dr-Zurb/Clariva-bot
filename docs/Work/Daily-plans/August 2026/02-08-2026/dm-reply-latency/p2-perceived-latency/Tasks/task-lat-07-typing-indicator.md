# Task lat-07: Typing indicator (`sender_action`)

> **Links:** batch [`../plan-p2-perceived-latency-batch.md`](../plan-p2-perceived-latency-batch.md) · exec [`./EXECUTION-ORDER-p2-perceived-latency.md`](./EXECUTION-ORDER-p2-perceived-latency.md)

---

## 📋 Task Overview

Show a typing indicator as soon as the worker knows who the patient is, so the remaining wait reads as the bot composing rather than the bot being dead.

Unlike the deferred "please wait" bubble, `sender_action` is not a message: it cannot land in the transcript, cannot be duplicated by a webhook retry, and needs no copy — which also means it needs no localization (LAT2-D5).

**Program / Phase:** dm-reply-latency · p2 · Wave 1
**Estimated Time:** ~3–4 hours
**Status:** 🔒 Blocked on `lat-06`
**Change Type:** New capability (one Graph helper + one call site)
**Model:** Sonnet
**Depends on:** `lat-06` (phase gate), `lat-03` (host selection — reuse it, do not re-derive)

---

## ✅ Task Breakdown

### 0. Feasibility first
- [ ] 0.1 Confirm `sender_action: typing_on` is supported for this app's Instagram messaging product and token type. Nothing in the codebase uses it today, so this is unverified.
- [ ] 0.2 If unsupported, **stop and surface**. Do not substitute a text message (LAT-D2). A dead phase is a fine outcome.
- [ ] 0.3 Note whether `mark_seen` is available and whether it is worth pairing — a read receipt plus typing reads more natural than typing alone, but only if it is one call.

### 1. The helper
- [ ] 1.1 Add a `sendInstagramSenderAction(recipientId, action, token, correlationId)` alongside the existing send helpers in `instagram-service.ts`.
- [ ] 1.2 Reuse the host selection from `lat-03`. Do not re-derive it and do not reintroduce the try-Facebook-first pattern.
- [ ] 1.3 Short timeout — well under the message send's 10 s. A slow indicator is worthless; better to give up.
- [ ] 1.4 Swallow all errors internally and log at `debug`. This function must be impossible to throw out of (LAT2-D2).

### 2. The call site
- [ ] 2.1 Fire it in the DM worker after the tenant/token is resolved and before the LLM work begins (LAT2-D3) — near the top of the turn, not from the HTTP controller.
- [ ] 2.2 Fire-and-forget (`void`), following the existing enrichment pattern at `run-conversation-turn.ts:351-389`.
- [ ] 2.3 It must not participate in the send lock, reply throttle, idempotency marking, or audit events used by the real reply (LAT-D3).

### 3. Suppression (LAT2-D4)
- [ ] 3.1 Do not fire on echoes, read/delivery receipts, or other non-actionable events.
- [ ] 3.2 Do not fire when the turn will be throttle-skipped.
- [ ] 3.3 Do not fire on comment webhooks, notifications, or any out-of-band sender — inbound DM turns only.
- [ ] 3.4 Consider skipping it on an intent-cache hit, where the reply may arrive fast enough that the indicator flickers.

### 4. Tests
- [ ] 4.1 Indicator is attempted once on a normal inbound DM turn.
- [ ] 4.2 Indicator throwing / timing out does not affect the reply — assert the reply still sends and the turn still completes.
- [ ] 4.3 Not fired on echo, throttle-skip, or comment payloads.
- [ ] 4.4 It does not acquire or release any lock, and does not mark the webhook processed.
- [ ] 4.5 No message row is created for it.

### 5. Measure
- [ ] 5.1 Time from patient send → indicator visible, on a real thread.
- [ ] 5.2 Confirm job total and `handlerPreSendMs` are unchanged beyond noise. If the indicator shows up in the critical path, it is wired wrong.

---

## 📁 Files

```
UPDATE: backend/src/services/instagram-service.ts        (sendInstagramSenderAction)
UPDATE: backend/src/workers/instagram-dm-webhook-handler.ts  (single fire-and-forget call)
UPDATE: backend/tests/unit/services/instagram-service.test.ts
UPDATE: backend/tests/unit/workers/**  (suppression + non-blocking assertions)
DO NOT TOUCH: sendInstagramDmWithLocksAndFallback (LAT-D3)
DO NOT TOUCH: dm-copy.ts or any copy module — there is no copy in this task (LAT2-D5)
DO NOT TOUCH: webhook idempotency, DLQ, retry
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **No message, no copy, no localization.** The moment this task produces patient-visible *text*, it has become the deferred "please wait" design and must stop (LAT-D2).
- Do not retry the indicator, and do not await it in a way that can delay the reply.
- Do not add it to notification, refund, reminder, or comment paths.
- Do not log tokens or message content.
- **STOP and surface** if making it appear reliably requires moving it into the HTTP handler — that trades Meta ack latency for cosmetics and needs a decision.

---

## ✅ Acceptance Criteria

- [ ] Indicator appears in a real thread **≤ 1.5 s** after the patient sends.
- [ ] Forced indicator failure leaves the reply fully intact.
- [ ] Never appears as a message in the transcript.
- [ ] Not fired on echo / throttle-skip / comment / out-of-band paths.
- [ ] Job total unchanged beyond noise.
- [ ] Typecheck + lint + tests green; `npm run test:dm-language` still 4/4.

---

**Created:** 2026-08-02.
