# Task A5: Abandoned Booking Reminder (1 Hour)
## 2026-04-14 — Sprint 3

---

## Task Overview

Send one reminder DM approximately 1 hour after a booking link was sent if the patient hasn't completed payment. No repeated reminders — just one gentle nudge.

**Estimated Time:** 4 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **New feature** — Add code only (no change to existing behavior)

**Current State:**
- No abandoned booking reminder exists
- Booking token TTL is ~1 hour (`booking-token.ts` ~12) but that's for token expiry, not a proactive DM
- Conversation state tracks `step: 'awaiting_slot_selection'` after link is sent
- No `booking_link_sent_at` timestamp is stored

**What's missing:**
- Timestamp tracking: when was the booking link sent?
- Cron job to find conversations past the reminder window
- Reminder DM send
- "Already reminded" flag to prevent repeats

**Scope Guard:**
- Expected files touched: 4–5
- `conversation.ts` (types), `instagram-dm-webhook-handler.ts`, `notification-service.ts`, `cron.ts`, possibly new cron handler

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § A5
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 16

---

## Task Breakdown

### 1. Track `booking_link_sent_at`
- [x] 1.1 Add `bookingLinkSentAt?: string` (ISO timestamp) to conversation state type in `conversation.ts`
- [x] 1.2 In the webhook handler, wherever a booking link is sent and step is set to `awaiting_slot_selection`, also set `bookingLinkSentAt: new Date().toISOString()`
- [x] 1.3 Clear `bookingLinkSentAt` when:
  - Payment is received (step changes from `awaiting_slot_selection`)
  - Patient starts a new flow (cancel, new booking, etc.)
  - Conversation resets to `responded`

### 2. Track `bookingReminderSent`
- [x] 2.1 Add `bookingReminderSent?: boolean` to conversation state
- [x] 2.2 Set to `true` after sending the reminder
- [x] 2.3 Clear when `bookingLinkSentAt` is cleared (new booking cycle)

### 3. Create reminder cron job
- [x] 3.1 New function: `runAbandonedBookingReminderJob`
- [x] 3.2 Query: conversations where:
  - `step = 'awaiting_slot_selection'`
  - `bookingLinkSentAt < now() - 1 hour`
  - `bookingReminderSent !== true`
- [x] 3.3 For each: send DM "Just checking in — your booking link is still active if you'd like to complete it."
- [x] 3.4 Set `bookingReminderSent = true`
- [x] 3.5 Wire into `cron.ts` (every 10 minutes)

### 4. Reminder DM
- [x] 4.1 Use existing Instagram DM send infrastructure
- [x] 4.2 Requires conversation → page token + sender ID lookup
- [x] 4.3 Keep message short and non-pushy
- [x] 4.4 English for now (A7 handles mirroring later)

### 5. Edge cases
- [x] 5.1 Patient completes payment between cron runs → `bookingLinkSentAt` cleared by payment webhook; cron skips
- [x] 5.2 Patient sends a new message after link but before reminder → may change step; cron skips if step changed
- [x] 5.3 Multiple booking links sent (re-sent link) → `bookingLinkSentAt` updated to latest; timer resets

### 6. Verification
- [x] 6.1 `tsc --noEmit` passes
- [x] 6.2 Unit test: conversation with `bookingLinkSentAt` 2 hours ago, no reminder → picked up
- [x] 6.3 Unit test: conversation with reminder already sent → skipped
- [x] 6.4 Unit test: conversation with `step != 'awaiting_slot_selection'` → skipped
- [x] 6.5 Integration: run cron endpoint → verify DM sent

---

## Files to Create/Update

- `conversation.ts` — MODIFY (add `bookingLinkSentAt`, `bookingReminderSent` to state type)
- `instagram-dm-webhook-handler.ts` — MODIFY (set/clear timestamps)
- `notification-service.ts` or new file — ADD (reminder job)
- `cron.ts` — MODIFY (wire new job)

---

## Design Constraints

- ONE reminder only — never send a second
- Must be idempotent (re-running cron doesn't re-send)
- Must not send reminders for conversations that have moved past `awaiting_slot_selection`
- Reminder should feel helpful, not pushy
- Cron interval should be 10 minutes (not too frequent, not too slow)

---

## Global Safety Gate

- [x] **Data touched?** Yes — conversation state read/write
  - [x] **RLS verified?** Uses admin client for cron
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Yes — Instagram DM send
  - [x] **Consent + redaction confirmed?** No PHI in reminder DM
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Booking link sent → 1 hour passes with no payment → one reminder DM sent
- [x] After reminder → no second reminder ever
- [x] Payment completed before reminder → no reminder sent
- [x] New booking link re-sent → timer resets
- [x] Cron is idempotent

---

**Last Updated:** 2026-04-14
