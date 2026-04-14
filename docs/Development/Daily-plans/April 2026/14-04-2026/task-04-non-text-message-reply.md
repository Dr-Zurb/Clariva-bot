# Task A3: Non-text Message Acknowledgement
## 2026-04-14 — Sprint 1

---

## Task Overview

When a patient sends a non-text message (image, sticker, reaction, reel share), reply with "I can only process text messages right now. Please type your request and I'll help you." instead of silently ignoring.

**Estimated Time:** 2 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- `instagram-dm-webhook-handler.ts` ~334–431: `parseInstagramMessage` only reads `message.text` / `message_edit.text`
- ~1038–1078: `!parsed` → `markWebhookProcessed`, no user reply
- ~1083–1098: blank `text` → `markWebhookProcessed`, no user reply
- `webhook-controller.ts` ~406–416: `message_edit`-only → 200 without queueing
- No detection of `message.attachments`, `message.reaction`, or sticker payloads

**What's missing:**
- Detection of non-text message types in webhook payload
- "Text only" reply path
- Reaction handling

**Scope Guard:**
- Expected files touched: 2–3
- `instagram-dm-webhook-handler.ts`, `webhook-controller.ts`, possibly types

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § A3
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 21

---

## Task Breakdown

### 1. Understand Instagram webhook payload shapes
- [x] 1.1 Research Meta's webhook format for: image DMs, sticker DMs, reaction events, reel/post shares, story replies
- [x] 1.2 Identify which payloads arrive with `message.attachments` vs `message.reaction` vs other shapes

### 2. Update `parseInstagramMessage`
- [x] 2.1 Detect `message.attachments` (images, videos, stickers, shares) when `message.text` is absent
- [x] 2.2 Detect `message.reaction` payloads
- [x] 2.3 Return a new result shape, e.g. `{ type: 'non_text', senderId, recipientId, messageId }`
- [x] 2.4 Story replies with text: ensure text is still extracted and returns as normal `{ type: 'text', ... }`

### 3. Add "text only" reply branch
- [x] 3.1 After `parseInstagramMessage`, before blank-message check: if result type is `non_text` AND we have `senderId` + page token → send the acknowledgement DM
- [x] 3.2 Mark webhook as processed after sending
- [x] 3.3 Do NOT create/update conversation state for non-text messages (no side effects beyond the reply)

### 4. Rate-limit the "text only" reply
- [x] 4.1 Add a short Redis-based cooldown (e.g. 5 minutes per sender) so rapid image spam doesn't trigger 10 identical "text only" replies
- [x] 4.2 If cooldown active → silently ignore (acceptable after first ack)

### 5. Reconsider `message_edit` skip in controller
- [x] 5.1 Check if story reply text arrives as `message_edit` — if so, it should be queued, not skipped
- [x] 5.2 If `message_edit` can carry text from a story reply, update the controller to queue those

### 6. Verification
- [x] 6.1 `tsc --noEmit` passes
- [x] 6.2 Unit test: mock webhook with image attachment → verify "text only" reply is generated
- [x] 6.3 Unit test: mock webhook with reaction → verify "text only" reply
- [x] 6.4 Unit test: mock webhook with story reply containing text → verify text is processed normally
- [x] 6.5 Manual test: send image in Instagram DM → verify reply

---

## Files to Create/Update

- `instagram-dm-webhook-handler.ts` — MODIFY (parse + reply branch)
- `webhook-controller.ts` — REVIEW (message_edit skip)
- Possibly a new Redis key in `queue.ts` for rate-limiting

---

## Design Constraints

- No PHI in the "text only" reply
- The reply itself should eventually be language-mirrored (A7), but for now English is acceptable as a baseline
- Must NOT break existing text message processing
- Story replies with text must still work normally

---

## Global Safety Gate

- [x] **Data touched?** No (no conversation state update for non-text)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No — deterministic reply
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Image DM → "I can only process text messages right now..." reply
- [x] Sticker DM → same reply
- [x] Reaction (❤️) → same reply
- [x] Story reply with text → text extracted and processed normally (NOT the "text only" reply)
- [x] Rapid image spam → only first image gets the reply (cooldown)
- [x] No regression on normal text DM processing

---

**Last Updated:** 2026-04-14
**Related:** [task-12-language-mirroring.md](./task-12-language-mirroring.md)
