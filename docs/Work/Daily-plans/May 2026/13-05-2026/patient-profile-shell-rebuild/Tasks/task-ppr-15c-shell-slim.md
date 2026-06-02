# Task ppr-15c: `<PatientProfileShell>` slim + mount toggle bar

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 4.5, Lane α step 2 — **M, ~1.5h**

---

## Task overview

This is the **visible cut-over** task for the toggle-bar redesign.

ppr-15a renamed schema fields. ppr-15b shipped `<PaneToggleBar>` standalone. ppr-15c does the actual replacement:

1. **Slim down `<PatientProfileShell>`** — delete the strip+chevron rendering, the absorber math, the spacer panel, `<DefaultCollapsedStub>`, and the drag-to-collapse threshold logic. The shell now only renders **visible** panes.
2. **Slim down `<PaneHeader>`** — remove the chevron entirely. Header becomes `[grip] Title` only.
3. **Add a `centerSlot` prop to `<CockpitHeader>`** — a slot in the middle of the header for the toggle bar. Default `null` so v1 (which still mounts `<CockpitHeader>`) is unaffected.
4. **Mount `<PaneToggleBar>`** in `<PatientProfilePage>` and pass it to `<CockpitHeader>`'s new `centerSlot`.
5. **Add `icon` to each pane** in the `panes` array in `<PatientProfilePage>`.
6. **Restore-on-show:** when a hidden pane is re-toggled visible, restore its persisted `sizePct` and rebalance the others to make `sum(visible) = 100`. This lives in the shell's `setPaneHidden` flow OR a `useEffect` in the shell that watches `paneOrder` + `paneState`.

After ppr-15c: cells 4-9 from ppr-11's failure log are **structurally impossible**. There are no strips to drag-lock-bug, no chevrons to point the wrong way, no spacer panel to leak width into a gap, no cascade math to mis-compute.

**Estimated time:** ~1.5h.

**Status:** Pending.

**Hard deps:** ppr-15a, ppr-15b.

**Source:** Mid-batch amendment in [plan-patient-profile-shell-rebuild-batch.md § Mid-batch amendment](../plan-patient-profile-shell-rebuild-batch.md#mid-batch-amendment-toggle-bar-redesign-ppr-15).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — the file being slimmed (~190 LOC out, ~10 LOC in).
- [`frontend/components/patient-profile/PaneToggleBar.tsx`](../../../../../../frontend/components/patient-profile/PaneToggleBar.tsx) — the component being mounted (output of ppr-15b).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — where the wiring lands.
- [`frontend/components/consultation/cockpit/CockpitHeader.tsx`](../../../../../../frontend/components/consultation/cockpit/CockpitHeader.tsx) — getting a new `centerSlot` prop.

**Estimated turns:** 5-7 turns. Mostly DELETE; some new mount wiring; one resize-rebalance helper.

---

## Acceptance criteria

### Phase 1 — `<PatientProfileShell>` slim-down

In [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx):

- [ ] **DELETE** these top-level functions / constants:
  - `findAbsorber` (~16 LOC)
  - `buildShellLayoutMap` + its `BuildLayoutInput` interface (~50 LOC)
  - `getCollapsedSizePct`, `COLLAPSED_SIZE_PX`, `MIN_COLLAPSED_SIZE_PCT` (~10 LOC)
  - `DefaultCollapsedStub` component (~33 LOC)
  - `SHELL_SPACER_ID` export (and any internal use)

- [ ] **DELETE** these from `<PaneHeader>`:
  - The `canCollapse` / `isCollapsed` / `onToggleCollapse` props.
  - The chevron `<button>` and its `<ChevronLeft>` / `<ChevronRight>` icons.
  - The unused `cn` conditional `(isDragging && "opacity-40")` stays — drag affordance.

  After: `<PaneHeader>` is just `[grip] Title`. ~30 LOC down to ~25 LOC.

- [ ] **DELETE** from `<DesktopShell>`:
  - The `panelRefs` ref + `groupRef` ref + `containerRef` ref + `containerWidth` state + the ResizeObserver `useLayoutEffect` (entire block).
  - The `collapsedSizePct` computed value.
  - The `handleToggleCollapse` callback (its `setLayout(map)` call relied on the deleted absorber math).
  - The `COLLAPSED_THRESHOLD_PX_LOCAL` constant + the `isLibraryCollapsed` branch in `handleResize`.
  - The `anyCollapsed` memo.
  - The trailing spacer `<ResizableHandle>` + `<ResizablePanel>` (the two trailing children of the panel-group children array).
  - The collapsed-render branch (`isCollapsed ? pane.collapsedRender ? ...`) inside the JSX. Replace with the expanded-render path always.

- [ ] **REPLACE** the JSX panel mapping:

  ```tsx
  {[
    ...visiblePaneOrder.flatMap((paneId, i) => {
      const pane = paneById[paneId];
      if (!pane) return [];
      const sizePct =
        paneState[paneId]?.sizePct ??
        pane.naturalSizePct ??
        DEFAULT_NATURAL_SIZE_PCT;
      const minSize = pane.minSizePct ?? DEFAULT_MIN_SIZE_PCT;
      const items: React.ReactNode[] = [];
      if (i > 0) {
        items.push(<ResizableHandle key={`shell-handle-${i}`} withHandle />);
      }
      items.push(
        <ResizablePanel
          key={`shell-pane-${pane.id}`}
          id={pane.id}
          defaultSize={sizePct}
          minSize={minSize}
          onResize={(size) => handleResize(pane.id, size)}
          className="h-full overflow-hidden bg-background"
          data-pane-id={pane.id}
        >
          <div className="flex h-full min-h-0 flex-col">
            <PaneHeader paneId={pane.id} title={pane.title} />
            <div className="min-h-0 flex-1 overflow-auto">{pane.render()}</div>
          </div>
        </ResizablePanel>,
      );
      return items;
    }),
  ]}
  ```

  Where `visiblePaneOrder = paneOrder.filter(id => !paneState[id]?.hidden)`.

- [ ] **ADD** the `getVisiblePanes` helper (~8 LOC):

  ```ts
  /**
   * Filter `paneOrder` down to the panes the toggle bar has marked visible.
   * Hidden panes are removed from the layout entirely (no strip, no slot).
   */
  function getVisiblePaneOrder(
    paneOrder: string[],
    paneState: Record<string, PaneRuntimeState>,
  ): string[] {
    return paneOrder.filter((id) => !paneState[id]?.hidden);
  }
  ```

- [ ] **REWRITE** `handleResize` (~15 LOC):

  ```ts
  const handleResize = useCallback(
    (paneId: string, size: PanelSize) => {
      // No more collapse-snap logic. Resize callback only persists size.
      const sizePct = size.asPercentage;
      if (Number.isFinite(sizePct)) setPaneSize(paneId, sizePct);
    },
    [setPaneSize],
  );
  ```

  No more freeze-on-collapse rule (no collapsed state to freeze around).

- [ ] **REWRITE** the empty-state branch — when `visiblePaneOrder.length === 0`:

  ```tsx
  if (visiblePaneOrder.length === 0) {
    return (
      <div
        ref={containerRef}
        data-testid="patient-profile-shell-empty"
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/20 p-8 text-center",
          className,
        )}
      >
        <ArrowUp className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Pick a panel from the toggle bar above to get started.
        </p>
      </div>
    );
  }
  ```

  Honors Q2 ("if all toggles off, show empty + arrow + friendly note").

- [ ] **UPDATE** the panel group's `id` to use the visible order signature (so the library re-runs its main effect on visibility changes too):
  ```ts
  const groupId = `${storageKey}#${visiblePaneOrder.join("-")}`;
  ```

### Phase 2 — `<PatientProfileShellHandle>` API trim

- [ ] In the same file, simplify the `PatientProfileShellHandle` interface:

  ```ts
  export interface PatientProfileShellHandle {
    applyLayout: (layout: PatientProfileLayout) => void;
    paneOrder: string[];
    paneState: Record<string, PaneRuntimeState>;
    setPaneHidden: (id: string, hidden: boolean) => void;
  }
  ```

  Behaviour change: `setPaneCollapsed` (renamed in ppr-15a) is now `setPaneHidden` (the strip-collapse semantic is gone — it's now true hide/show).

### Phase 3 — Restore-on-show + auto-rebalance

- [ ] When a pane transitions from `hidden: true` to `hidden: false`, the layout must still sum to 100%. Implement in `<DesktopShell>`:

  ```ts
  // Whenever the visible pane set changes, push a fresh layout to the panel
  // group: each visible pane gets its persisted sizePct (or naturalSizePct
  // fallback), then we normalise so they sum to 100. The library's own
  // resize math handles the visual transition; this just supplies the
  // canonical target.
  const visibleKey = visiblePaneOrder.join(",");
  useEffect(() => {
    if (visiblePaneOrder.length === 0) return;
    const targets: PanelGroupLayout = {};
    let sum = 0;
    for (const id of visiblePaneOrder) {
      const sizePct =
        paneState[id]?.sizePct ??
        paneById[id]?.naturalSizePct ??
        DEFAULT_NATURAL_SIZE_PCT;
      targets[id] = sizePct;
      sum += sizePct;
    }
    if (sum > 0) {
      // Normalise to sum=100 without mutating persisted sizePct.
      for (const id of visiblePaneOrder) targets[id] = (targets[id] / sum) * 100;
    }
    groupRef.current?.setLayout(targets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);
  ```

  Restore `groupRef` (it was deleted earlier — re-add the simpler version, no `panelRefs` needed).

- [ ] Acceptance: toggle off Rx → Chart and Body grow proportionally to fill 100%. Toggle Rx back on → Chart and Body shrink back, Rx restores to its persisted size.

### Phase 4 — `<CockpitHeader>` `centerSlot` prop

- [ ] In [`frontend/components/consultation/cockpit/CockpitHeader.tsx`](../../../../../../frontend/components/consultation/cockpit/CockpitHeader.tsx):
  - Add an optional prop `centerSlot?: React.ReactNode` to `CockpitHeaderProps`.
  - In the header's main desktop row layout, add a center column between the existing left-side (patient info) and right-side (status + Layout dropdown + kebab) groups. Pattern:

    ```tsx
    <div className="flex w-full items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">{/* left side — existing patient info */}</div>
      {centerSlot ? <div className="flex min-w-0 shrink items-center justify-center">{centerSlot}</div> : null}
      <div className="ml-auto flex shrink-0 items-center gap-2">{/* right side — existing status + actions */}</div>
    </div>
    ```

  - When `centerSlot` is omitted (v1 callsites), the header layout falls back to the existing 2-group layout — no visual change for v1.

- [ ] Lint check: `<CockpitHeader>` is a 🟢 component shared between v1 and v2. The v1 callsite (`ConsultationCockpit`) does NOT pass `centerSlot`. Verify v1 still renders identically.

### Phase 5 — Wire toggle bar in `<PatientProfilePage>`

- [ ] In [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx):
  - Import `PaneToggleBar`, the icons (`Stethoscope`, `MessageSquare`, `Pill` — or pick the design-system equivalents), and the `setPaneHidden` from the shell handle.
  - Add `icon: Stethoscope` (etc.) to each entry in the `panes` array.
  - Add a stable `handleToggleHidden` callback:
    ```ts
    const handleToggleHidden = useCallback((paneId: string) => {
      const wasHidden = shellPaneState[paneId]?.hidden ?? false;
      shellRef.current?.setPaneHidden(paneId, !wasHidden);
    }, [shellPaneState]);
    ```
  - Add a stable `handleReorder` callback that forwards to the shell's `reorderPane` (currently called via the shell's drag-end handler — need to expose it on the handle, or re-fire via a synthesised drag event). **Simplest path:** expose `reorderPane: (fromId, toId) => void` on `PatientProfileShellHandle` and call from here.
  - Pass `<PaneToggleBar panes={panes} paneOrder={shellPaneOrder} paneState={shellPaneState} onToggleHidden={handleToggleHidden} onReorder={handleReorder} />` into `<CockpitHeader>`'s new `centerSlot` prop.

### Phase 6 — Tests + cleanup

- [ ] **DELETE** these tests (they exercise behaviour that no longer exists):
  - `frontend/components/patient-profile/__tests__/Shell.test.tsx` cases that test absorber math, spacer panel, drag-to-collapse, chevron click, all-collapsed all-strips. Keep ONLY: drag-reorder, resize persistence, mobile branch (still uses `<MobileShell>`), `applyLayout` round-trip.
  - `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` and `ConsultationCockpit.resize.test.tsx` if any cases were specifically about v2 behaviour. **Keep** anything that tests v1 behaviour (`ConsultationCockpit` is still in production until ppr-14).

- [ ] **ADD** new test cases to `Shell.test.tsx`:
  1. **Hidden pane is filtered out of the rendered layout** — set `paneState.rx.hidden = true`, assert only chart + body panels render.
  2. **Toggling all panes hidden renders the empty-state component** — assert `data-testid="patient-profile-shell-empty"` is present and the friendly text is rendered.
  3. **Re-showing a hidden pane restores its persisted size + rebalances others** — assert `groupRef.setLayout` is called with the restored size and the other panes shrink proportionally.

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean — including the ppr-01 ESLint zone (no forbidden imports in `Shell.tsx`).
- [ ] `pnpm --filter frontend vitest run components/patient-profile/` — all green.

### Manual smoke

- [ ] Open `/dashboard/appointments/[id]/v2`. Toggle bar appears in the center of `<CockpitHeader>` with three icon+label buttons.
- [ ] All three buttons in the visible state. Click the Prescription pill → Rx pane disappears, Chart + Body fill the viewport. No gap to the right edge.
- [ ] Click the Patient chart pill → Chart pane disappears too. Body fills the entire viewport.
- [ ] Click the Consultation pill → empty state with arrow + "Pick a panel..." note.
- [ ] Click Patient chart pill back on → Chart returns at its persisted size. Body shrinks proportionally.
- [ ] Click Consultation pill back on → Body returns. Chart and Consultation share the viewport.
- [ ] Click Prescription pill back on → all three return at their persisted sizes.
- [ ] Drag a separator between Chart and Body → resize works; Body/Rx persist.
- [ ] Drag the Patient chart icon onto the Prescription icon in the toggle bar → both panes (and their toggle icons) swap order.
- [ ] Drag a column header in the shell → both panes (and their toggle icons) swap order.
- [ ] Reload page → toggle state, order, and sizes all persist.
- [ ] No console errors. No hydration warnings.

---

## Out of scope

- **Hotkey rewiring (`Cmd/Ctrl+1/2/3`).** ppr-15d.
- **Preset model B (apply auto-toggles).** ppr-15d.
- **Live-consult guard on Consultation toggle.** ppr-15e.
- **Removing the `RailCollapsedStub` / `CollapsedChartRail` / `CollapsedRxRail` files.** They're still used by v1 — wait until ppr-14 deletes the v1 shell.
- **Removing the `collapsedRender` field from `PaneDefinition`.** Defer to ppr-16 (post-batch cleanup) once we're sure nothing else needs it.
- **Mobile changes.** `<MobileShell>` keeps the current behaviour; mobile uses `<MobilePillBar>` (unchanged).

---

## Files expected to touch

**Modified:**
- `frontend/components/patient-profile/Shell.tsx` (~−190 LOC + ~+30 LOC)
- `frontend/components/patient-profile/PatientProfilePage.tsx` (~+25 LOC for icon + handlers + `centerSlot` wiring)
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~+10 LOC for `centerSlot` prop + JSX slot)
- `frontend/components/patient-profile/__tests__/Shell.test.tsx` (delete obsolete cases, add 3 new)

**New:** none.

**Deleted (test files):** none — only sub-cases inside existing test files.

---

## Notes / open decisions

1. **Why keep `<DefaultCollapsedStub>` source code in git history rather than `git rm` the symbol straight away?** It's untyped after the prop deletion (no longer references anything). Just delete it — git history has it if we ever need to resurrect.
2. **Why not delete `RailCollapsedStub` / `CollapsedChartRail` / `CollapsedRxRail` now?** They're imported by v1's `<ConsultationCockpit>` until ppr-14 deletes v1. Removing them now would break v1.
3. **Why expose `reorderPane` on the shell handle in Phase 5?** The toggle bar's drag fires `onReorder(fromId, toId)`. Page calls `shellRef.current?.reorderPane(fromId, toId)`. Cleanest API; mirrors `setPaneHidden`.
4. **Restore-on-show rebalancing — does it stomp on user's manual resize?** No. The `useEffect` runs on `visibleKey` changes only (visibility-set changes), not on size-only changes. Manual resize only fires `setPaneSize`, which doesn't change `visibleKey`.
5. **What happens if the persisted `sizePct` for a hidden pane is stale (older than the current viewport)?** It's a percentage — viewport-independent. Fine.
6. **What about the current `?cockpitDbg=1` debug instrumentation?** None of it is in `<PatientProfileShell>` (it lives in v1's `<ConsultationCockpit>`). No change needed here.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** Mid-batch amendment Q2 (empty state UX), Q4 (size memory), Q5 (no `collapsed` field).
- **Prior art:** `<ResizablePanelGroup>` setup from [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) (the parts being kept).
- **Next task:** [`task-ppr-15d-presets-and-hotkeys.md`](./task-ppr-15d-presets-and-hotkeys.md) — fresh chat after ppr-15c is green.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
