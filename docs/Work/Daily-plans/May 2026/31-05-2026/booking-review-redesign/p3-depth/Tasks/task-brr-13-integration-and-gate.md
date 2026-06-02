# brr-13 — Integration + parity / a11y / bulk gate + tests (Phase 3 close)

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 3 — depth + platform](../plan-p3-booking-review-depth-batch.md) |
| **Wave** | 3 (Lane A — last) |
| **Depends on** | brr-10, brr-11, brr-12 |
| **Blocks** | — (closes Phase 3 + the booking-review UI program) |
| **Size** | **S–M** |
| **Model** | **Auto** (optional **light** review of parity + a11y) |
| **Decision locks** | All BR-DL-* + P1/P2/P3-BRR-* |

---

## Objective

Prove Phase 3 added depth + platform without changing what the system *does*: every new surface (drawer, mobile cards, keyboard, bulk) dispatches through the Phase-2 action flow with **identical endpoints + payloads**, the optimistic/Undo/409 edges still hold across bulk, no PHI leaked into logs, and a11y is sound. Then close the batch.

## Why this task

Phase 3 multiplied the entry points to the same three actions (Confirm/Reassign/Cancel) — across mouse, tap, keyboard, and bulk. The risk isn't new logic; it's a new path that drifts from parity, double-sends in a bulk+Undo race, or leaks PHI into a new log line. This gate verifies the invariants once, end-to-end, and signs off the program's final UI phase.

## Scope

Verification + targeted tests + cleanup. No new features. Small fixes found during the gate are allowed in-task; anything larger is captured to the inbox.

## Integration checklist

### Action-call parity (the prime directive — BR-DL-7 / P2-BRR-1)

- [x] **Confirm** fires the same request from: desktop button, mobile card, keyboard `c`, quick-resolve, **and** bulk-confirm (one per row). Same payload each way.
- [x] **Reassign** opens the same dialog and sends the same payload from desktop, mobile overflow, and keyboard `r`.
- [x] **Cancel** likewise from desktop, mobile overflow, and keyboard `x`.
- [x] 409 (already-resolved) reconciles identically on every path, **including inside a bulk batch** (partially-stale selection resolves cleanly).
- [x] Undo cancels the pending commit on every path; the **bulk** batch toast's Undo cancels **all** still-pending commits and fires **zero** requests for them.

### Drawer (brr-10)

- [x] Opens from desktop row click, mobile tap, and keyboard `Enter`; shows signals + candidates + proposal/final + (resolved) audit.
- [x] Conversation placeholder renders; **no** backend call anywhere in the drawer (P3-BRR-2).
- [x] The old inline expander is fully gone.

### Mobile (brr-11)

- [x] `<lg`: no horizontal scroll; cards over `displayReviews` (filters/sort honoured); Confirm + overflow reachable; tap opens drawer.
- [x] `lg+`: desktop table unchanged; toolbar / "N new" pill / toasts work in both.

### Keyboard + bulk (brr-12)

- [x] j/k/c/r/x/Enter// / ? behave per spec; **inert** while typing or while a `Dialog`/`Sheet` is open (P3-BRR-5).
- [x] Selection + bulk bar; bulk-confirm routes per-row through the dispatcher; one batch toast + batch Undo.

### PHI / privacy (BR-DL-5)

- [x] No patient name / reason / `resolution_internal_note` / audit added to `console`, analytics, or telemetry on any new path (drawer, card, keyboard, bulk).

### Accessibility

- [x] Focused row/card has visible focus + `aria` selection; no focus trap; `?` help discoverable; drawer is keyboard-dismissable (Esc) without firing triage keys.

### Regression (Phases 1–2 intact)

- [x] `ConfidenceBadge` / `SlaCountdown` / SLA-sort / filters / quick-resolve / auto-refresh + "N new" pill all still work, in both layouts.

## Tests to add / confirm

- [x] **Parity matrix** (component/integration): Confirm via button, card, `c`, and bulk all call the action with the same args (spy/mock the api). 1 representative test per surface.
- [x] **Bulk + Undo:** select 3 → bulk-confirm → Undo before the window → **0** confirm calls. Let it commit → exactly 3 calls.
- [x] **Bulk + stale:** one selected row returns 409 → reconciled, others commit; no throw, no double-send.
- [x] **Keyboard guard:** triage keys ignored while an input is focused and while the drawer/dialog is open.
- [x] Run the focused suites:
  - `npx vitest run components/service-reviews lib/service-reviews` (or the repo's runner) — drawer render, mobile card actions, keyboard hook, bulk-confirm, plus the carried Phase-1/2 suites.

## Commands

```bash
cd frontend
npx tsc --noEmit
npm run lint
# targeted tests for the touched areas
npx vitest run components/service-reviews lib/service-reviews
```

## Acceptance criteria

- [x] Every integration checklist box above ticked.
- [x] Parity, bulk+Undo, bulk+stale, and keyboard-guard tests green.
- [x] `npx tsc --noEmit` clean; `npm run lint` clean (warnings ok).
- [x] No edits to the backend, `frontend/app/dashboard/booking-review/page.tsx`, or `staff-review-match-explain.ts` copy.
- [x] `docs/Work/capture/inbox.md` updated: Phase 3 (drawer + mobile + keyboard/bulk) shipped frontend-only; live IG conversation deferred to a scoped backend read (BR-Q3, spec sketch in the batch plan); this closes the booking-review UI program pending that one follow-up.
- [x] Status stamped on brr-10..13.

## Out of scope (explicit)

- The deferred IG-conversation read endpoint (P3-BRR-2) — its own task/plan.
- Bulk reassign/cancel, saved views, analytics (rolled forward in the batch plan).
- Any new feature surfaced during the gate (capture to inbox, don't build).

## Decision log

- **One consolidated gate** for the whole phase: the new surfaces share one action flow, so parity + a11y + bulk edges are best verified together rather than per task.
- **Optional light review only:** no backend, no PHI write, no RLS in this batch; a light human pass on parity + a11y is sufficient. The deferred conversation endpoint is where the heavier (Opus/PHI) review belongs.

## References

- Batch: [`plan-p3-booking-review-depth-batch.md`](../plan-p3-booking-review-depth-batch.md) (cross-cutting gate) · Order: [`EXECUTION-ORDER-p3-booking-review-depth.md`](./EXECUTION-ORDER-p3-booking-review-depth.md).
- Tasks: [`brr-10`](./task-brr-10-detail-drawer.md) · [`brr-11`](./task-brr-11-mobile-cards.md) · [`brr-12`](./task-brr-12-keyboard-and-bulk.md).
- Prior gates: [`brr-04`](../../p1-reskin/Tasks/task-brr-04-integration-and-gate.md) · [`brr-09`](../../p2-workflow/Tasks/task-brr-09-integration-and-gate.md).
- Product plan: [`plan-booking-review-redesign.md`](../../../../../../Product%20plans/plan-booking-review-redesign.md).

---

**Status:** `Done` (2026-05-31). Phase 3 closed; booking-review UI program complete pending deferred IG-conversation read (P3-BRR-2).  
**Done when:** the batch cross-cutting gate is green and Phase 3 is stamped closed.
