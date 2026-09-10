# Execution order — patients-opd-ui-align

| Step | Task | Depends | Model | Notes |
|---|---|---|---|---|
| 0 | [poa-01](./task-poa-01-page-shell-rhythm.md) | — | Auto | Drop bleed; title token; gap stack. |
| 1 | [poa-02](./task-poa-02-sticky-band-worklist-chips.md) | poa-01 | Auto | Sticky band + All/worklist chips. |
| 2 | [poa-03](./task-poa-03-search-parity.md) | poa-02 | Auto | Clear-X, width, `/` focus. |
| 3 | [poa-04](./task-poa-04-table-chrome-empty.md) | poa-01 | Auto | Can parallel poa-02/03 after 01. |
| 4 | [poa-05](./task-poa-05-skeleton-close-gate.md) | poa-02…04 | Auto | Skeleton + acceptance checklist. |

Prefer sequential 01 → 02 → 03; run 04 after 01 if unblocked.
