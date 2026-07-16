# Task plan-c-03: L2 Advice / Education nesting

> **Program:** [`../README.md`](../README.md) · exec [`./EXECUTION-ORDER-plan-tab-chrome.md`](./EXECUTION-ORDER-plan-tab-chrome.md)

## Scope (Wave 2)

1. Inside L1 **Advice & education**, nest **Advice** and **Patient education** as peer L2 `CollapsibleContainer`s with `variant="subsection"` (inherits depthTone from parent — do **not** re-seed `depthTone` on L2).
2. Preserve L1 `data-testid="plan-advice-zone"`; add L2 testids `plan-advice-l2` / `plan-education-l2`.
3. Quick-picks stay **inside** each L2 body (in-body chrome, PLAN-C5).
4. **Defer** medicine-row depth cue — densify / `MedicineRow` already owns expand/collapse; wrapping rows would fight PLAN-C7. Track as follow-up if a light surface cue is still wanted.

## DO NOT TOUCH

- Medicine densify, favorites, capture, DDI/allergy lift, shortcuts
- Drag-reorder / layout persistence
- PDF / backend

## Acceptance

- [x] Advice & education L1 still toggles as one card
- [x] Advice and Patient education are nested subsection collapsibles
- [x] Existing PlanSection tests green (+ L2 assertions)
- [x] No MedicineRow rewrite
