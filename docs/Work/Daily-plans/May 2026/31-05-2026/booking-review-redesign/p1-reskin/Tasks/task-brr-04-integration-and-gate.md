# brr-04 — Integration + behaviour-parity gate + tests

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 1 — reskin + SLA](../plan-p1-booking-review-redesign-batch.md) |
| **Wave** | 3 (Lane A — last) |
| **Depends on** | brr-01, brr-02, brr-03 |
| **Blocks** | — (closes Phase 1) |
| **Size** | **S–M** |
| **Model** | **Auto** (optional light review of action-call parity) |
| **Decision locks** | BR-DL-2, BR-DL-5, BR-DL-7, P1-BRR-3 |

---

## Objective

Close Phase 1: prove the reskin is **behaviour-identical** to the pre-reskin inbox, verify the cross-cutting gate, and land the targeted tests. This task writes little new product code — it is the parity + quality checkpoint.

- **Action-call parity** — Confirm / Reassign / Cancel fire the same API calls with the same payloads as before the reskin (especially the reassign teaching payload), and the **409 "already resolved → refetch"** branch still works (BR-DL-2 / BR-DL-7).
- **PHI no-log check** — no patient/reason text was added to `console`, analytics, or telemetry anywhere in the reskinned paths (BR-DL-5).
- **Visual parity** — reviewed at 1366 / 1920 px; the existing `overflow-x-auto` mobile behaviour is unchanged (mobile cards are Phase 3, P1-BRR-3).
- **Tests green** — `ConfidenceBadge` mapping (brr-01), SLA threshold/overdue + ago (brr-03), and a pending-sort assertion.
- **Inbox line** — record what shipped + deferred items.

## Why this task

A reskin's one real danger is silently changing an outcome — sending the wrong booking link, dropping the teaching payload, or breaking the 409 recovery. A dedicated parity gate (separate from the build tasks) is cheap insurance and gives a clean close-checkpoint for the phase, matching how the cockpit batches close (a dedicated integration/gate task rather than folding it into the last build task).

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/__tests__/ServiceReviewsInbox.test.tsx` | **New (or extend)** — render pending rows; assert: Confirm calls `postConfirmServiceStaffReview` with the same args; a mocked 409 triggers a refetch + the "already resolved" banner; pending rows render the SLA chip; pending order is soonest-first. Mock `@/lib/api`. |
| `docs/Work/capture/inbox.md` | **Edit** — one line: Phase 1 (reskin + SLA) shipped; deferred = `BookingReviewInbox` rename (BR-Q5), multi-tab counts (P1-BRR-4), mobile cards / drawer / optimistic / filters / keyboard (Phases 2–3). |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit only if parity gaps found** — fix any reskin-introduced behaviour drift; otherwise untouched here. |

## Verification checklist (the parity gate)

Run these against the reskinned component:

- [x] **Confirm** → network shows the same `POST` to the confirm endpoint with the same body `{}`; success banner copy intent unchanged; list refetches.
- [x] **Reassign** → same `POST` with the **same payload**, including `catalogServiceKey`, `catalogServiceId`, `consultationModality`, and the teaching appends (`correctServiceHintAppend.include_when` / `wrongServiceHintAppend.exclude_when`) for: (a) same-as-proposed service, (b) different service, (c) Skip-teaching on. Diff against a pre-reskin capture.
- [x] **Cancel** → same `POST` with optional `{ note }`; "no booking link sent" copy intent unchanged.
- [x] **409** on any action → "already resolved" banner + refetch (mock the API to reject with `{ status: 409 }`).
- [x] **Tabs** → switching loads the right status; the out-of-order guard (`loadGenRef`) still prevents stale overwrites.
- [x] **PHI** → `rg "console\\.(log|error|warn)"` in the component shows nothing logging patient/reason text; no new analytics/telemetry call carries PHI.
- [x] **Visual** → 1366 / 1920 px parity screenshot review; mobile `overflow-x-auto` unchanged.

## Tests (`ServiceReviewsInbox.test.tsx`)

- [x] Confirm fires `postConfirmServiceStaffReview(token, id, {})` (args asserted via mock).
- [x] Mocked 409 on confirm → "already resolved" banner shown + `getServiceStaffReviews` re-called.
- [x] Pending rows render an SLA chip (or queued-age fallback when deadline null).
- [x] Pending rows render soonest-deadline-first given an out-of-order fixture.

> Mock `@/lib/api` (the four functions) and pass fixture `initialReviews` + a minimal `settings.service_offerings_json`. Follow the existing frontend test patterns; run targeted (`*.test.tsx`) — avoid the full suite if it hangs on unrelated pre-existing issues.

## Acceptance criteria

- [x] All parity-gate checks above pass; any drift found is fixed and re-verified.
- [x] `ServiceReviewsInbox.test.tsx` + `ConfidenceBadge.test.tsx` + `relative-time.test.ts` green.
- [x] `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean (warnings ok).
- [x] No backend / `page.tsx` / `staff-review-match-explain.ts` edits across the whole batch.
- [x] `docs/Work/capture/inbox.md` line added.
- [x] The batch [cross-cutting acceptance gate](../plan-p1-booking-review-redesign-batch.md) is fully green.

## Out of scope (explicit)

- Any Phase 2/3 feature. This task only proves Phase 1 parity + quality.
- A full e2e harness — targeted component tests + manual network diff suffice for a frontend-only reskin.

## Decision log

- **Parity verified by network diff, not just snapshots:** the patient-facing risk is the *call*, not the pixels; asserting the API args is the meaningful check (BR-R1).
- **Dedicated gate task:** mirrors the cockpit batches' close pattern; keeps the build tasks focused and gives one green checkpoint to promote Phase 2.

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — `runAction` + 409 branch (~144–178); action handlers + okMessages (~180–189).
- [`frontend/lib/api.ts`](../../../../../../frontend/lib/api.ts) — `getServiceStaffReviews`, `postConfirmServiceStaffReview`, `postReassignServiceStaffReview`, `postCancelServiceStaffReview` (mock targets).
- [`docs/Work/capture/inbox.md`](../../../../../../docs/Work/capture/inbox.md) — the capture line lands here.
- Batch: [`plan-p1-booking-review-redesign-batch.md`](../plan-p1-booking-review-redesign-batch.md) · Order: [`EXECUTION-ORDER-p1-booking-review-redesign.md`](./EXECUTION-ORDER-p1-booking-review-redesign.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; batch gate green; status stamped here.
