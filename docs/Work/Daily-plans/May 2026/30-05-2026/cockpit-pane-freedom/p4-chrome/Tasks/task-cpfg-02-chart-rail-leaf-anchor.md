# cpfg-02 — Leaf-anchor the chart-rail empty-state to `snapshot` (visual chrome travels)

| | |
|---|---|
| **Batch** | [p4-cockpit-pane-freedom-chrome (Phase 4)](../plan-p4-cockpit-pane-freedom-chrome-batch.md) |
| **Wave / lane** | Wave 2 / lane α (step 0) |
| **Size** | M |
| **Model** | Auto |
| **Depends on** | cpfg-01 |
| **Blocks** | cpfg-03, cpfg-04 |

---

## Objective

Move `ChartRailWithEmptyState` from the `left-column` group's `groupWrapper` to the **`snapshot` leaf's `render`**, so the chart-rail empty-state card **travels with `snapshot`** when a doctor moves it (P4-DL-3). Remove `left-column`'s `groupWrapper` entirely.

At the default layout the empty-state must still appear in the chart rail (visual parity at rest, P4-DL-6).

---

## Why (context)

`ChartRailWithEmptyState` is the one **visual** wrapper (vs the action wrappers cpfg-01 lifted). Today it wraps the whole `left-column` group:

```172:185:frontend/lib/patient-profile/templates.tsx
    hideShellHeader: true,
    render: () => null,
    groupWrapper: (children) => (
      <ChartRailWithEmptyState
        appointmentId={appointmentId}
        patientId={patientId}
        token={ctx.token}
      >
        {children}
      </ChartRailWithEmptyState>
    ),
    children: [
      {
        id: 'snapshot',
```

Because it's a `groupWrapper` on `left-column`, if a doctor drags `snapshot` out of the chart rail, the empty-state card clings to the (now snapshot-less) column instead of following the pane. The empty-state is **visual chrome** — it describes "your chart is empty, add patient context" — so per the vision it should be **leaf-anchored and travel** with its pane, not docked at the shell.

The component is unchanged; only its mount site moves from the group to the `snapshot` leaf.

```35:64:frontend/components/patient-profile/panes/ChartRailWithEmptyState.tsx
export function ChartRailWithEmptyState({
  appointmentId,
  patientId,
  token,
  onAddPatientContext,
  children,
}: ChartRailWithEmptyStateProps): JSX.Element {
  const { signals, isLoading } = useChartRailEmptySignals(patientId, token);
  // …renders <UnifiedChartRailEmptyState> above children when chart is empty…
```

> **Signal scope note:** `useChartRailEmptySignals` reads emptiness across the whole chart (allergies / chronic / problem-list / snapshot / history), not just `snapshot`. Anchoring the card to `snapshot` keeps the *signal* correct (it still reflects the whole chart) while making the *card* ride with `snapshot` — the canonical chart pane. This is the intended behaviour; see Decision log.

---

## Files to touch

| File | Change |
|---|---|
| `frontend/lib/patient-profile/templates.tsx` | Remove `left-column`'s `groupWrapper`; wrap the `snapshot` leaf's `render` output in `<ChartRailWithEmptyState>`. |

`ChartRailWithEmptyState.tsx` is **unchanged**.

---

## Implementation

### Step 1 — Remove `left-column`'s `groupWrapper`

Delete the `groupWrapper` field from the `left-column` `PaneDefinition`. The group keeps `hideShellHeader: true`, `render: () => null`, and its `children`. (Confirm nothing else references the `appointmentId` / `patientId` captured only for this wrapper; if they were captured solely for the empty-state they move with it to the `snapshot` render below.)

### Step 2 — Wrap the `snapshot` leaf's `render`

Find the `snapshot` child definition (currently the first child of `left-column`, ~line 186+). Wrap its rendered body:

```tsx
{
  id: 'snapshot',
  title: 'Snapshot',
  icon: PANE_ICONS['snapshot'],
  hideShellHeader: true,
  render: () => (
    <ChartRailWithEmptyState
      appointmentId={appointmentId}
      patientId={patientId}
      token={ctx.token}
    >
      <SnapshotPane /* …existing props… */ />
    </ChartRailWithEmptyState>
  ),
  // …rest unchanged…
},
```

Use exactly the props the wrapper had on the group (`appointmentId`, `patientId`, `ctx.token`) — they're already in scope in the template factory. The `<SnapshotPane>` body is whatever `snapshot.render()` returns today; move that inside the wrapper's children.

> **Empty-state-then-content layout:** `ChartRailWithEmptyState` renders `<UnifiedChartRailEmptyState>` above its children in a `flex h-full min-h-0 flex-col`. Wrapping the leaf body preserves that — the empty card shows above the snapshot pane's content when the chart is empty, and just the snapshot when it isn't.

### Step 3 — Default-layout parity check

At the default (unreshaped) telemed templates, `snapshot` sits at the top of the chart rail, so the empty card appears at the top of the column exactly as before. Eyeball the default layout against Phase 3 — the empty state should look the same at rest (P4-DL-6). The only behavioural change is on reshape: drag `snapshot` elsewhere and the card follows it.

---

## Tests

1. **`templates.test.ts`** — assert `left-column` no longer has a `groupWrapper`; assert the `snapshot` leaf's `render()` output contains `ChartRailWithEmptyState` (query by a stable testid/role from `UnifiedChartRailEmptyState`, or by mocking `useChartRailEmptySignals` to force the empty branch and asserting the card renders).
2. **`ChartRailWithEmptyState.test.tsx`** — unchanged; confirm still green.
3. **Travel check (can fold into cpfg-03's re-parent suite)** — render the tree with `snapshot` moved to a non-left container; assert the empty card renders inside `snapshot`'s container, not the old `left-column` position.

Run:

```bash
cd frontend
npx tsc --noEmit
npm test -- lib/patient-profile/__tests__/templates.test.ts \
  components/patient-profile/panes/__tests__/ChartRailWithEmptyState.test.tsx
```

---

## Acceptance criteria

- [x] `left-column`'s `groupWrapper` removed (P4-DL-3).
- [x] `ChartRailWithEmptyState` wraps the `snapshot` leaf's `render`, with the same `appointmentId` / `patientId` / `token` props.
- [x] Default layout: empty-state still appears at the top of the chart rail (parity, P4-DL-6).
- [x] Moving `snapshot` to another container makes the empty card travel with it.
- [x] `chart_density_landed` telemetry still fires once (the component still mounts).
- [x] `npx tsc --noEmit` + targeted tests clean.

---

## Out of scope

- The action-chrome lift → cpfg-01 (done).
- The invariant guard + full re-parent regression suite → cpfg-03.
- Re-scoping `useChartRailEmptySignals` to only snapshot's data → out (the cross-chart signal is intentional).
- Any change to `UnifiedChartRailEmptyState` / the empty-signals hook.

---

## Decision log

- **Anchor to `snapshot`, not a new "chart group" concept.** `snapshot` is the canonical primary chart pane; anchoring there is the simplest leaf that satisfies "travels with its pane" without inventing a new grouping primitive.
- **Keep the cross-chart signal.** The card describes the whole chart's emptiness; the hook stays as-is. Only the card's *position* becomes leaf-bound. If product later wants the card to reflect only snapshot's data, that's a separate change (capture-inbox if it comes up).
- **No `groupWrapper` left on `left-column`.** After this task, `left-column` is a plain group; the only surviving `groupWrapper` in the codebase is `middle-bottom`'s responsive `<div>` (P4-DL-4), which cpfg-03 will guard.

---

## References

- [Phase 4 plan](../plan-p4-cockpit-pane-freedom-chrome-batch.md) · [Execution order](./EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md)
- [`frontend/lib/patient-profile/templates.tsx`](../../../../../../../frontend/lib/patient-profile/templates.tsx)
- [`frontend/components/patient-profile/panes/ChartRailWithEmptyState.tsx`](../../../../../../../frontend/components/patient-profile/panes/ChartRailWithEmptyState.tsx)
- Prev: [cpfg-01](./task-cpfg-01-action-chrome-shell-docks.md) · Next: [cpfg-03](./task-cpfg-03-groupwrapper-invariant-and-reparent-tests.md)
