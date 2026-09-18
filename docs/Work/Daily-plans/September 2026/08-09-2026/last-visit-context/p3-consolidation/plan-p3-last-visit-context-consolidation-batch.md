# Plan: last-visit-context Phase 3 — consolidation

> **Product plan:** [`plan-last-visit-context.md`](../../../../../Product%20plans/plan-last-visit-context.md)
> **Status:** **Implemented** 2026-09-11 with residuals; not Shipped.

One last-visit fetch. One apply vocabulary. Legacy prior-visit surfaces either read `last-visit-summary` or go away.

**Not this phase:** new strips, combo ranking, vitals second strip, share-link, migration, `rx-lifecycle`.

## Task table

| ID | Title | Size | Model | Status |
|---|---|---|---|---|
| [`lvc-12`](./Tasks/task-lvc-12-retire-previous-rx-popover.md) | Retire dead `PreviousRxPopover` (LVC-Q4) | S | current | **Implemented** 2026-09-10 |
| [`lvc-13`](./Tasks/task-lvc-13-repoint-carry-forward.md) | `CarryForwardButton` reads last-visit-summary | M | current | **Implemented** 2026-09-11 |
| [`lvc-14`](./Tasks/task-lvc-14-drop-last-in-episode-from-cockpit.md) | Vitals ghosts + “Copy from last visit” leave `last-in-episode` | M | current | **Implemented** 2026-09-11 |
| [`lvc-15`](./Tasks/task-lvc-15-phase-3-gate.md) | One-fetch proof + docs | M | current | **Implemented** 2026-09-11 |

## Gate (one sentence)

Opening a cockpit fires one last-visit fetch (`last-visit-summary`), served from the queue-hover cache; `PreviousRxPopover` is gone; carry and vitals ghosts read the canonical payload.

## Locks inherited

LVC-DL-6 (one source), LVC-DL-10 (no migration), LVC-Q2 (same-appointment sibling is not last visit), LVC-Q4 (retire the popover), LVC-Q5 (first visit renders nothing).

**Created:** 2026-09-10.
