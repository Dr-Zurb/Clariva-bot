# cv3p-01 — Anchored chrome: docks outside the tree + DnD context, footer-sends-after-drag, leaf-anchored empty-state

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 3 — safety + platform](../plan-p3-cockpit-v3-platform-batch.md) |
| **Wave** | 1 (Lane A — parallel with cv3p-02) |
| **Depends on** | Phase 1 (docks + shell) + Phase 2 (DnD that makes reshaping real) |
| **Blocks** | cv3p-03 (shares `CockpitV3Shell`), cv3p-04 (gate) |
| **Size** | **M** |
| **Model** | **Auto** (optional Opus close-gate after this task) |
| **Decision locks** | v3-DL-6, v3-DL-8, P0-DL-3, P0-DL-4, P3-DL-1, P3-DL-2 |
| **R-item** | R-CHROME3 |

---

## Objective

**Prove and harden that the clinical-safety chrome survives every drag-built arrangement** — the single highest-risk promise in the program (V3-R2: "you reshaped and the Send button vanished"). The architecture is already in place; this task makes it *provable*:

1. **Docks are consult-scoped, outside the tree AND the DnD context.** `SafetyStickyStrip` (top) + `PlanActionFooter` (bottom) render exactly once as `shrink-0` siblings of the canvas, **outside** `<CockpitDndContext>` — already structurally true in `CockpitV3Shell` (L134/L149), so they can never be dragged, tabbed, hidden, or become a drop target. Add stable test hooks + assert it (P3-DL-1).
2. **The footer still *sends* after a re-parent.** After Phase-2 drags reshape the layout (Plan → left column; Rx tabbed under Snapshot; Investigations split out), the docked `PlanActionFooter` still reads live `useRxFormActions` and its "Send Rx & finish" handler fires — because the providers are page-root, not in the tree. Prove it.
3. **The safety strip is unhideable + always pinned.** No drag/tab/close path removes or relocates it; it pins to the shell top regardless of where `plan` lives; a drug/allergy clash surfaces it.
4. **Visual chrome travels with its pane.** The chart-rail empty-state rides the `snapshot` pane's `render` (leaf-anchored in `templates.tsx`); verify it renders in v3 and travels when `snapshot` is dragged/tabbed/split (P3-DL-2).
5. **Docks on a blank canvas + across states.** Strip + footer render even before any pane is added (empty-state), and behave across `live` / `ended` / `terminal`. `body`-during-`live` guard intact (v3-DL-6).

This is **verification + minimal hardening (test hooks)**, not a rebuild — the docks, provider lift (pane-freedom P4-DL-2), and leaf-anchor (P4-DL-3) all already exist. The deliverable is the proof suite + any gap-fill it surfaces.

## Why this task

Phase 2 made reshaping routine, which means the program's worst failure mode — a layout edit that silently removes the control that *ends the consult* — is now reachable for real. Pane-freedom Phase 4 (cpfg-01) solved this for the old shell by lifting the chrome to shell docks + page-root providers; v3 inherits that, but **inheritance is not proof**. Until a test drags `rx` out of its default leaf and asserts the docked footer still fires "Send Rx & finish", we have not earned the flag-flip. This task earns it, and is consult-critical enough to warrant the optional Opus close-gate.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit (thin / additive)** — add stable test hooks to the dock wrappers (`data-testid="cockpit-v3-safety-dock"` / `"cockpit-v3-action-dock"`); confirm both render unconditionally on desktop (incl. blank canvas) and stay **outside** `<CockpitDndContext>`. No structural move — the docks are already `shrink-0` siblings (L134/L149). |
| `frontend/components/patient-profile/v3/__tests__/CockpitChrome.reparent.test.tsx` | **New** — the crown-jewel suite: render the v3 shell inside the real Rx providers with a registered send handler; drag `plan`/`rx` to new positions via the engine; assert the docked footer still renders and **fires** the handler; assert the safety strip is present + unhideable; assert docks are not inside the DnD context (no `useDraggable`/droppable on them). |
| `frontend/components/patient-profile/v3/__tests__/CockpitChrome.leafAnchor.test.tsx` | **New** — assert the `snapshot` pane's `render` mounts `ChartRailWithEmptyState`, and that moving `snapshot` (drag/tab) keeps the empty-state with it (the wrapper travels by reference). |

> **No edit to** `templates.tsx`, `PlanActionFooter.tsx`, `SafetyStickyStrip.tsx`, `ChartRailWithEmptyState.tsx`, or `PatientProfilePage.tsx`'s provider stack — they're correct as-is (pane-freedom P4). If a test surfaces a real gap (e.g. a dock conditionally hidden), fix it minimally in `CockpitV3Shell` only and note it in the decision log.

> **Import discipline (P0-DL-4):** model/engine/types via `foundation.ts`. `SafetyStickyStrip` / `PlanActionFooter` / the Rx providers are kept UI/context — import directly (they are not engine internals). **No** import of `Shell.tsx` / `PaneDropOverlay` / `customize-mode-context`.

## Implementation sketch

### CockpitV3Shell — test hooks only (docks already correct)

```tsx
{safetyDock ? (
  <div data-testid="cockpit-v3-safety-dock" className="shrink-0">{safetyDock}</div>
) : null}
<CockpitPalette … className="shrink-0" />
<CockpitDndContext paneById={paneByIdRecord} onDrop={handleDrop} onReorder={handleReorder}>
  <div className="min-h-0 flex-1"><CockpitCanvas … /></div>
</CockpitDndContext>
{actionDock ? (
  <div data-testid="cockpit-v3-action-dock" className="shrink-0">{actionDock}</div>
) : null}
```

The only change is the two `data-testid`s. The docks are **already** outside `<CockpitDndContext>` — this task's job is to lock that with a test, not to re-architect.

### `CockpitChrome.reparent.test.tsx` — footer sends after a re-parent

```tsx
// Mount the shell with a real action dock wired to the bridge provider, and a
// spy send handler registered the way RxPane registers it.
function Harness() {
  const send = vi.fn();
  return (
    <RxFormActionsBridgeProvider>
      <RegisterSend onSend={send} />            {/* calls useRegisterRxFormActions({ send }) */}
      <CockpitV3Shell
        panes={testPanes /* incl. snapshot, plan, rx, investigations */}
        storageKey={uniqueKey()}
        actionDock={<PlanActionFooter … />}      {/* reads useRxFormActions().send */}
        safetyDock={<SafetyStickyStrip … />}
      />
    </RxFormActionsBridgeProvider>
  );
}

// 1. Add plan + rx, then move plan to a far group (engine: dropPaneIntoZone / shell.movePane).
// 2. Assert getByTestId("cockpit-v3-action-dock") still in the document.
// 3. Click "Send Rx & finish" in the dock → expect(send).toHaveBeenCalled().
// 4. Tab rx under snapshot (engine: moveLeafBetweenTabs) → footer still fires send.
```

- The point is **provider scope**: because `RxFormActionsBridgeProvider` wraps the page root (not a tree node), the dock reader and the in-tree registrar share one provider no matter where panes land. The test proves the v3 shell sits inside that scope.
- If the kept `PlanActionFooter` needs more context than the harness provides, mirror the minimal provider set from `PlanActionFooter.test.tsx` (kept).

### `CockpitChrome.leafAnchor.test.tsx` — empty-state travels

```tsx
// Build panes from the real template so `snapshot`'s render is the
// ChartRailWithEmptyState-wrapped SnapshotPane.
// 1. Add snapshot → assert the empty-state chrome (chart-rail card) renders.
// 2. Move snapshot into another group / tab it → assert the empty-state still
//    renders with snapshot (leaf-anchored, not group-anchored).
```

### Unhideable safety strip

- Assert there is no affordance to hide/close the safety dock: it has no close button, no `useDraggable`, and is not registered as a droppable. A structural assertion (the dock node is a sibling of `<CockpitDndContext>`, not a descendant) is enough.

## Tests

- [x] **Docks outside the DnD context** → both dock test-ids render; neither is a descendant of the `<CockpitDndContext>` subtree; neither carries drag/drop attributes.
- [x] **Footer sends after move** → after `movePane(plan, …)`, clicking the docked footer fires the registered `send` (provider scope intact).
- [x] **Footer sends after tab-into** → after tabbing `rx` under `snapshot`, the footer still fires `send`.
- [x] **Safety strip pinned + unhideable** → strip renders at the top in default + reshaped layouts; no close/drag path; a simulated safety clash surfaces it.
- [x] **Leaf-anchored empty-state travels** → empty-state renders with `snapshot` after a move/tab.
- [x] **Blank canvas** → both docks render before any pane is added.
- [x] **`body`/`live` guard intact** → `canDragPane("body")` is false during `consultActive`; docks unaffected.
- [x] **No customize / old-shell import** in the touched/new v3 files.

## Acceptance criteria

- [x] `SafetyStickyStrip` + `PlanActionFooter` render once as `shrink-0` docks **outside** the tree and **outside** `<CockpitDndContext>`; never draggable / tabbable / hideable / a drop target (P3-DL-1 / v3-DL-6).
- [x] In ≥3 drag-reshaped arrangements, the docked footer renders and its "Send Rx & finish" handler **fires** (live `useRxFormActions`).
- [x] Safety strip pinned to the shell top regardless of where `plan` lives; surfaces on a clash.
- [x] Chart-rail empty-state travels with `snapshot` (leaf-anchored; P3-DL-2).
- [x] Docks render on a blank canvas and behave across `live` / `ended` / `terminal`; `body`/`live` guard intact.
- [x] Flag off → byte-identical (no change to the flag-off path); v3 edits are additive test hooks only.
- [x] `npx tsc --noEmit` + `npm run lint` clean; both new suites green.

## Out of scope (explicit)

- Persistence / migration / reset → cv3p-02.
- Mobile docks / reachable safety on mobile → cv3p-03 (this task is desktop chrome).
- Any change to `PlanActionFooter` / `SafetyStickyStrip` / `templates.tsx` internals — they're reused unchanged (pane-freedom P4).
- `InvestigationsAutoMerge`'s `@container/middle-bottom` narrow-merge in v3's flat-pane model — capture-inbox (the wrapper is old-shell-only); verify the Plan pane renders, but the responsive merge is a separate follow-up.

## Decision log

- **Verify, don't rebuild.** The docks (Phase 0/1), the page-root provider lift (pane-freedom P4-DL-2), and the leaf-anchor (P4-DL-3) already exist. The risk is regression-under-reshaping, not absence — so the deliverable is a proof suite + test hooks, keeping the diff tiny and the consult-critical path covered.
- **Footer-sends-after-drag is the crown jewel.** It is the concrete form of V3-R2. Asserting the *handler fires* (not just that the node renders) is what proves the provider scope survives a re-parent.
- **Optional Opus close-gate after this task** (per the batch): a human/Opus pass that the footer reads its registrar after `rx`/`plan` move and no arrangement hides the strip — mirrors pane-freedom cpfg-01's close-gate.

## References

- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — docks at L134/L149 (already outside `<CockpitDndContext>`).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — page-root provider stack (~L1248: `RxFormProvider` → `RxSafetyProvider` → `RxFormActionsBridgeProvider`); v3 mount (~L1126).
- [`frontend/components/cockpit/middle/PlanActionFooter.tsx`](../../../../../../frontend/components/cockpit/middle/PlanActionFooter.tsx) + [`__tests__/PlanActionFooter.test.tsx`](../../../../../../frontend/components/cockpit/middle/__tests__/PlanActionFooter.test.tsx) — the footer + its provider harness to mirror.
- [`frontend/components/cockpit/middle/SafetyStickyStrip.tsx`](../../../../../../frontend/components/cockpit/middle/SafetyStickyStrip.tsx) — the strip (reads `useRxSafety()`).
- [`frontend/lib/patient-profile/templates.tsx`](../../../../../../frontend/lib/patient-profile/templates.tsx) — `ChartRailWithEmptyState` on `snapshot`'s `render` (L179–190).
- [Pane-freedom Phase 4](../../../30-05-2026/cockpit-pane-freedom/p4-chrome/plan-p4-cockpit-pane-freedom-chrome-batch.md) — the chrome architecture inherited (P4-DL-1..6).
- Batch: [`plan-p3-cockpit-v3-platform-batch.md`](../plan-p3-cockpit-v3-platform-batch.md) · Order: [`EXECUTION-ORDER-p3-cockpit-v3-platform.md`](./EXECUTION-ORDER-p3-cockpit-v3-platform.md).

---

**Status:** `Done` (2026-05-31). Test hooks on `CockpitV3Shell`; `CockpitChrome.reparent.test.tsx` + `CockpitChrome.leafAnchor.test.tsx` green (17 tests); tsc + lint clean.
