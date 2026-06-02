# rcp-22 · Skip re-collection for a known, consented returning patient

> **Phase 5, step 3** of [receptionist-rearchitecture](../plan-p5-receptionist-returning-memory-batch.md) · follows the **[returning-memory playbook](./EXECUTION-ORDER-p5-receptionist-returning-memory.md#returning-memory-playbook-shared-recipe--every-consumer-task-follows-this)**. The core "skip re-collection" win — and the riskiest slice, because it touches the **booking funnel entry**. Generalize the short-circuit that already exists for one branch so a returning, consented patient never re-types their name/phone/age/gender.

| **Size** | L | **Model** | **Auto** | **Wave** | 5 | **Depends on** | rcp-20 | **Blocks** | rcp-24 | **Status** | done |

---

## Why this slice

The skip **already exists** — but only on one path. `book_responded` (`booking-entry.ts:431`–`:536`) computes `hasPatientReady = patient.name && patient.phone && consent_status === 'granted'` and, if ready, jumps straight to the booking link (`awaiting_slot_selection`) with **no collection**. But the **first** book message in a fresh conversation goes through `justStartingCollection` (the `booking_start_ai` branch, `booking-entry.ts:347`–`:410`), which **always** calls `getInitialCollectionStep()` and re-asks everything. A returning patient who DMs "I'd like to book" gets interrogated as a stranger. This task closes that gap.

## What to do

Per the playbook — reuse the proven `hasPatientReady` pattern, don't invent a new one:

- **Generalize the short-circuit to `justStartingCollection`.** In `booking-entry.ts:347`–`:410`, before falling into `getInitialCollectionStep()`, check: `RETURNING_PATIENT_MEMORY_ENABLED` **and** `ctx.returningProfile?.isReturning` **and** `hasGrantedConsent` **and** the patient row has real `name` + `phone` (mirror the existing `hasPatientReady` check at `:434`–`:437`). If so, take the **same** ready path the `book_responded` branch already uses (`:503`–`:536`): staff-review gate (`isSlotBookingBlockedPendingStaffReview`) → else booking link + `awaiting_slot_selection`.
- **Hydrate field *names* only.** Seed `state.collectedFields` from `profile.knownFieldKeys` so downstream "already collected, don't ask again" logic (and `buildAiContextForResponse` `:168`–`:177`) knows demographics are on file. **Values stay in the `patients` row** — never write name/phone into Redis pre-consent or `conversations.metadata`.
- **Still collect the appointment-specific reason.** A returning patient may have a **new** complaint. Keep `reason_for_visit` collection and reason-first triage exactly as today (`seedCollectedReasonFromStateIfValid`, `bookingShouldDeferToReasonFirstTriage`). The skip is for **demographics**, not the visit reason.
- **(Optional) light re-confirm.** If product wants a stale-data guard, a one-line "Still booking as **<name>**, **<phone>**? Send updates if anything changed" before the link — reusing the existing confirm copy, not a new collection step. Keep it behind the flag.

## Acceptance gate

- [x] Flag on + returning + consented + book intent on a **fresh** turn ⇒ no name/phone/age/gender re-collection; routes to the booking link (or staff-review gate), still collecting `reason_for_visit`.
- [x] New golden fixtures: `returning-book-skip-collection.json` (skips demographics, asks reason) and `returning-book-reason-known.json` (reason already in state ⇒ straight to slot link). New-patient collection fixtures (`fee-mid-collection.json`, book-start corpus) **byte-identical**.
- [x] `webhook-worker-characterization`: new-patient collection unchanged; added returning-skip scenario asserts single persist/turn and no PHI in metadata.
- [x] **Book-for-someone-else** (`bookingForOther`) is **not** short-circuited by the self-profile (still collects the other person's details). `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't skip `reason_for_visit` or reason-first triage — visit reason is per-appointment, not memory.
- ❌ Don't skip the **consent** flow for a patient whose `consent_status !== 'granted'` (and never for a revoked one).
- ❌ Don't hijack the **book-for-other** path — that intentionally creates a separate `patients` row (`createPatientForBooking`); the self returning-profile must not pre-fill someone else's booking.
- ❌ Don't write PHI values into metadata/Redis during hydration — `collectedFields` is **names only**; values come from the `patients` row at booking time.
- ❌ Don't bypass `isSlotBookingBlockedPendingStaffReview` — returning patients hit the same staff-review gate.

## Risks

- **Stale demographics.** Phone/name may have changed since the last visit. The optional re-confirm mitigates; at minimum, the booking page still shows/edits details before payment. Don't silently book on stale data without a path to correct it.
- **Two ready-paths drifting.** `book_responded` (`:503`–`:536`) and the new `justStartingCollection` skip should share **one** helper, not two copies — extract the ready-path so future copy/gate changes stay in sync.
- **Placeholder false-positive.** Guard against a `Placeholder` name / synthetic phone slipping through as "ready" (rcp-20's `hasName`/`hasPhone` already exclude placeholders — re-assert here).
- **Reason-first interaction.** Returning + fee/clinical-led thread must still defer to reason-first triage (`bookingShouldDeferToReasonFirstTriage`) before the link — pin a fixture where a returning patient leads with symptoms, not "book."
