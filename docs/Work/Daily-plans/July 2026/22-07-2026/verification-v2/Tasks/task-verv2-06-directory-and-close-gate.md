# VERV2-06 — Directory funnel surface + close gate

> **Weight: Auto.** **Status: ✅ DONE eng / ⏳ dogfood + migrate** · depends on VERV2-01..05.
> Decision lock **VERV2-D6**.

## Goal

Make `changes_requested` visible in the doctors directory funnel, then run the verification gate and dogfood the full loop.

## Do — directory funnel (the one cross-touch into admin-console-v3)

- `backend/src/types/admin-doctor.ts`: add `changes_requested` to `ADMIN_DOCTOR_FUNNEL_STATUSES`.
- `backend/src/services/admin-doctors-service.ts`: in `deriveFunnelStatus`, map a `doctor_verification.status === 'changes_requested'` to the `changes_requested` funnel status (precedence alongside `pending_review` / `rejected`).
- `frontend/lib/api.ts`: add `changes_requested` to `AdminDoctorFunnelStatus`.
- `frontend/components/admin/doctors/DoctorFunnelBadge.tsx`: add label + variant so the mapping is exhaustive.
- Update the relevant `admin-doctors-service` unit test cases for the new derivation.

## Do — close gate

- Backend: `npm run typecheck` + lint + `npm test` (touched service/controller/migration tests green).
- Frontend: `npx tsc --noEmit` scoped-clean on touched files + `next lint`.
- **Dogfood** the loop:
  1. Submit as a test doctor → **Request changes** with a note.
  2. Confirm the doctor sees soft copy + note + form; re-submit → back to `pending_review`.
  3. **Approve** → verified.
  4. Confirm **Reject** still reads as the hard "declined."
  5. Confirm `changes_requested` shows in the list filter, badge, and `/admin/doctors` funnel.

## Scope guard

- Directory changes are limited to surfacing the new status (enum + derive + badge). Do NOT add new directory actions (that's the admin-console-v4 roadmap).

## Done when

- Funnel shows `changes_requested`; all checks green; dogfood loop passes. Mark the plan ✅ Complete + update any roadmap notes.
