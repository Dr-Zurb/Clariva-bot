# Task A6: Throttle "Please Wait" Acknowledgement
## 2026-04-14 — Sprint 1

---

## Task Overview

When the bot throttles a patient's message (sends no reply), send a one-time "I see your messages — give me a moment" on the first throttled turn in a burst, so the patient doesn't think they're being ignored.

**Estimated Time:** 1.5 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- `webhook-dm-send.ts` ~46–141: `tryAcquireInstagramSendLock` / `tryAcquireReplyThrottle` — on skip, no outbound message at all
- `instagram-dm-webhook-handler.ts` ~3271–3305: on `throttle_skipped`, handler returns with no reply
- No "first throttle in burst" distinction exists
- No Redis key for throttle acknowledgement

**What's missing:**
- One-time ack DM on first throttle skip
- Redis key to track "already ack'd this burst"

**Scope Guard:**
- Expected files touched: 3
- `webhook-dm-send.ts`, `instagram-dm-webhook-handler.ts`, `queue.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § A6
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 18

---

## Task Breakdown

### 1. Add "throttle ack" Redis key
- [x] 1.1 In `queue.ts`, define a new Redis key pattern: `throttle_ack:{pageId}:{senderId}` with TTL ~60 seconds
- [x] 1.2 This key tracks whether we've already sent the "please wait" for this burst

### 2. Modify throttle skip path
- [x] 2.1 In the throttle skip handler (either `webhook-dm-send.ts` or `instagram-dm-webhook-handler.ts`):
  - Check if `throttle_ack` key exists for this sender
  - If NOT exists: send "I see your messages — give me a moment", set the key with TTL
  - If exists: silent skip (current behavior)
- [x] 2.2 The ack DM must use a **separate send path** that doesn't consume the reply throttle lock (or use the send lock with a special bypass)
- [x] 2.3 Keep the ack message short — it should not look like a real reply

### 3. Verification
- [x] 3.1 `tsc --noEmit` passes
- [x] 3.2 Unit test: first throttle skip → ack sent + Redis key set
- [x] 3.3 Unit test: second throttle skip within TTL → no ack sent
- [x] 3.4 Unit test: throttle skip after TTL expires → ack sent again (new burst)

---

## Files to Create/Update

- `queue.ts` — MODIFY (new Redis key definition)
- `webhook-dm-send.ts` — MODIFY (throttle ack logic)
- `instagram-dm-webhook-handler.ts` — REVIEW (may need adjustment)

---

## Design Constraints

- Ack message must not trigger another webhook loop
- Ack does NOT count as the "real" reply — next non-throttled message still gets a full response
- TTL should be short (60s) to avoid stale ack state
- Must work with existing BullMQ retry behavior

---

## Global Safety Gate

- [x] **Data touched?** No
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No — deterministic short message
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] First rapid message in a burst → "I see your messages — give me a moment"
- [x] Subsequent rapid messages within 60s → silent (no repeated acks)
- [x] After 60s gap, new burst → ack fires again
- [x] Normal (non-throttled) messages unaffected

---

**Last Updated:** 2026-04-14
