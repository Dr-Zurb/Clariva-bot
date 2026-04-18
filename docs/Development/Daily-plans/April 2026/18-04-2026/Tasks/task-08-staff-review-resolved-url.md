# Task 08: Staff-review resolved booking DM — URL layout
## 18 April 2026 — Plan "Patient DM copy polish", P2

---

## Task Overview

`formatStaffReviewResolvedContinueBookingDm` in `backend/src/utils/staff-service-review-dm.ts` (lines 52–70) sends:

```
**Dr Zurb's Clinic** has confirmed your visit type: **General consultation**. You can **pick a time and complete booking** here — tap to open: https://example.app/book/…

If something looks wrong, just reply here in this chat.
```

Problems (from 2026-04-17 audit):
1. The URL hugs the end of a sentence (`tap to open: https://…`). On Instagram DM iOS renderers this sometimes makes the URL tap target unreliable because part of the trailing text gets joined to the link region.
2. The call-to-action verb (`pick a time and complete booking`) is bold but the link is buried — the patient's eye lands on bold text, not on the actionable URL.

Fix: put the URL on its own line after a blank line, with a short labeled CTA sentence immediately above it.

**Target shape (confirmed):**

```
**Dr Zurb's Clinic** has confirmed your visit type: **General consultation**.

Pick a time and complete your booking here:
{bookingUrl}

If something looks wrong, just reply here in this chat.
```

**Target shape (reassigned):**

```
**Dr Zurb's Clinic** has updated your visit type to **Cardiology consultation**.

Pick a time and complete your booking here:
{bookingUrl}

If something looks wrong, just reply here in this chat.
```

**Target shape (learning-policy autobook):**

```
**Dr Zurb's Clinic** has applied your saved visit-type preference: **General consultation**.

Pick a time and complete your booking here:
{bookingUrl}

If something looks wrong, just reply here in this chat.
```

**Estimated Time:** 1 hour  
**Status:** Done (2026-04-18)  
**Depends on:** [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)  
**Plan:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)

### Implementation Plan (high level)

1. Either:
   - (Preferred) Move `formatStaffReviewResolvedContinueBookingDm` into `dm-copy.ts` and re-export from `staff-service-review-dm.ts` for backward compat; OR
   - Keep it in place and just restructure the returned string.
2. Restructure the return:
   - Paragraph 1: intro sentence (unchanged wording).
   - Paragraph 2: "Pick a time and complete your booking here:" on one line, URL on the next line.
   - Paragraph 3: "If something looks wrong, just reply here in this chat."
3. Snapshot all three `kind` variants × optional `practice_name` absent fallback.

**Scope trade-offs:**
- We do NOT rewrite the intro sentence for each `kind`. Keep current language, only re-layout.
- We do NOT add a "payment required at booking" disclaimer — some doctors have free visits, and the slot-picker page handles payment visibility.
- No emoji.
- Companion sibling messages in the same file (`formatAwaitingStaffServiceConfirmationDm`, `formatStaffServiceReviewStillPendingDm`) are **out of scope** for this task. They don't have URL-hugging issues today. If they become a copy problem later, add a follow-up task.

### Change Type

- [x] **Update existing** — 1 function in `staff-service-review-dm.ts`

### Current State

- `backend/src/utils/staff-service-review-dm.ts` — three helpers, all well-scoped; only `formatStaffReviewResolvedContinueBookingDm` is touched.
- Callers in `service-staff-review-service.ts:431+` and `service-match-learning-autobook.ts:162+` pass `bookingUrl` — unchanged.

### Scope Guard

- Expected files touched: 1 + tests.
- Do NOT touch the two sibling helpers in the same file.

### Reference Documentation

- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md)

---

## Task Breakdown

### 1. Restructure

- [x] 1.1 Rewrote the rendering as `buildStaffReviewResolvedBookingMessage` in `dm-copy.ts`:
  ```ts
  return [
    intro,
    '',
    'Pick a time and complete your booking here:',
    url,
    '',
    'If something looks wrong, just reply here in this chat.',
  ].join('\n');
  ```
- [x] 1.2 Intro construction unchanged — `resolveStaffReviewIntro` preserves the three kind branches (`confirmed` / `reassigned` / `learning_policy_autobook`) with the same first-sentence wording.
- [x] 1.3 Dropped the legacy `" You can **pick a time and complete booking** here — tap to open: {bookingUrl}"` suffix.

### 2. (Optional) Relocate to `dm-copy.ts`

- [x] 2.1 Done — rendering moved to `dm-copy.ts` (`buildStaffReviewResolvedBookingMessage` + `StaffReviewResolvedKind`). `formatStaffReviewResolvedContinueBookingDm` in `staff-service-review-dm.ts` is now a thin delegator so the ARM-05 call sites (`service-staff-review-service.ts`, `service-match-learning-autobook.ts`) don't need to import `dm-copy` directly.

### 3. Tests

- [x] 3.1 Added 5 snapshots to `backend/tests/unit/utils/dm-copy.snap.test.ts`:
  - `staff-review-resolved / confirmed / practice + label present`
  - `staff-review-resolved / reassigned / practice + label present`
  - `staff-review-resolved / learning_policy_autobook / practice + label present`
  - `staff-review-resolved / confirmed / practice missing → "the clinic"`
  - `staff-review-resolved / confirmed / visit label empty → "your visit"`
- [x] 3.2 Existing tests in `staff-service-review-dm.test.ts` and `staff-service-review-dm-autobook.test.ts` only asserted on substrings (practice name, visit label, URL, `updated`, `confirm`, `saved visit-type preference`) — all still pass against the new three-paragraph layout, no updates required.

Additional invariants (6 unit tests in a new `buildStaffReviewResolvedBookingMessage invariants` describe block):
  - Throws on empty / whitespace `bookingUrl` (symmetrical with `buildAbandonedBookingReminderMessage`).
  - URL sits on its own line immediately below `"Pick a time and complete your booking here:"` with a blank line after — verified for all three `kind` values.
  - `practiceName` missing / empty / whitespace → `"**the clinic**"` fallback; all three inputs produce identical output.
  - `visitLabel` missing / empty / whitespace → `"**your visit**"` fallback.
  - Each `kind` produces a distinct intro phrasing (`confirmed` / `updated` / `applied your saved visit-type preference`).
  - Closing paragraph is `"If something looks wrong, just reply here in this chat."`; legacy copy (`"tap to open"`, `"pick a time and complete booking"`) no longer present.

### 4. Verification

- [x] 4.1 `tsc --noEmit` clean.
- [x] 4.2 Full suite green — `tests/unit` = **908 tests / 80 suites / 39 snapshots** (baseline 897/80/34 after Task 07; +11 tests, +5 snapshots).
- [ ] 4.3 Staging manual verification of one `kind` — pending next staging deploy.

---

## Files to Create/Update

```
backend/src/utils/staff-service-review-dm.ts                   — UPDATED (restructured return)
backend/src/utils/dm-copy.ts                                   — UPDATED (optional — if relocating the helper)
backend/tests/unit/utils/staff-service-review-dm.test.ts       — UPDATED (if exists)
backend/tests/unit/utils/dm-copy.snap.test.ts                  — UPDATED (5 snapshots)
backend/tests/unit/utils/__snapshots__/dm-copy.snap.test.ts.snap — UPDATED
```

---

## Design Constraints

- **URL alone on its own line.** No prefix characters; no trailing punctuation on the URL line.
- **Preserve the three `kind` variants** — don't fold them into one copy.
- **Practice-name fallback stays `the clinic`** — matches existing `formatAwaitingStaffServiceConfirmationDm` behavior.
- **Visit-label fallback stays `your visit`** — same reason.
- **No emoji.**

---

## Global Safety Gate

- [x] **Data touched?** Read-only — the caller already has settings + bookingUrl; no new DB reads/writes.
- [x] **Any PHI in logs?** No new logging.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** None.

---

## Acceptance & Verification Criteria

- [x] `formatStaffReviewResolvedContinueBookingDm` returns the new three-paragraph shape for all three `kind` variants (verified by 3 `kind`-specific snapshots + `each kind produces a distinct intro phrasing` invariant).
- [x] URL appears on its own line after a blank line (verified by `renders the URL on its own line` invariant across all three kinds).
- [x] 5 snapshot cases committed (3 kinds × practice+label present, practice missing fallback, visit-label empty fallback).
- [x] `tsc --noEmit` clean; full suite green (908 unit tests / 80 suites / 39 snapshots).
- [ ] Staging manual verification of at least one `kind` — pending next staging deploy.

---

## Related Tasks

- [Task 01](./task-01-dm-copy-helper-and-golden-snapshots.md) — prerequisite.
- [Task 06](./task-06-abandoned-reminder-url.md) — same "URL on own line" principle.

---

**Last Updated:** 2026-04-18  
**Pattern:** URL hoisted to its own line for reliable tap targets  
**Reference:** [Plan — Patient DM copy polish](../plan-patient-dm-copy-polish.md)
