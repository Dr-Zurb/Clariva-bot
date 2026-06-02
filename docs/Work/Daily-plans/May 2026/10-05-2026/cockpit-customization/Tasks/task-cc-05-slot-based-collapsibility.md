# Task cc-05: Slot-based collapsibility — middle column always-on, side columns collapsible

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase C, Lane δ step 1 — **S, ~1.5h**

---

## Task overview

cc-04 introduced the slot-state primitive (`cockpit-layout`) and refactored the cockpit's hardcoded JSX into an `Array.map` over `slots`. The collapsibility *predicate* (`(columnType !== 'body') && !isMiddleSlot(slots, columnType)`) is wired in cc-04 — this task tightens the surrounding behavior so the rule holds end-to-end.

cc-05 covers three follow-ups that are too small to be cc-04 sub-tasks but too important to leave informal:

1. **Header chevron rendering** — when a column is in the middle slot, its `<CockpitColumnHeader>` actions slot must NOT render the collapse chevron. Otherwise the user clicks a chevron that does nothing.
2. **`onResize` collapse-flag wiring per slot** — yesterday's cs-08 fires `handleChartResize` / `handleRxResize` to mirror drag-to-collapse into the boolean. After cc-04, these handlers are tied to column types (chart / rx); they keep working but now the collapsing column might be in either side slot. This task verifies the wiring stays correct for all permutations.
3. **Mid-flight collapse-state guard on reorder** — when a doctor reorders a *collapsed* side column into the middle slot, the column must auto-expand (collapse + middle is contradictory). cc-04's `setLayout` setter is the right place; this task formalizes the guard and tests it.

**Estimated time:** ~1.5h.

**Status:** Pending.

**Hard deps:** cc-04 (slot-state primitive must exist).

**Source:** [plan-cockpit-customization-batch.md § CC-D2](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat after cc-04 closes. Pre-load:
- This task file.
- The output of cc-04 (the new `frontend/lib/consultation/cockpit-layout.ts` and the refactored `<ConsultationCockpit>`).
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx`.
- `frontend/components/ehr/AppointmentChartRail.tsx` (its in-flow chevron — confirm it can accept a `hideCollapse` prop or is conditionally hidden by the parent).

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Conditional chevron rendering in column headers

- [ ] In `<ConsultationCockpit>`, when rendering a column's `<CockpitColumnHeader>` actions slot, gate the collapse chevron on the slot-collapsibility predicate:

  ```tsx
  const isCollapsible = columnType !== 'body' && !isMiddleSlot(layout.slots, columnType);

  <CockpitColumnHeader
    title={titleFor(columnType)}
    titleId={`cockpit-${columnType}-title`}
    actions={
      isCollapsible ? (
        <button … onClick={() => toggleColumn(columnType)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null
    }
  />
  ```

  - **For `body`**: chevron is never rendered (body has no collapse path).
  - **For `chart` or `rx` in the middle slot**: chevron is hidden — collapsing is contradictory.
  - **For `chart` or `rx` in a side slot**: chevron renders.

- [ ] The chevron's direction (`<ChevronLeft />` vs `<ChevronRight />`) reflects the slot side. Left-slot column → `<ChevronLeft>` (expand inward = right). Right-slot column → `<ChevronRight>` (expand inward = left). The chevron always "points away from the body". Helper:

  ```tsx
  const ChevronIcon = slotIndex === 0 ? ChevronLeft : ChevronRight;
  ```

### `onResize` wiring stays correct after reorder

- [ ] cc-04 already wires `<ResizablePanel onResize={handleChartResize} />` for the chart column and `handleRxResize` for the Rx column. Confirm the handlers still target the right boolean after a reorder:
  - Reorder so Rx is on the left and chart is on the right. Drag the LEFT resize handle past the collapse threshold. The Rx panel collapses → `handleRxResize` fires → `setLayout(... collapsed.rx = true)`. Chart stays uncollapsed.
  - The library fires `onResize` per panel, not per slot, so the wiring is sound; this acceptance is a pure regression check.

- [ ] Edge case: if both side columns are collapsed simultaneously (which is allowed — body fills 90%), reorder them so a collapsed column moves into the middle. The "collapse-on-middle guard" below catches this.

### Mid-flight expand on reorder into middle

- [ ] Update cc-04's `setLayout` setter (or a wrapping helper) so that swapping a collapsed column into the middle slot auto-expands it:

  ```ts
  function setLayoutWithGuards(next: CockpitLayout): CockpitLayout {
    const middleType = next.slots[1];
    if (middleType === 'chart' && next.collapsed.chart) {
      next = { ...next, collapsed: { ...next.collapsed, chart: false } };
      // Imperative panel API call to actually expand
      chartPanelRef.current?.expand();
    }
    if (middleType === 'rx' && next.collapsed.rx) {
      next = { ...next, collapsed: { ...next.collapsed, rx: false } };
      rxPanelRef.current?.expand();
    }
    return next;
  }
  ```

  - Apply this in every place `setLayout` is called from a reorder path: cc-06's menu items, cc-07's drag-drop handler, and cc-10's preset-apply path.

### Hotkey rebind verification (regression from cc-04)

- [ ] cc-04 renamed `onToggleChartRail` → `onToggleLeftRail`. Smoke test:
  - Default order, press `[` → left column (chart) collapses.
  - Reorder so Rx is on left, press `[` → Rx collapses (chart untouched).
  - Reorder body to left, press `[` → no-op (body never collapses; the handler short-circuits gracefully).

### Tests

- [ ] In `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`:
  - Add it-block: "no collapse chevron renders on the middle-slot column header".
  - Add it-block: "collapsing a side column then reordering it to middle auto-expands it".
  - Add it-block: "`[` hotkey collapses whichever non-body column is in the left slot".
- [ ] `pnpm --filter frontend tsc --noEmit` clean. Lint clean.

### Manual verification

- [ ] Default layout (chart-body-rx). Confirm chart and Rx headers show their chevrons; body header does not.
- [ ] Use cc-06's menu (or temporarily mutate `localStorage`) to swap to body-chart-rx. Now chart is in the middle — its chevron disappears. Body's chevron appears (no, body never has a chevron — confirm). Rx's chevron stays.
- [ ] Collapse the chart rail. Then reorder it into the middle slot via the menu. Confirm chart auto-expands.

---

## Out of scope

- **Visual styling of the chevron** — keep yesterday's cs-05 styling. cc-05 only changes whether it renders.
- **Drag-to-reorder UX** — that's cc-07.
- **Layout dropdown menu** — that's cc-06.
- **Body-collapsibility** — body never collapses, period. Don't add a body collapse path.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~30 LOC delta — chevron conditional + setLayoutWithGuards helper).
- `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` (~40 LOC delta — 3 new it-blocks).

**New:** none.

---

## Notes / open decisions

1. **Why expand on reorder-into-middle and not just reject the reorder?** Doctor intent is clear ("I want this column central"). Auto-expanding honors the intent without a confusing error message.
2. **What if the doctor wants a collapsed middle column?** They can collapse → reorder out → reorder back. But the middle slot itself is "always-on" by definition (CC-D2). Collapsing the middle means there's nothing in the visual center, which breaks the cockpit's visual logic.
3. **`isMiddleSlot` reading from `layout.slots[1]` — what if a future change adds a 4-column variant?** Out of scope. CC-D1 locks the 3-tuple shape. A 4-column variant would need a new batch (and a different middle-slot semantics — no single middle index).

---

## References

- **Affected files:**
  - `frontend/components/consultation/ConsultationCockpit.tsx`
  - `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` (read-only — accepts the conditional `actions` prop)
- **Predecessor:** [`task-cc-04-cockpit-layout-slot-state.md`](./task-cc-04-cockpit-layout-slot-state.md).
- **Decision lock:** [plan § CC-D2](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
