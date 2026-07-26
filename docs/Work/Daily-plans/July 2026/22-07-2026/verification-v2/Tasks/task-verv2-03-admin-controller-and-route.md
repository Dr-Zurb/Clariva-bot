# VERV2-03 — Admin controller + route: request-changes endpoint

> **Weight: Opus** (admin write on the review lifecycle). **Status: ✅ DONE** · depends on **VERV2-02**.
> Decision lock **VERV2-D3**.

## Goal

Expose the request-changes verdict over the existing admin surface.

## Do

- `backend/src/controllers/admin-verification-controller.ts`:
  - Add `requestChangesVerificationHandler` mirroring `rejectVerificationHandler`, but call `requestChangesVerification`. Validate a required `note` (reuse the reject body schema shape: `note: z.string().trim().min(1,'A note is required').max(500)` + optional legacy `reviewedBy`). Use `req.adminActor ?? reviewedBy ?? 'ops'` for the actor. Respond `{ doctorId, status: 'changes_requested' }`. No try/catch (asyncHandler).
- `backend/src/routes/api/v1/admin-verifications.ts`:
  - Add `POST /:doctorId/request-changes` under the existing `requireAdminJwtOrSecret` guard, next to `approve` / `reject`.

## Tests

- Extend `backend/tests/unit/controllers/*` (the admin-verification controller test, mirroring the reject test):
  - happy path calls the service with the note + actor and returns `changes_requested`;
  - empty note → `ValidationError` (ZodError → 400 via global mapper).

## Scope guard

- Orchestration only (validate → service → respond). No DB access in the controller. Do NOT change the approve/reject handlers beyond adding the sibling.

## Done when

- Endpoint validates + routes correctly under the admin guard; controller tests pass.
