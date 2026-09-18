# VERV2-02 — Types + service: `requestChangesVerification`

> **Weight: Opus** (writes the review lifecycle). **Status: ✅ DONE** · depends on **VERV2-01**.
> Decision locks **VERV2-D1, D2, D4**.

## Goal

Teach the backend the new status and add the service verdict that mirrors reject but writes `changes_requested`.

## Do

- `backend/src/types/doctor-verification.ts`:
  - Add `'changes_requested'` to `VERIFICATION_STATUSES` (after `rejected`).
  - No shape change to `DoctorVerificationStatusView` / `AdminVerificationDetail` — `rejectReason` continues to carry the reviewer note for both `rejected` and `changes_requested` (VERV2-D2). Update the doc comment on `reject_reason` / the view to say it doubles as the "changes requested" note.
- `backend/src/services/doctor-verification-service.ts`:
  - Add `requestChangesVerification(doctorId, note, reviewedBy, correlationId)` — a near-copy of `rejectVerification` that sets `status: 'changes_requested'`, stamps `reviewed_at` / `reviewed_by`, writes the trimmed `note` into `reject_reason`, and requires a non-empty note (`ValidationError` otherwise). Log event `verification_changes_requested` with `doctorId` + `correlationId` only — **never the note**.
  - Leave `submitVerification` as-is: it already resets to `pending_review` and clears the prior verdict, so a `changes_requested` doctor re-submitting loops back correctly.
  - **Do NOT touch** `isDoctorVerified` (must stay `=== 'verified'` so the gate keeps `changes_requested` blocked — VERV2-D4).

## Tests

- Extend `backend/tests/unit/services/doctor-verification-service.test.ts`:
  - `requestChangesVerification` writes status `changes_requested` + note + audit fields; throws `ValidationError` on empty note; `NotFoundError` when no row.
  - `isDoctorVerified` returns false for `changes_requested`.

## Scope guard

- No new column, no new endpoint here (that's VERV2-03), no gate changes.

## Done when

- Types compile, service fn + tests pass, `isDoctorVerified` behavior unchanged.
