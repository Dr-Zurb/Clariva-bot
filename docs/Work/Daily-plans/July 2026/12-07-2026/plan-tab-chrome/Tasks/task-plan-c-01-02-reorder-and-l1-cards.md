# Task plan-c-01 + plan-c-02: Reorder + L1 Plan cards

> **Program:** [`../README.md`](../README.md) · exec [`./EXECUTION-ORDER-plan-tab-chrome.md`](./EXECUTION-ORDER-plan-tab-chrome.md)

## Scope (W0 + W1 shipped together)

1. **Reorder** — Investigations above Medications; safety banners after Medications (PLAN-C2 / PLAN-C8).
2. **L1 cards** — Each Plan zone becomes a `CollapsibleContainer` with `depthTone`, `stickyHeader`, `scrollOnExpand`, `closeScrollToSelector` targeting `[data-testid="plan-scroll-top"]`.
3. **Preserve** `data-testid`s (`plan-investigations-zone`, `plan-medications-zone`, …) on the collapsible roots.
4. **DO NOT** drag-reorder, L2 nesting, MedicineRow rewrite, or PDF changes.

## Acceptance

- [x] DOM order: investigations zone before medications zone
- [x] Each L1 is a CollapsibleContainer (expand/collapse works)
- [x] Existing PlanSection tests green (updated for order + cards)
- [x] Med densify / favorites / packs / shortcuts unchanged
