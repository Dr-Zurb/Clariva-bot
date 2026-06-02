# Task cc-04: Introduce `cockpit-layout` slot-state primitive

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase C, Lane δ step 0 — **L, ~3h**

---

## Task overview

Today (post-cs-08) the cockpit's three desktop columns are **hardcoded** in `<ConsultationCockpit>`'s JSX:

```tsx
<ResizablePanel id="cockpit-col-chart">…</ResizablePanel>
<ResizableHandle withHandle />
<ResizablePanel id="cockpit-col-body">…</ResizablePanel>
<ResizableHandle withHandle />
<ResizablePanel id="cockpit-col-rx">…</ResizablePanel>
```

The order is fixed: chart on left, body in middle, Rx on right. The only flex on positioning is collapse (cs-08) and resize (cs-08).

The user explicitly asked for **column reorder** ("any column can have space left right or middle"). All six permutations of the three column types (`chart`, `body`, `rx`) must be supported. Future cc-06 (Layout menu) and cc-07 (drag-to-reorder) need a single source of truth for "which column sits in which slot" that they can both write to.

cc-04 introduces a **slot-state primitive** — `cockpit-layout` — that captures:

```ts
interface CockpitLayout {
  /** 3-tuple of column types in their visual order: [left, middle, right]. */
  slots: [ColumnType, ColumnType, ColumnType];
  /** 3-tuple of width percentages for each slot. Must sum to ~100. */
  widths: [number, number, number];
  /** Per-column-type collapsed flag. Body is never collapsed (CC-D2). */
  collapsed: { chart: boolean; rx: boolean };
}

type ColumnType = 'chart' | 'body' | 'rx';
```

The cockpit refactors its hardcoded JSX into an `Array.map` over `slots`, dispatching on column type to render the appropriate panel content. Saved-layout persistence (`localStorage` key from cs-08) is widened to include the `slots` order alongside the existing widths.

This is **the** big task in the batch. Comparable structural blast-radius to yesterday's cs-07 — every cockpit-state path must work in every permutation.

**Estimated time:** ~3h.

**Status:** Done — 2026-05-10. Slot-state primitive (`frontend/lib/consultation/cockpit-layout.ts`) + 38 unit tests landed; `<ConsultationCockpit>` now renders the three columns from a slot-driven `Array.map` with stable `cockpit-col-${columnType}` ids; `[` / `]` hotkeys rebind to slot-positional `onToggleLeftRail` / `onToggleRightRail`; persistence dual-writes the legacy `react-resizable-panels:` widths-only key plus a new versioned `cockpit-layout:v1:` snapshot (slots + widths + collapsed); shell tests parametrise all 6 permutations + walk-in two-pane, resize tests rebound to the new hotkey contract; `pnpm tsc --noEmit` clean, no new lint warnings on changed files. CC-D1 / CC-D2 / CC-D9 / CC-D10 all honoured. Unblocks cc-05 → cc-13.

**Hard deps:** cc-03 (the body / Rx columns must already have `<CockpitColumnHeader>` mounted; cc-04 doesn't add headers, only refactors the panel structure).

**Source:** [plan-cockpit-customization-batch.md § CC-D1](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Thinking-XHigh.**

This is the only Opus task in the batch. The structural reasoning across 4 cockpit states × 6 permutations × 2 viewport branches (lg+ vs walk-in two-pane) makes pattern-matching unsafe.

**New chat?** **Yes** — fresh Opus chat. Do not stitch onto the cc-02/cc-03 chat.

### Pre-load list (read all of these in the first message)

- This task file.
- [`plan-cockpit-customization-batch.md`](../plan-cockpit-customization-batch.md) — full plan, especially the decision lock (CC-D1, CC-D2, CC-D9, CC-D10).
- `frontend/components/consultation/ConsultationCockpit.tsx` — the file you'll refactor. Read all 818 lines.
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` — hosting component for the per-column controls (already exists from cc-02).
- `frontend/components/ehr/AppointmentChartRail.tsx` — chart column body.
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` — Rx column body.
- `frontend/components/consultation/cockpit/RailCollapsedStub.tsx` — collapsed-rail body.
- `frontend/components/ui/resizable.tsx` — the shadcn wrapper around `react-resizable-panels`. Confirm the `<ResizablePanelGroup>` `id` / `key` / `panelRef` semantics.
- `react-resizable-panels` README (online) — the `Layout` type and `setLayout()` semantics.
- `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` — existing snapshot tests (you'll update these).
- `frontend/components/consultation/__tests__/ConsultationCockpit.resize.test.tsx` — existing resize tests.
- The walk-in `(!appointment.patient_id)` branch — currently renders only body + Rx. cc-04 must preserve this; the slot-state for walk-ins is `['body', 'rx']` (2-tuple) or filters out chart from the 3-tuple.

**Estimated turns:** 5–8. Expect at least one mid-task pivot when a permutation surfaces an edge case (especially walk-in two-pane and the `localStorage` migration path).

---

## Acceptance criteria

### New `cockpit-layout` types and helpers

- [x] Create `frontend/lib/consultation/cockpit-layout.ts`. Public surface:

  ```ts
  /** The three cockpit column types. */
  export type ColumnType = 'chart' | 'body' | 'rx';

  /** A 3-tuple of column types in [left, middle, right] order. */
  export type ColumnSlots = readonly [ColumnType, ColumnType, ColumnType];

  /** A 3-tuple of width percentages for [left, middle, right] slots. */
  export type ColumnWidths = readonly [number, number, number];

  /** Per-column-type collapsed flag. Body is excluded (never collapsible). */
  export interface CollapsedFlags {
    chart: boolean;
    rx: boolean;
  }

  /** The cockpit-layout state — slots + widths + collapsed. Reorder, resize, and collapse all write here. */
  export interface CockpitLayout {
    slots: ColumnSlots;
    widths: ColumnWidths;
    collapsed: CollapsedFlags;
  }

  /** Default layout: chart-body-rx, 26/48/26 split, nothing collapsed. */
  export const DEFAULT_COCKPIT_LAYOUT: CockpitLayout;

  /** Walk-in default: body-rx, 60/40 split. Chart slot omitted via filter at render time. */
  export const DEFAULT_WALKIN_LAYOUT: CockpitLayout;

  /**
   * Validate a layout shape. Returns `null` if invalid (use the default
   * instead). Used by `readSavedLayout` to defend against corrupted
   * localStorage payloads.
   */
  export function validateLayout(raw: unknown): CockpitLayout | null;

  /** Type guard for ColumnType. */
  export function isColumnType(v: unknown): v is ColumnType;

  /** Returns the index of `type` in `slots`, or -1 if not present. */
  export function indexOfColumn(slots: ColumnSlots, type: ColumnType): number;

  /**
   * Whether `type` is in the middle slot of `slots`. Used by the
   * collapsibility rule (middle = always-on per CC-D2).
   */
  export function isMiddleSlot(slots: ColumnSlots, type: ColumnType): boolean;

  /**
   * Swap two column types in `slots`. Used by both the dropdown menu
   * (cc-06) and drag-to-reorder (cc-07). Idempotent on `from === to`.
   */
  export function swapSlots(
    slots: ColumnSlots,
    from: ColumnType,
    to: ColumnType,
  ): ColumnSlots;
  ```

  - Add a thorough JSDoc block at the top of the file explaining the slot semantics, the body-always-middle option, and the walk-in collapsing-to-2-tuple at render time.
  - `validateLayout` must reject: missing fields, wrong-shaped arrays, slots that aren't a permutation of the three column types, widths that don't sum to within ±5 of 100, collapsed flags with wrong types.

- [x] Create unit tests at `frontend/lib/consultation/__tests__/cockpit-layout.test.ts`:
  - All six permutations of `slots` are valid.
  - Duplicate column types in `slots` (e.g. `['chart', 'chart', 'rx']`) are rejected.
  - `isMiddleSlot('chart')` returns true when `slots[1] === 'chart'`, false otherwise.
  - `swapSlots(['chart','body','rx'], 'chart', 'rx')` → `['rx','body','chart']`.
  - `validateLayout` accepts `DEFAULT_COCKPIT_LAYOUT` and rejects garbage shapes.

### Refactor `<ConsultationCockpit>` to render columns from `slots`

- [x] Replace the hardcoded `<ResizablePanel id="cockpit-col-chart">` / body / Rx JSX with an `Array.map` over `layout.slots`. Pseudocode:

  ```tsx
  // Filter out 'chart' on walk-ins.
  const visibleSlots = showChartPanel
    ? layout.slots
    : (layout.slots.filter((t) => t !== 'chart') as readonly ColumnType[]);

  return (
    <ResizablePanelGroup
      key={layoutGroupId}
      id={layoutGroupId}
      groupRef={groupRef}
      orientation="horizontal"
      onLayoutChanged={handleLayoutChanged}
      className="h-full border-y border-border"
    >
      {visibleSlots.map((columnType, slotIndex) => (
        <Fragment key={columnType}>
          {slotIndex > 0 && <ResizableHandle withHandle />}
          {renderColumnPanel(columnType, slotIndex, …)}
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
  ```

- [x] Implement `renderColumnPanel(columnType, slotIndex, …)` as a function (not a component — keep it inline so it has access to all the outer-scope refs and state). The function:

  - Returns a `<ResizablePanel>` with:
    - `id={\`cockpit-col-${columnType}\`}` (stable id per column type — survives reorder).
    - `defaultSize={layout.widths[slotIndex]}`.
    - `minSize`: per-column-type table — chart/rx min 18, body min 35.
    - `collapsible={!isMiddleSlot(layout.slots, columnType) && columnType !== 'body'}` — middle slot is non-collapsible (CC-D2); body is also never collapsible regardless of slot. Both conditions together mean: only chart and rx can collapse, AND only when they're not in the middle slot.

      _NOTE for cc-05:_ this is the slot-vs-content collapsibility rule. CC-D2 says "by slot" — middle is always-on. But the body-as-content-type can never be collapsed even when in a side slot (the body has no sensible collapsed view). Both guards apply.
    - `collapsedSize={5}` for chart and rx (cc-12 bumps to 7).
    - `onResize={...}` — fires the per-column collapsed-flag updater (`handleChartResize` / `handleRxResize`).
    - `panelRef`: `chartPanelRef` for chart, `rxPanelRef` for rx, none for body.
  - Renders the column body via a column-type dispatch:

    ```tsx
    if (columnType === 'chart') return chartCollapsed ? <RailCollapsedStub …/> : <AppointmentChartRail …/>;
    if (columnType === 'body') return <BodyColumnContent …/>;  // header + CenterPane (already wrapped per cc-03)
    if (columnType === 'rx') return rxCollapsed ? <RailCollapsedStub …/> : <RxColumnContent …/>;  // header + RxWorkspace
    ```

- [x] Extract small helper components for `BodyColumnContent` and `RxColumnContent` so the dispatch stays readable. Both components are local to `ConsultationCockpit.tsx` (no separate files); they receive props from outer scope.

### Persistence — extend `readSavedLayout` / `writeSavedLayout`

- [x] The cs-08 `readSavedLayout(groupId)` reads a `Layout` (the library's type — array of widths). Widen this to read a `CockpitLayout` (the new type — slots + widths + collapsed).

- [x] Use a **versioned localStorage key** to handle the migration:

  ```ts
  const LAYOUT_KEY_PREFIX = 'react-resizable-panels:';  // unchanged for the lib's own widths
  const COCKPIT_LAYOUT_KEY_PREFIX = 'cockpit-layout:v1:';  // new namespaced key for the slot-state
  ```

  - The library's own auto-save (`react-resizable-panels:cockpit-shell`) keeps storing widths-only; we layer the slot-order on top under `cockpit-layout:v1:cockpit-shell`.
  - On read: try the new key first, fall back to defaults if absent or invalid (validate with `validateLayout`).
  - On write: stringify the full `CockpitLayout` to the new key on every settled change.

- [x] **Migration note**: doctors with a saved layout from yesterday's cs-08 will see widths preserved (the lib's auto-save handles those) but slot order will reset to default (`['chart','body','rx']`) until they reorder again. Document this in the task's PR description; no migration code needed (the cockpit just reads the old widths and the new default slots).

### Collapse-state syncing

- [x] Today, `chartCollapsed` and `rxCollapsed` are two separate `useState` booleans wired to the panel API via `onResize`. cc-04 keeps them as separate state but mirrors them into the `cockpit-layout.collapsed` object on every change:

  ```ts
  // Single source of truth: cockpit-layout. The booleans are derived selectors.
  const chartCollapsed = layout.collapsed.chart;
  const rxCollapsed = layout.collapsed.rx;

  const setChartCollapsed = (next: boolean) =>
    setLayout((l) => ({ ...l, collapsed: { ...l.collapsed, chart: next } }));
  const setRxCollapsed = (next: boolean) =>
    setLayout((l) => ({ ...l, collapsed: { ...l.collapsed, rx: next } }));
  ```

  - The handlers `handleChartCollapse` / `handleChartExpand` / `handleRxCollapse` / `handleRxExpand` keep their imperative panel-API calls; only the boolean flip moves into the `setLayout` setter.

### Hotkey rebind

- [x] Today `useCockpitHotkeys({ onToggleChartRail, onToggleRxRail })` calls handlers that target the chart and Rx columns. cc-04 must preserve this contract — the user expects `[` and `]` to keep collapsing the LEFT and RIGHT side rails, regardless of which column types occupy those slots.

- [x] Implement `onToggleLeftRail` / `onToggleRightRail` semantics:

  ```ts
  const onToggleLeftRail = () => {
    const leftType = layout.slots[0];
    if (leftType === 'body') return; // body never collapses
    if (leftType === 'chart') handleChartToggle();
    else handleRxToggle();
  };
  ```

  - Same for `onToggleRightRail`.
  - **Backwards compat:** rename `onToggleChartRail` / `onToggleRxRail` in `useCockpitHotkeys` to `onToggleLeftRail` / `onToggleRightRail` (the hook reads pure slot-side semantics now). Update the hook's tests.
  - **Decision:** the `[` / `]` hotkeys remain **slot-positional** (left rail / right rail), not column-type. This is what users learn — "left bracket collapses the left thing". CC-D2 also reads cleanly with this — the middle slot's column type never receives a collapse signal.

### Snapshot tests — six permutations

- [x] In `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`, add a parametrized test that renders the cockpit with each of the 6 permutations of `slots`:
  - `['chart','body','rx']`, `['chart','rx','body']`, `['body','chart','rx']`, `['body','rx','chart']`, `['rx','chart','body']`, `['rx','body','chart']`.
  - Assert: 3 panels render, with the column-header titles in the correct visual order ("Patient chart" / "Consultation" / "Prescription" mapped per slot).
  - Assert: the middle-slot column has no collapse chevron in its header (collapsibility rule).
  - Assert: the side-slot collapsible columns have the chevron.

  _Implementation note:_ assertions on the visual chevron live in cc-05 (which adds the chevron's slot-aware rendering). cc-04's parametrised tests assert the underlying *contract* via `data-collapsible` on the `<ResizablePanel>` mock — middle slot panels read `false`, side slots read `true` for chart/rx and `false` for body. Same invariant, one render layer down.

- [x] Walk-in case: `slots = ['chart','body','rx']` with `appt.patient_id = null`. Assert: 2 panels render (body + rx), `chart` is filtered out at render time. Header titles in order: "Consultation" / "Prescription".

### `pnpm tsc --noEmit` + lint

- [x] `pnpm --filter frontend tsc --noEmit` is clean. The new `CockpitLayout` types must flow through `<ConsultationCockpit>` without `any`.
- [x] `pnpm --filter frontend lint` — no new warnings on changed files. (The four pre-existing `react-hooks/exhaustive-deps` warnings on `ConsultationLauncher.tsx` and the four `Definition for rule '@typescript-eslint/no-…' was not found` errors in `OpdQueueSessionToolbar.tsx` / `OpdTodayClient.tsx` / `tailwind.config.ts` / `__tests__/components/opd/opdQueueTelemetry.test.ts` predate this batch and are unaffected by cc-04.)

### Manual verification — every cockpit state × every permutation

- [ ] For each of: `ready`, `lobby`, `live (video)`, `live (voice)`, `live (text)`, `wrap_up`, `ended`, `terminal`:
  - Toggle through 2-3 permutations (the default + 2 others).
  - Confirm: panels render in the correct order, no z-fighting, no overlap, body content fills its panel, side panels can collapse / expand.
- [ ] Verify walk-in: a no-`patient_id` appointment renders body + Rx only, in the configured order.
- [ ] Verify `[` / `]` hotkeys: collapse the left rail with `[`, regardless of whether it's the chart or the Rx column.
- [ ] Verify saved layout persistence: change column order via the (still-to-come cc-06 menu — for cc-04 manually mutate `localStorage` to test), refresh, the order persists.

---

## Out of scope

- **The Layout dropdown menu** (cc-06) — cc-04 doesn't add UI; it only refactors the underlying state shape.
- **Drag-to-reorder via column headers** (cc-07) — same. cc-04 makes reorder *possible* by introducing the state setter; cc-07 ships the drag UX.
- **Slot-based collapsibility wiring** (cc-05) — cc-04 implements the *condition* (middle slot non-collapsible); cc-05 adjusts the chevron rendering and the hotkey targeting if needed.
- **Layout presets backend** — cc-08 / cc-09 / cc-10. cc-04 lays the foundation by exposing `setLayout(nextLayout: CockpitLayout)` as a callable, which presets will use.
- **Mobile slot-state** — mobile uses `MobilePillBar`; the desktop slot-state model doesn't apply. Don't refactor the mobile branch.

---

## Files expected to touch

**Modified (~250 LOC delta):**
- `frontend/components/consultation/ConsultationCockpit.tsx` — ~150 LOC delta. The desktop branch's panel JSX is replaced with the slot-driven `Array.map`. Local helper components `BodyColumnContent` / `RxColumnContent` extracted.
- `frontend/hooks/useCockpitHotkeys.ts` — rename `onToggleChartRail` → `onToggleLeftRail`, `onToggleRxRail` → `onToggleRightRail`. ~10 LOC.
- `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` — parametrized 6-permutation test. ~80 LOC.
- `frontend/components/consultation/__tests__/ConsultationCockpit.resize.test.tsx` — update for new resize pathways if needed. ~10 LOC.
- `frontend/hooks/__tests__/useCockpitHotkeys.test.ts` (if exists) — adapt to renamed handlers. ~5 LOC.

**New (~200 LOC):**
- `frontend/lib/consultation/cockpit-layout.ts` — types, defaults, helpers (`swapSlots`, `validateLayout`, etc.). ~100 LOC.
- `frontend/lib/consultation/__tests__/cockpit-layout.test.ts` — unit tests. ~100 LOC.

**Migrations:** none — frontend-only.

---

## Notes / open decisions

1. **Why a 3-tuple `slots` instead of an object `{ left, middle, right }`?** Render-time iteration is cleaner with `slots.map(...)`. Object-style would force `(['left','middle','right'] as const).map((slot) => render(layout[slot]))`. Same expressivity, more typing.
2. **Why expose `swapSlots` as a helper?** Both cc-06 (menu) and cc-07 (drag) need to swap two columns. Putting the implementation in one place avoids divergence (e.g. one accidentally swaps widths too while the other doesn't).
3. **What happens when the doctor swaps a collapsed side rail with the middle column?** The newly-middle column inherits "non-collapsible", which auto-expands it (a collapsed column moving into the middle slot is contradictory). cc-04 should fire `handleChartExpand` / `handleRxExpand` on the column being moved INTO the middle. Add this guard inside `setLayout` or as a follow-up effect.
4. **Versioned localStorage key (`v1:`).** When a future schema change adds a field to `CockpitLayout` (e.g. row order for vertical splits), bump the `v1:` to `v2:` so old payloads are ignored rather than crashing the validate path.
5. **Why keep `react-resizable-panels:cockpit-shell` as the lib's own auto-save key?** The library's `setLayout` / `getLayout` round-trip uses that key internally for widths-only persistence. Leaving it intact means our `cockpit-layout:v1:cockpit-shell` is purely additive — nothing to remove from yesterday's cs-08 work.
6. **Body always renders mid-default, never collapses.** Per CC-D2, even if a doctor reorders body into a side slot, body is non-collapsible (it has no sensible collapsed view). The collapsibility predicate is `(columnType !== 'body') && !isMiddleSlot(slots, columnType)`.
7. **Performance.** The slot-state lives in `useState` in `<ConsultationCockpit>`. Every reorder triggers a full re-render of the `<ResizablePanelGroup>`. The library tolerates this as long as panel `id`s are stable (we use `cockpit-col-${columnType}` — invariant per column type, so React reconciles correctly across reorders without remounting).

---

## References

- **Affected files:**
  - `frontend/components/consultation/ConsultationCockpit.tsx` (the cs-08 hardcoded JSX this task generalises)
  - new `frontend/lib/consultation/cockpit-layout.ts`
- **Source state machine:** `frontend/lib/consultation/cockpit-state.ts` (read-only — confirms the cockpit-state derivation isn't touched).
- **Style precedent:** [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/Tasks/task-cs-07-cockpit-shell-fixed-height.md](../../../09-05-2026/cockpit-shell-redesign/Tasks/task-cs-07-cockpit-shell-fixed-height.md) — yesterday's structural rewrite (similar blast radius).
- **Library docs:** `react-resizable-panels` README — `<ResizablePanelGroup>` `id`, `<ResizablePanel>` `id`, `panelRef.collapse() / expand()`, `groupRef.setLayout()` API.

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Done — 2026-05-10. Acceptance criteria 1-12 (types, helpers, unit tests, slot-driven `Array.map` JSX, `renderColumnPanel`, helper components, dual-write versioned persistence, collapse-state syncing through `setLayout`, slot-positional hotkey rebind, 6-permutation parametrised shell tests, walk-in two-pane test, `pnpm tsc --noEmit` + lint clean) verified via 80 passing tests across `cockpit-layout.test.ts` (38), `ConsultationCockpit.shell.test.tsx` (22), `ConsultationCockpit.resize.test.tsx` (9), `cockpit-state.test.ts` (11). Manual browser verification (criterion 13) deferred to the cc-04 → cc-05 handoff demo.
