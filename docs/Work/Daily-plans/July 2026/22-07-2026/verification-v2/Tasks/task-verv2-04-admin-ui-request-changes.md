# VERV2-04 — Admin UI: 3-way verdict (Request changes)

> **Weight: Auto.** **Status: ✅ DONE** · depends on **VERV2-03**.
> Decision locks **VERV2-D3, D6**.

## Goal

Turn the admin review from Approve/Reject into **Approve / Request changes / Reject** on both the list row and the detail page, and surface the new status in filters + badge.

## Do

- `frontend/lib/api.ts`:
  - Add `changes_requested` to the `VerificationStatus` union + `AdminVerificationListStatus`.
  - Add `requestChangesAdminVerification(token, doctorId, note)` → `POST /api/v1/admin/verifications/:doctorId/request-changes`.
- `frontend/components/admin/verifications/VerificationRow.tsx` (list row):
  - Add a **Request changes** button (between Approve and Reject) that opens a note dialog. Reuse the existing reject-dialog pattern; give it its own presets (e.g. "Certificate is blurry — please re-upload a clearer photo/PDF.", "Government ID is missing or unreadable.", "Name/registration number doesn't match — please re-upload the correct certificate."). Confirm → `requestChangesAdminVerification` → invalidate `queryKeys.admin.all`.
  - Keep Approve/Reject as-is. `canAct` currently = `status === 'pending_review'`; also allow acting when `status === 'changes_requested'` if useful (optional — default: act on `pending_review`).
- `frontend/components/admin/verifications/VerificationDetailClient.tsx`:
  - Mirror the 3rd action on the detail page.
- `frontend/components/admin/verifications/VerificationsListClient.tsx`:
  - Add a **"Changes requested"** filter tab.
- `frontend/components/admin/verifications/statusBadge.tsx`:
  - Add the `changes_requested` label ("Changes requested") + a variant (e.g. `warning` or a distinct one) so `LABELS` stays exhaustive over the union.

## Scope guard

- Reuse the note-dialog + preset pattern already in `VerificationRow`. Do NOT duplicate the doc-preview logic. No backend changes here.

## Done when

- Reviewer can Request changes with a note from the list row + detail; the new filter tab + badge render; typecheck + lint clean on touched files.
