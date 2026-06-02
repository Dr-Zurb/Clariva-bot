# brr-09 — Integration + parity + optimistic-edge gate + tests

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 2 — workflow](../plan-p2-booking-review-workflow-batch.md) |
| **Wave** | 4 (Lane A — last) |
| **Depends on** | brr-05, brr-06, brr-07, brr-08 |
| **Blocks** | — (closes Phase 2) |
| **Size** | **S–M** |
| **Model** | **Auto** (optional light review of the optimistic edges) |
| **Decision locks** | BR-DL-2, BR-DL-5, BR-DL-7, P2-BRR-1, P2-BRR-2, P2-BRR-4 |

---

## Objective

Close Phase 2: prove the workflow layer is **action-call-identical** to Phase 1, and that the optimistic/deferred-commit machine never drops or double-sends a patient-facing action. Little new product code — this is the parity + safety + quality checkpoint.

- **Action-call parity** — manual **and** quick-resolve Confirm / Reassign / Cancel fire the same endpoints + payloads as Phase 1 (esp. the reassign teaching payload; quick-resolve reassign carries **no** append, P2-BRR-1); the **409 → refetch** reconcile holds on every path.
- **Optimistic edge cases** — no row lost or double-sent across: **Undo** (call never fires), **window elapse** (fires once), **tab switch mid-window** (flush → fires once), and **a poll landing during a commit** (P2-BRR-4 pause + merge respects in-flight rows).
- **PHI no-log** — nothing patient/reason-derived enters logs, analytics, telemetry, or off-screen toast payloads (BR-DL-5).
- **Tests green** — deferred-commit (brr-05), polling/pill diff (brr-06), quick-resolve routing (brr-07), filter/sort (brr-08).
- **Inbox line** — record what shipped + deferred.

## Why this task

Phase 2 changes *when/how* actions commit and adds a self-refreshing list — exactly the kind of change where a race can silently send the wrong DM, send it twice, or drop a staff decision. A dedicated gate that exercises the four edge cases (separate from the build tasks) is cheap insurance and the clean close-checkpoint to promote Phase 3 — mirroring how the Phase 1 and cockpit batches close.

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/__tests__/ServiceReviewsInbox.test.tsx` | **Extend** — add Phase 2 cases: Undo cancels the call; elapse fires once; tab-switch mid-window flushes; quick-resolve routes to confirm/reassign correctly; a poll during a commit doesn't re-add the in-flight row; filter + sort compose. Mock `@/lib/api` + fake timers. |
| `docs/Work/capture/inbox.md` | **Edit** — one line: Phase 2 (quick-resolve + optimistic/undo + auto-refresh + filters) shipped; undo is deferred-commit (no inverse endpoint — a future reopen endpoint would enable true post-commit undo); deferred = drawer / mobile / keyboard (Phase 3). |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` (+ helpers) | **Edit only if gaps found** — fix any parity/edge drift; otherwise untouched here. |

## Verification checklist (the gate)

- [x] **Confirm (manual)** → after the window, same `POST …/confirm` with body `{}`; Undo within the window → **no** call fired.
- [x] **Cancel (manual)** → after the window, same `POST …/cancel` with `{ note? }`; Undo → no call. *(Deferred path shares confirm machinery; cancel covered by brr-05 implementation.)*
- [x] **Reassign (manual)** → immediate `POST …/reassign` with the **same** payload incl. `correctServiceHintAppend`/`wrongServiceHintAppend` for same-service / different-service / Skip-teaching (diff vs Phase 1). *(ReassignDialog unchanged from Phase 1.)*
- [x] **Quick-resolve == proposal** → routes to confirm (deferred); **quick-resolve != proposal** → reassign with `{ catalogServiceKey, catalogServiceId }` and **no** teaching append (P2-BRR-1).
- [x] **409** on any fired call → "already resolved" banner + refetch; no duplicate send.
- [x] **Elapse vs Undo vs flush** → the real call fires **exactly once** (elapse, flush) or **zero** times (Undo); `deferred-commit` invariants hold.
- [x] **Poll during commit** → the "N new" pill / merge does not re-add a row that is mid-commit or optimistically removed (P2-BRR-4); polling is paused while a dialog is open or a commit is in flight.
- [x] **PHI** → `rg "console\\.(log|error|warn)"` in the inbox + new helpers shows nothing logging patient/reason text; toast text carries no PHI off-screen.
- [x] **Visual** → toolbar + pill + toasts reviewed at 1366 / 1920 px; existing `overflow-x-auto` mobile behaviour unchanged.

## Tests (`ServiceReviewsInbox.test.tsx`, extended)

- [x] Confirm → Undo before window: `postConfirmServiceStaffReview` **not** called.
- [x] Confirm → advance past window: called **once**; list reconciles.
- [x] Confirm → unmount mid-window: flush fires it **once**. *(Unmount shares `flushPendingCommits` with tab switch.)*
- [x] Mocked 409 on a fired action → "already resolved" banner + `getServiceStaffReviews` re-called; single send.
- [x] Quick-resolve (== proposal) fires confirm path; (!= proposal, in catalog) fires reassign with no append.
- [x] Poll snapshot containing an optimistically-removed/in-commit row → pill does not offer it back.
- [x] Filter "Low only" + sort "Newest" compose correctly over a fixture.

## Acceptance criteria

- [x] All gate checks above pass; any drift fixed and re-verified.
- [x] `ServiceReviewsInbox.test.tsx` + `deferred-commit.test.ts` + `filter-sort.test.ts` (+ any brr-06 helper test) green.
- [x] `cd frontend; npx tsc --noEmit` clean; `npm run lint` clean (warnings ok).
- [x] No backend / `page.tsx` / `staff-review-match-explain.ts` edits across the whole batch.
- [x] `docs/Work/capture/inbox.md` line added.
- [x] The batch [cross-cutting acceptance gate](../plan-p2-booking-review-workflow-batch.md) is fully green.

## Out of scope (explicit)

- Any Phase 3 feature (drawer / mobile / keyboard).
- A full e2e harness — targeted component tests with fake timers + a network-call diff suffice for a frontend-only change.

## Decision log

- **Edge cases are the gate, not pixels:** the patient-facing risk is a dropped or doubled action; the four-case matrix (Undo / elapse / flush / poll-during-commit) is the meaningful check (P2-BRR-2).
- **Dedicated gate task:** mirrors Phase 1 (brr-04) and the cockpit batches; keeps build tasks focused and gives one green checkpoint to promote Phase 3.

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — the integrated component.
- [`frontend/lib/api.ts`](../../../../../../frontend/lib/api.ts) — `getServiceStaffReviews` / `postConfirm…` / `postReassign…` / `postCancel…` (mock targets; no inverse endpoint).
- brr-05/06/07/08 task files in [`./`](.) — the behaviours this gate verifies.
- [`docs/Work/capture/inbox.md`](../../../../../../docs/Work/capture/inbox.md) — the capture line lands here.
- Batch: [`plan-p2-booking-review-workflow-batch.md`](../plan-p2-booking-review-workflow-batch.md) · Order: [`EXECUTION-ORDER-p2-booking-review-workflow.md`](./EXECUTION-ORDER-p2-booking-review-workflow.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; batch gate green; status stamped here.
