# EXECUTION ORDER — verification-v2

> **Status: ✅ Complete eng / ⏳ dogfood + apply migration 185**
> Read [`../plan-verification-v2-batch.md`](../plan-verification-v2-batch.md) first. **Weight: Opus** (migration + review lifecycle + go-live-adjacent). Do the tasks in order — later tasks depend on the status value + service fn existing.

## Dependencies

- **Depends on:** `doctor-verification-v1` (lifecycle + review path), `admin-console-v1..v3` (admin guard, `/admin/verifications` list + detail, doctors directory funnel), and the 2026-07-22 Auto polish (icon columns + reject presets on the list).
- **Blocks:** nothing hard. Complements a future verdict-notification batch (backlog).

## Order

1. **VERV2-01 — Migration** (`185_doctor_verification_changes_requested.sql`)
   - Widen the status CHECK to include `changes_requested`; update table + lifecycle comment. Idempotent (DROP CONSTRAINT IF EXISTS + ADD), documented reverse. Migration unit test mirroring `183`.
   - ⚠️ Apply the migration before running the backend against it.

2. **VERV2-02 — Types + service**
   - Add `changes_requested` to `VERIFICATION_STATUSES`. Add `requestChangesVerification()` (mirror `rejectVerification`, status=`changes_requested`, reuse `reject_reason`). Confirm `isDoctorVerified` still `=== 'verified'`. Unit tests.

3. **VERV2-03 — Admin controller + route**
   - `requestChangesVerificationHandler` + `POST /admin/verifications/:doctorId/request-changes` (required `note`, reuse reject body schema shape). Wire under `requireAdminJwtOrSecret`. Unit tests.

4. **VERV2-04 — Admin UI**
   - API client `requestChangesAdminVerification`. Add the 3rd action ("Request changes") to `VerificationRow` (list) + `VerificationDetailClient` (detail) with note presets. Add "Changes requested" filter tab + `VerificationStatusBadge` variant + label.

5. **VERV2-05 — Doctor-facing**
   - Add the `changes_requested` branch to `GetVerifiedClient` + `VerificationBanner` (soft copy + icon, shows the note, shows the form). Extend the frontend `VerificationStatus` union.

6. **VERV2-06 — Directory funnel + close gate**
   - Add `changes_requested` to the doctors-directory funnel enum + `deriveFunnelStatus` + `DoctorFunnelBadge`. Then the close gate: typecheck + lint + tests + dogfood the full loop.

## Close-gate dogfood (VERV2-06)

- Submit as a test doctor → **Request changes** with a note → confirm the doctor sees soft copy + note + form → re-submit → confirm back to `pending_review` → **Approve**.
- Confirm **Reject** still works and still reads as the hard "declined."
- Confirm `changes_requested` shows in the list filter, the badge, and the `/admin/doctors` funnel.
