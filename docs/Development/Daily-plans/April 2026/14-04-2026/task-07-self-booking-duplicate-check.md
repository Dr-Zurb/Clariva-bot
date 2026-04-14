# Task B5: Self-Booking Patient Duplicate Check
## 2026-04-14 — Sprint 2

---

## Task Overview

Run the same patient duplicate/match check for self-bookings that currently only runs for book-for-someone-else. During `confirm_details`, if the collected details match an existing patient record, ask "Is this you?" before creating a new patient.

**Estimated Time:** 2.5 hours
**Status:** DONE
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- `instagram-dm-webhook-handler.ts` ~2654–2688: `findPossiblePatientMatches` is only called when `state.bookingForSomeoneElse === true`
- Self-booking confirm path goes directly to consent → slot link, skipping duplicate detection
- `findPossiblePatientMatches` and match UI (numbered list, yes/no) already exist and work for book-for-others
- Patient match flow: `awaiting_match_confirmation` step with `parseMatchConfirmationReply`

**What's missing:**
- Calling `findPossiblePatientMatches` for self-booking at `confirm_details`
- Routing to `awaiting_match_confirmation` when matches found

**Scope Guard:**
- Expected files touched: 1–2
- `instagram-dm-webhook-handler.ts`, possibly `patient-matching-service.ts`

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § B5
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 14

---

## Task Breakdown

### 1. Extend confirm_details to run match check for self-booking
- [x] 1.1 In the `confirm_details` path (after user confirms details are correct), add a call to `findPossiblePatientMatches` regardless of `bookingForSomeoneElse`
- [x] 1.2 If matches found → present "Is this you?" UI (same as book-for-others)
- [x] 1.3 If no matches → proceed to consent / slot link as before
- [x] 1.4 Ensure the existing match confirmation handler (`awaiting_match_confirmation`) works for self-booking context too

### 2. Handle match response for self-booking
- [x] 2.1 "Yes" → use existing patient record (link conversation to that patient)
- [x] 2.2 "No" → create new patient as before
- [x] 2.3 After match resolution → continue to consent / slot link

### 3. Edge cases
- [x] 3.1 Patient is booking via Instagram for the first time (no existing records) → no matches, flow unchanged
- [x] 3.2 Returning patient with MRN → match found, reuse record (MRN preserved)
- [x] 3.3 Multiple potential matches → numbered list (same UI as book-for-others)

### 4. Verification
- [x] 4.1 `tsc --noEmit` passes
- [x] 4.2 Manual test: self-book with existing patient's details → "Is this you?" prompt
- [x] 4.3 Manual test: self-book with new details → straight to consent/slot
- [x] 4.4 Regression: book-for-others flow unchanged

---

## Files to Create/Update

- `instagram-dm-webhook-handler.ts` — MODIFY (add match check to self-booking confirm path)

---

## Design Constraints

- Must not break existing book-for-others match flow
- Match check should use the same `findPossiblePatientMatches` service (DRY)
- MRN from existing patients must be preserved when matched
- Match prompts are English-only for now (covered by A7 later)

---

## Global Safety Gate

- [x] **Data touched?** Yes — reading patient records for matching
  - [x] **RLS verified?** Must use admin client or service-role for cross-patient search
- [x] **Any PHI in logs?** No (match IDs only, not names/details)
- [x] **External API or AI call?** No
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Self-booking with matching details → "Is this you?" prompt
- [x] Self-booking with no matches → direct to consent/slot (unchanged)
- [x] Match "Yes" → existing patient record used
- [x] Match "No" → new patient created
- [x] Book-for-others flow unaffected

---

**Last Updated:** 2026-04-14
