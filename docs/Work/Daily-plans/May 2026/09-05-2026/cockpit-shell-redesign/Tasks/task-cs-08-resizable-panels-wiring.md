# Task cs-08: Wrap cockpit columns in `<ResizablePanelGroup>` + replace toggle stubs with panel-API collapse

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase B, Lane δ step 2 — **M, ~3h**

---

## Task overview

After [`cs-07`](./task-cs-07-cockpit-shell-fixed-height.md), the cockpit's desktop shell is a fixed-height flex container with three independently-scrolling columns at fixed CSS percentages. cs-08 turns this into:

- A `<ResizablePanelGroup direction="horizontal" autoSaveId="cockpit-shell">` wrapping the three columns.
- A `<ResizableHandle withHandle>` between each pair of adjacent columns (drag-to-resize).
- **Discrete collapse buttons** in each side rail's header (replacing the cs-05 in-flow chevrons), wired to `panel.collapse()` / `panel.expand()` via panel `imperativeHandle` refs.
- **Panel widths persist** per browser via `autoSaveId` (localStorage key `react-resizable-panels:cockpit-shell`).
- **Hotkeys** `[` and `]` toggle the chart and Rx rails respectively (existing hotkey hook just routes to the new collapse handlers).

The legacy `<RxRailToggle>` (vertical-stub button) is **deleted** — its job is split between the resize handle (drag) and the per-rail collapse button (click).

**Estimated time:** ~3h.

**Status:** Done (2026-05-10).

**Hard deps:** [`cs-06`](./task-cs-06-add-resizable-panels-dep.md), [`cs-07`](./task-cs-07-cockpit-shell-fixed-height.md).

**Source:** [plan-cockpit-shell-redesign-batch.md § CS-D2 + CS-D7](../plan-cockpit-shell-redesign-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Thinking-XHigh**.

**Why Opus?** The `react-resizable-panels` imperative API (`panel.collapse()`, `panel.expand()`, `onLayout`, `onCollapse`) has subtle edge cases around SSR, controlled-vs-uncontrolled state, and the interaction between `autoSaveId` and our custom collapse buttons. Opus's debugging stamina is worth the cost here.

**New chat?** **Yes** — third Lane-δ chat. Pre-load includes the cs-07 output, so this is **not** a fresh-from-zero start; the model needs cs-07's `<ConsultationCockpit>` shape in context.

### Pre-load list

- This task file.
- `frontend/components/consultation/ConsultationCockpit.tsx` (post cs-07 — the file we wrap).
- `frontend/components/ui/resizable.tsx` (the cs-06 primitive — read-only).
- `frontend/components/ehr/AppointmentChartRail.tsx` (post cs-05 — the rail header where the new collapse button lands).
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (the Rx column — needs a similar collapse button in its header).
- `frontend/components/consultation/cockpit/RxRailToggle.tsx` — to be **deleted**.
- `frontend/hooks/useCockpitHotkeys.ts` (route `[` / `]` to the new handlers).
- The `react-resizable-panels` API docs (https://github.com/bvaughn/react-resizable-panels#imperative-api).

**Estimated turns:** 4–6.

---

## Acceptance criteria

### Three-panel resizable group on `lg+`

- [ ] In `<ConsultationCockpit>` (desktop branch only), wrap the three columns in `<ResizablePanelGroup>`:

  ```tsx
  <ResizablePanelGroup
    direction="horizontal"
    autoSaveId="cockpit-shell"
    className="hidden lg:flex"
    style={{
      height:
        'calc(100vh - var(--app-header-h) - var(--cockpit-header-h) - var(--cockpit-queue-h))',
    }}
  >
    <ResizablePanel
      ref={chartPanelRef}
      defaultSize={26}
      minSize={18}
      collapsible
      collapsedSize={5}
      onCollapse={() => setChartCollapsed(true)}
      onExpand={() => setChartCollapsed(false)}
    >
      <aside className="h-full overflow-y-auto bg-background" data-testid="cockpit-col-chart">
        {chartCollapsed ? <RailCollapsedStub side="left" onExpand={() => chartPanelRef.current?.expand()} /> : <AppointmentChartRail … />}
      </aside>
    </ResizablePanel>

    <ResizableHandle withHandle />

    <ResizablePanel defaultSize={48} minSize={35}>
      <main className="h-full overflow-y-auto bg-background" data-testid="cockpit-col-body">
        <ConsultationStatePane … />
      </main>
    </ResizablePanel>

    <ResizableHandle withHandle />

    <ResizablePanel
      ref={rxPanelRef}
      defaultSize={26}
      minSize={22}
      collapsible
      collapsedSize={5}
      onCollapse={() => setRxCollapsed(true)}
      onExpand={() => setRxCollapsed(false)}
    >
      <aside className="h-full overflow-y-auto bg-background" data-testid="cockpit-col-rx">
        {rxCollapsed ? <RxRailCollapsedStub onExpand={() => rxPanelRef.current?.expand()} /> : <RxWorkspace … />}
      </aside>
    </ResizablePanel>
  </ResizablePanelGroup>
  ```

  - **`autoSaveId="cockpit-shell"`** — the library writes panel sizes to `localStorage` keyed by this id and restores them on next mount. Per-browser persistence; no server / user-prefs change.
  - **`minSize` floors** — chart 18%, body 35%, Rx 22%. Drag-resize can't go below these. Collapse via `collapsedSize={5}` is a discrete state, not a degenerate drag.
  - **`collapsible` + `collapsedSize={5}`** — when the panel API's `panel.collapse()` is called (or the user drags below `minSize - threshold`), the panel snaps to 5% width.
  - **Refs (`chartPanelRef`, `rxPanelRef`)** — let our custom collapse buttons drive the panel imperatively.
  - **`onCollapse` / `onExpand`** — sync our local `chartCollapsed` / `rxCollapsed` boolean state so the rail bodies (full vs collapsed-stub) re-render.

### Discrete collapse buttons in rail headers

- [ ] In `<AppointmentChartRail>`'s rail header (post cs-05), the in-flow chevron now drives `chartPanelRef.current?.collapse()` instead of a local boolean callback. Pass the ref down or expose an `onCollapse` prop:

  ```tsx
  <button
    type="button"
    onClick={onCollapse}
    aria-label="Collapse chart"
    aria-keyshortcuts="["
  >
    <ChevronLeftIcon />
  </button>
  ```

  And in `<ConsultationCockpit>`:

  ```tsx
  <AppointmentChartRail
    onCollapse={() => chartPanelRef.current?.collapse()}
    …
  />
  ```

- [ ] Symmetric change for `<RxWorkspace>` — add an in-flow collapse button in its header, wired to `rxPanelRef.current?.collapse()`. cs-05's parity audit noted Rx may already have something close; if not, this task adds it.

### Collapsed-state stubs

- [ ] When `chartCollapsed === true`, the chart column renders a `<RailCollapsedStub side="left" onExpand={() => chartPanelRef.current?.expand()} />`. The stub is a 60px-wide vertical band with:
  - A chevron-right icon at the top, clickable to expand.
  - `aria-label="Expand chart"`.
  - Optionally a vertical-text label like "Chart" if the design wants visual confirmation of which rail is collapsed.

- [ ] Symmetric `<RxRailCollapsedStub onExpand={…} />` on the Rx side. **This stub replaces `<RxRailToggle>`** — `<RxRailToggle>` itself is deleted.

### Delete `<RxRailToggle>`

- [ ] Delete `frontend/components/consultation/cockpit/RxRailToggle.tsx` (and its test file if it has one).
- [ ] Remove all imports / call sites in `<ConsultationCockpit>`.

### Hotkey wiring

- [ ] In `useCockpitHotkeys.ts`, `[` and `]` continue to toggle the chart / Rx rails. Implementation:
  - Either `[` is bound to call `chartPanelRef.current?.[chartCollapsed ? 'expand' : 'collapse']()`.
  - Or, simpler: bind `[` to `setChartCollapsed(c => !c)` and let the `onCollapse` / `onExpand` callbacks reconcile. Pick the path that doesn't require the ref to be passed into the hook (avoid prop-drilling refs).
- [ ] Verify in `useCockpitHotkeys.test.ts` — the hotkey binding test still passes.

### Persistence works

- [ ] In dev: open the cockpit. Drag the chart-rail handle to ~30% width. Refresh the page. The chart rail still renders at ~30% width.
- [ ] Inspect `localStorage` — there should be a key like `react-resizable-panels:cockpit-shell` containing the panel sizes JSON.
- [ ] Bump the `autoSaveId` to `cockpit-shell-v2` if you ever change the panel structure (count, order). For this task, `cockpit-shell` is correct.

### Scroll-position preservation

- [ ] Scroll the chart rail down 200px. Click the chart collapse button. Click expand. The chart rail's `scrollTop` is preserved (200px).
- [ ] Same for the Rx column.
- [ ] Hint: each column's `<aside>` (the `overflow-y-auto` container) keeps its own `scrollTop`. The panel collapse only changes width; the scroll container is untouched. Confirm this is the case.

### A11y

- [ ] `<ResizableHandle withHandle>` exposes itself as a `role="separator"` with `aria-orientation="vertical"` (the library does this by default). Verify in DevTools.
- [ ] Keyboard users can resize the panels: focus a handle (Tab to it), arrow-left / arrow-right to resize. (Library default behaviour.)
- [ ] Each collapse button has a meaningful `aria-label` and `aria-keyshortcuts`.

### Tests

- [ ] Add `frontend/components/consultation/__tests__/ConsultationCockpit.resize.test.tsx`:
  - Mount the cockpit on `lg+`. Assert three `<ResizablePanel>` siblings + two `<ResizableHandle>` separators.
  - Click the chart-rail collapse button. Assert `chartCollapsed === true` (or the panel's collapsed state via the panel ref's `getCollapsed()` method).
  - Click expand. Assert it's expanded again.
- [ ] **`useCockpitHotkeys.test.ts`** — update if needed; `[` / `]` test still passes.
- [ ] **`cockpit-state.test.ts`** — must stay green (the state machine is unaffected).
- [ ] **`ConsultationCockpit.shell.test.tsx`** (from cs-07) — stays green.

### Manual verification

- [ ] Drag the left handle. The chart rail resizes. The body / Rx columns reflow.
- [ ] Drag the left handle below `minSize`. The library snaps the panel to `collapsedSize={5}` and `onCollapse` fires.
- [ ] Click the in-flow chart collapse button. Same effect.
- [ ] Press `[`. Same effect.
- [ ] Press `[` again (or click expand on the stub). Chart rail expands back to its previous width (panel API restores from before-collapse).
- [ ] Refresh the page. Widths persist.

---

## Out of scope

- **Mobile / tablet (`<lg`)** — never gets the resize behaviour. Page-scroll layout stays.
- **Drag-reorder of columns** — fixed order, LTR.
- **Vertical resize within a column** — never.
- **Custom resize-handle styling beyond shadcn defaults** — file a polish follow-up if needed.
- **Slimming `<ReadyCard>` and Rx section nav** — Phase C (cs-10, cs-11).
- **Migrating `cockpit-state.test.ts` to Vitest** — separate test-infra task; out of this batch.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~80 LOC delta — wrap shell, add refs, add collapse handlers).
- `frontend/components/ehr/AppointmentChartRail.tsx` (~10 LOC — collapse button onClick wired to ref-based collapse).
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (~15 LOC — add an in-flow collapse button if not already present).
- `frontend/hooks/useCockpitHotkeys.ts` (~5 LOC — `[` / `]` route to new handlers).

**Deleted:**
- `frontend/components/consultation/cockpit/RxRailToggle.tsx`.
- `frontend/components/consultation/cockpit/__tests__/RxRailToggle.test.tsx` (if present).

**New:**
- `frontend/components/consultation/cockpit/RailCollapsedStub.tsx` (~30 LOC — small reusable stub for both sides; can be inline if preferred, but a separate file is cleaner).
- `frontend/components/consultation/__tests__/ConsultationCockpit.resize.test.tsx` (~80 LOC).

---

## Notes / open decisions

1. **Why not use the panel's `collapsed` prop as the source of truth?** The library supports both controlled and uncontrolled. In our case, our local state (`chartCollapsed`) drives the rendering of the *body* (full content vs. collapsed stub), and the panel's collapsed state drives the *width*. Using `onCollapse` / `onExpand` to sync the two is the simplest pattern; trying to make our state THE source forces controlled mode and complicates the resize-drag-into-collapse flow.
2. **Why `collapsedSize={5}` and not `0`?** A `0`-width panel disappears entirely; the user has no way to expand it again unless we put the expand button somewhere outside the panel. `5%` (~60px) gives the collapsed stub enough room for an expand chevron + a thin vertical divider. Industry-standard pattern.
3. **What if the user drags both side rails to their `minSize` simultaneously?** The body column shrinks to `100% - 18% - 22% = 60%`. That's still bigger than its `minSize={35}`, so it works. If we ever change body's minSize to something larger (say 50%), the side rails' minSizes would need to add to ≤50%.
4. **Panel widths persist per-browser, not per-doctor.** Server-side persistence (so the doctor's preferred widths follow them across browsers) is a Phase-D nice-to-have. For now, `localStorage` is fine — most doctors stay in one browser per workstation.
5. **What about the resize handle visually overlapping the rail headers?** The `<ResizableHandle>` is `1px` wide between panels; it sits between adjacent panels' content (which is each `aside` with its own border). No overlap concern at the standard widths.
6. **Why an `aria-keyshortcuts` instead of relying on the hotkey hook only?** AT users (screen readers) discover keybindings via `aria-keyshortcuts`. The hook handles the actual key event; the attribute is for discoverability.

---

## References

- **`react-resizable-panels` imperative API:** https://github.com/bvaughn/react-resizable-panels#imperative-api
- **shadcn `Resizable` docs:** https://ui.shadcn.com/docs/components/resizable
- **Affected files:**
  - `frontend/components/consultation/ConsultationCockpit.tsx`
  - `frontend/components/ehr/AppointmentChartRail.tsx`
  - `frontend/components/consultation/cockpit/RxWorkspace.tsx`
  - `frontend/hooks/useCockpitHotkeys.ts`
- **Predecessors:** [`cs-06`](./task-cs-06-add-resizable-panels-dep.md), [`cs-07`](./task-cs-07-cockpit-shell-fixed-height.md).
- **Stitched test file:** `ConsultationCockpit.resize.test.tsx` complements cs-07's `ConsultationCockpit.shell.test.tsx`.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Done (2026-05-10)

---

## Implementation notes (2026-05-10)

- **react-resizable-panels v4 reality vs spec:** the cs-08 spec was written for v3 props (`direction`, `autoSaveId`, `onCollapse`, `onExpand`, `ref`). The repo ships v4 (4.11.0) which renamed/re-shaped these:
  - `direction` → `orientation`.
  - `ref` → `panelRef` (Panel) / `groupRef` (Group).
  - `onCollapse` / `onExpand` are gone. Collapse is detected via `onResize` against `collapsedSize` threshold.
  - `autoSaveId` is gone. Persistence is hand-rolled via `groupRef.current.setLayout(saved)` post-mount + `onLayoutChanged` callback writing to `localStorage` under `react-resizable-panels:cockpit-shell` (and `cockpit-shell-walkin` for the two-pane walk-in variant). This matches the spec's localStorage key naming.
- **Hydration-safe restore:** the saved layout is intentionally NOT applied via `defaultLayout` because the SSR vs client first-paint difference would cause a hydration mismatch on panel `flex-grow` styles. Instead a `useEffect` calls `groupRef.current.setLayout(saved)` after mount.
- **Hooks ordering:** the desktop-shell hooks (`useEffect` for restore, `handleLayoutChanged`, `handleChartResize`, `handleRxResize`) live ABOVE the `if (isMobile) return …` early return so React's rules-of-hooks hold for both branches.
- **`data-testid` quirk:** v4 forcibly sets `data-testid` on the panel/group div from the `id` prop, overriding any explicit testid. The fix:
  - Outer `<div data-testid="cockpit-shell-desktop">` wraps the group (the `cs-07` shell test still passes).
  - Panel ids are named `cockpit-col-chart` / `cockpit-col-body` / `cockpit-col-rx` so the auto-derived testids match the `cs-07` expectations.
- **Walk-in case:** when `!appt.patient_id`, the chart panel + first separator are skipped and the layout uses a separate localStorage key (`cockpit-shell-walkin`) so the saved widths don't fight between the two variants. The body's `defaultSize` is bumped to 74% in the two-pane case to match the freed space.
- **Hotkey wiring:** `useCockpitHotkeys` accepts `onToggleChartRail` / `onToggleRxRail`; `[` and `]` are bound there with skip-when-modifier-held semantics so `Ctrl+[/]` browser navigation isn't hijacked.
- **`<RxRailToggle>` deleted.** Its collapsed view is replaced by `<RailCollapsedStub side="right">`. Its expanded header is replaced by an in-flow chevron at the right end of `<RxWorkspace>`'s sticky chip strip (cs-08 added an `onCollapse?` prop).
- **Tests:** `ConsultationCockpit.resize.test.tsx` mocks the `@/components/ui/resizable` primitives with stub `MockPanelHandle` so `panel.collapse()/expand()/isCollapsed()` work in jsdom without DOM measurement. The `ConsultationCockpit.shell.test.tsx` was updated to drop the deleted `<RxRailToggle>` mock and to mock the resizable primitives so the existing structural assertions still pass.
