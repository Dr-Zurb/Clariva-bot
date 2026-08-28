# VERV2-05 — Doctor-facing: `changes_requested` experience

> **Weight: Auto.** **Status: ✅ DONE** · depends on **VERV2-02** (status value) — can land alongside VERV2-04.
> Decision lock **VERV2-D5**.

## Goal

Show the doctor a **soft** "quick update needed" experience for `changes_requested` — distinct from the harsher `rejected` copy — that reuses the existing re-submit form.

## Do

- `frontend/lib/api.ts`: ensure the frontend `VerificationStatus` union includes `changes_requested` (shared with VERV2-04 — do it once).
- `frontend/components/dashboard/verification/GetVerifiedClient.tsx`:
  - Extend the "show the form" branch (currently `unverified | rejected`) to also include `changes_requested`.
  - Add a distinct notice for `changes_requested` (softer than the rejected block): friendly heading (e.g. "A quick update to your documents"), show `data.rejectReason` (the reviewer note), and "Update the details below and re-submit." Use a softer icon/color than the destructive reject block (e.g. amber, `Clock`/`FileWarning`), not `ShieldAlert`.
- `frontend/components/dashboard/verification/VerificationBanner.tsx`:
  - Add a `changes_requested` case (soft/amber) linking to `/dashboard/get-verified`, distinct from the `rejected` "needs attention" wording.

## Scope guard

- Reuse the existing form + submit path (submitting returns them to `pending_review` — no new logic). Do NOT change the upload flow or the `rejected` copy.

## Done when

- A `changes_requested` doctor sees soft copy + the reviewer note + the re-submit form; re-submitting flips them to `pending_review`. Typecheck + lint clean.
