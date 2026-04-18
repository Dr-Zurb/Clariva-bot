# Task 06: Abandoned-booking reminder — re-include booking URL
## 18 April 2026 — Plan "Patient DM copy polish", P2

---

## Task Overview

The abandoned-booking reminder (`backend/src/services/abandoned-booking-reminder.ts` line 59) says:

```
Just checking in — your booking link is still active if you'd like to complete it. Reply anytime if you need help.
```

Problem (from 2026-04-17 audit): the patient has to scroll up to find the original booking link (it may be dozens of messages back, or in a separate notification). The reminder tells them the link is "still active" without giving them the link.

**Fix:** re-send the booking URL on its own line so the patient can tap immediately.

**Target shape:**

```
Just checking in — your booking link is still active.

Pick a time here:
{bookingUrl}

Reply here anytime if you need help.
```

**Estimated Time:** 1 hour  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Add `buildAbandonedBookingReminderMessage(input: { bookingUrl: string }): string` to `dm-copy.ts`.
2. In `abandoned-booking-reminder.ts`, build the URL using the existing helper `buildBookingPageUrl(conversationId, doctorId)` (already used in `service-match-learning-autobook.ts:157` and `service-staff-review-service.ts:431`). This ensures the reminder's URL is identical to the one initially sent.
3. Replace the inline string with a call to the builder.
4. Snapshot.

**Scope trade-offs:**
- No short-link service. Instagram DMs render the long URL fine; using a tracking redirector is a separate product decision.
- No query-param attribution for "came from reminder vs. initial link" — that's observability telemetry, outside this task. If we want it later, we can pass an `utm_source=reminder` through `buildBookingPageUrl`.
- We do NOT extend the reminder window or change the cron schedule. Copy-only task.

### Change Type

- [x] **Create new** — builder in `dm-copy.ts`
- [x] **Update existing** — 1 call site in `abandoned-booking-reminder.ts`

### Current State

- `backend/src/services/abandoned-booking-reminder.ts:59` — inline string.
- `buildBookingPageUrl(conversationId, doctorId)` — exported, used elsewhere; import and reuse.
- Cron schedule and eligibility logic — untouched.

### Scope Guard

- Expected files touched: 2 + tests.
- Do NOT gate the reminder on new conditions (e.g. only-send-if-link-was-actually-delivered). Existing logic already protects against spam via `bookingReminderSent`.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)

---

## Task Breakdown

### 1. Builder

- [x] 1.1 Implemented:
  ```ts
  export function buildAbandonedBookingReminderMessage(i: { bookingUrl: string }): string {
    return [
      'Just checking in — your booking link is still active.',
      '',
      'Pick a time here:',
      i.bookingUrl,
      '',
      'Reply here anytime if you need help.',
    ].join('\n');
  }
  ```
- [x] 1.2 Guard: `buildAbandonedBookingReminderMessage` throws when `bookingUrl` trims to empty — `abandoned-booking-reminder.ts` should never call with a missing URL, and `buildBookingPageUrl` itself always returns a non-empty string (falls back to `https://example.com/book` when `BOOKING_PAGE_URL` is unset), so a throw here surfaces an upstream config bug rather than shipping an empty-link reminder.

### 2. Wire

- [x] 2.1 `abandoned-booking-reminder.ts` — imported `buildBookingPageUrl` (from `./slot-selection-service`) and `buildAbandonedBookingReminderMessage` (from `../utils/dm-copy`).
- [x] 2.2 Replaced the inline `msg` at line 59 with:
  ```ts
  const bookingUrl = buildBookingPageUrl(row.id, row.doctor_id);
  const msg = buildAbandonedBookingReminderMessage({ bookingUrl });
  ```
- [x] 2.3 Every other branch (token lookup, `bookingReminderSent` marking, error counters, cron eligibility) left untouched.

### 3. Tests

- [x] 3.1 Snapshot committed: `abandoned-reminder / default (URL on its own line)` — snapshot suite now at 30 cases.
- [x] 3.2 Unit tests added (4): throws on empty `bookingUrl`; throws on whitespace-only `bookingUrl`; URL renders on its own line with blank line below and `Pick a time here:` label above; URL is trimmed before rendering.
- [x] 3.3 No existing test for `runAbandonedBookingReminderJob` (the service has no dedicated test file), so no assertion fix-ups needed. Grep for the old literal `"Just checking in — your booking link is still active if you'd like to complete it."` returns zero hits in `backend/src` + `backend/tests` after the swap.

### 4. Verification

- [x] 4.1 `tsc --noEmit` clean.
- [x] 4.2 Full unit suite green: **884 tests / 80 suites / 30 snapshots** (up from 879/80/29 post-Task-05, +5 tests, +1 snapshot). No regressions.
- [ ] 4.3 Staging: force a conversation into `awaiting_slot_selection` past the 1-hour cutoff (or lower `REMINDER_DELAY_MS` temporarily in dev) and trigger the cron; verify message shape. _(manual, deferred to staging rollout)_

---

## Files to Create/Update

```
backend/src/utils/dm-copy.ts                                   — UPDATED
backend/src/services/abandoned-booking-reminder.ts             — UPDATED (use buildBookingPageUrl + builder)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (1 snapshot + 1 unit test)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED
backend/tests/unit/services/abandoned-booking-reminder.test.ts — UPDATED (if a literal assertion exists)
```

---

## Design Constraints

- **URL on its own line** with a blank line above. No prefix markdown that could confuse Instagram's auto-linkifier.
- **Three paragraphs**: status, call-to-action + URL, help reply.
- **Don't phrase the URL as a markdown link** (`[Pick a time](url)`) — Instagram DMs don't render markdown links; the raw URL auto-linkifies more reliably.
- **No emoji** — reminders are a nudge, not a celebration.

---

## Global Safety Gate

- [x] **Data touched?** Read conversation + doctor; write `bookingReminderSent: true` — unchanged from pre-refactor.
- [x] **Any PHI in logs?** No new logging.
- [x] **External API or AI call?** Only the existing Instagram Send API call — unchanged.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `buildAbandonedBookingReminderMessage` exists in `dm-copy.ts` with throw guard on empty/whitespace URL.
- [x] `abandoned-booking-reminder.ts:59` inline string replaced; `buildBookingPageUrl` import + call added so the reminder URL is identical to the one originally sent.
- [x] Snapshot + 4 unit tests committed.
- [x] `tsc --noEmit` clean; full suite green (884 / 80 / 30).
- [ ] Staging manual verification: reminder DM now contains the tappable URL. _(manual step owned by rollout)_

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- [Task 08](./task-08-staff-review-resolved-url.md) — sibling; same "URL on own line" principle.

---

**Last Updated:** 2026-04-18  
**Pattern:** Actionable data on its own line — reminders carry their own link  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
