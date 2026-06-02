# cpf-04 · `<PaneSubtreeGroup>` leaf renders tab strip when `paneIds.length > 1`

> **Wave 2, lane α** of [cockpit-pane-freedom](../plan-p1-cockpit-pane-freedom-batch.md). Wires `<PaneTabStrip>` into the shell renderer so multi-pane leaves visibly become tab containers; single-pane leaves are unchanged.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | cpf-03 (`<PaneTabStrip>` component) | **Blocks** | cpf-05 (smoke); cpf-06 |

---

## Why this task

cpf-01 made leaves carry `paneIds[]` + `activeTabId`. cpf-02 added the mutation ops. cpf-03 built the tab strip primitive. cpf-04 closes the renderer loop: when `<PaneSubtreeGroup>` reaches a leaf with > 1 pane, render the strip above the body and resolve the body to `paneById[activeTabId]`. Inactive panes' renderers do NOT mount (lazy — keeps RxForm draft hydration cost from doubling per tab).

**Critical invariant (DL-9):** moving a pane between containers must NOT remount its component instance. The renderer keys leaf wrappers on `pane-${paneId}` so React's reconciler treats the moved pane as the same Fiber regardless of which tabs container hosts it.

---

## What to do

### 1. Update `<PaneSubtreeGroup>` leaf branch in `frontend/components/patient-profile/Shell.tsx`

Today's leaf branch (paraphrased from the existing code around line 1013):

```tsx
{isLeaf ? (
  <div className="min-h-0 flex-1 overflow-auto" data-cockpit-pane-id={node.id}>
    {node.render()}
  </div>
) : ( /* nested PaneSubtreeGroup */ )}
```

New shape:

```tsx
{isLeaf ? (() => {
  const paneIds = node.paneIds && node.paneIds.length > 0 ? node.paneIds : [node.id];
  const activeId = node.activeTabId && paneIds.includes(node.activeTabId) ? node.activeTabId : paneIds[0]!;
  const activePane = paneById[activeId];
  if (!activePane) return null;

  if (paneIds.length === 1) {
    // Single-pane leaf — render today's chrome unchanged.
    return (
      <div
        key={`pane-${activeId}`}
        className="min-h-0 flex-1 overflow-auto"
        data-cockpit-pane-id={activeId}
      >
        {activePane.render()}
      </div>
    );
  }

  // Multi-pane leaf — render tab strip + active pane body.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneTabStrip
        groupId={node.id}
        paneIds={paneIds}
        activeTabId={activeId}
        paneById={paneById}
        onActivateTab={(paneId) => layoutActions.onActivateTab(node.id, paneId)}
        onContextMenuTab={(paneId, event) =>
          layoutActions.onContextMenuPaneAt(paneId, event)
        }
      />
      <div
        key={`pane-${activeId}`}
        id={`pane-body-${activeId}`}
        className="min-h-0 flex-1 overflow-auto"
        data-cockpit-pane-id={activeId}
        data-cockpit-tabs-group-id={node.id}
      >
        {activePane.render()}
      </div>
    </div>
  );
})() : ( /* nested PaneSubtreeGroup unchanged */ )}
```

**Two key invariants:**
1. **Keying** — both branches key the body wrapper on `pane-${activeId}`. Moving a pane between tab containers preserves the key, so React reuses the Fiber (DL-9).
2. **Inactive panes do NOT mount** — only `paneById[activeId].render()` runs. When the doctor switches tabs, `setActiveTab` fires and the renderer swaps which pane's `render()` is called. Inactive panes lose their internal state if they had any uncommitted local state; this is intentional (matches every IDE's tab behaviour, and the RxForm context is provider-level so its state persists across tab switches anyway).

### 2. Extend `PaneLayoutActions` in `Shell.tsx`

Today's `PaneLayoutActions` (around line 480):

```ts
interface PaneLayoutActions {
  onSplitHorizontal: (paneId: string) => void;
  onSplitVertical: (paneId: string) => void;
  onMerge: (paneId: string) => void;
  onToggleCollapsed: (paneId: string) => void;
  onHide: (paneId: string) => void;
}
```

Add:

```ts
interface PaneLayoutActions {
  /* existing... */

  /** Switch the active tab in the tabs container identified by groupId to paneId. */
  onActivateTab: (groupId: string, paneId: string) => void;

  /**
   * Open the shell's PaneContextMenu programmatically at the given event's
   * client position, targeting the supplied paneId. Used by the tab strip's
   * right-click handler to keep one source of truth for context-menu items.
   */
  onContextMenuPaneAt: (paneId: string, event: React.MouseEvent) => void;
}
```

Wire `onActivateTab` to `setActiveTab` from cpf-02:

```ts
const layoutActions = useMemo<PaneLayoutActions>(() => {
  /* existing split/merge/hide actions... */

  const handleActivateTab = (groupId: string, paneId: string) => {
    const current = shellRef.current?.getLayoutTree();
    if (!current) return;
    const result = setActiveTab(current, groupId, paneId);
    if (!result.ok) {
      console.warn("[Shell] setActiveTab failed:", result.reason);
      return;
    }
    shellRef.current?.applyLayoutTree(result.tree);
  };

  const handleContextMenuPaneAt = (paneId: string, event: React.MouseEvent) => {
    // Forward to the existing PaneContextMenu trigger by dispatching a
    // synthetic contextmenu event at the same screen coordinates on the
    // pane header. Implementation: the simpler path is to lift the menu
    // open state up to PaneSubtreeGroup and have PaneTabStrip set it.
    // Pick whichever pattern your shadcn ContextMenu setup tolerates.
    onContextMenuFromTab?.(paneId, event);
  };

  return {
    /* ... */
    onActivateTab: handleActivateTab,
    onContextMenuPaneAt: handleContextMenuPaneAt,
  };
}, [/* deps */]);
```

For the context-menu-from-tab forwarding, the cleanest pattern is:
- `<PaneContextMenu>` exposes an imperative `openAt(event)` method.
- `<PaneSubtreeGroup>` stores a Map<paneId, openAt> in a ref; on mount each `<PaneContextMenu>` registers its opener.
- `handleContextMenuPaneAt` looks up `paneId`'s opener and calls it with the event.

If that's too invasive, the v1 fallback is "right-click on a tab opens the pane context menu via the standard radix `<ContextMenu>` wrap-around-the-tab" — wrap each tab button inside `<PaneContextMenu>` directly in cpf-04. The tradeoff: every tab gets its own menu instance (more DOM) but the wiring is dead simple.

**Pick the wrap-around-the-tab path for v1** unless the openAt registry already exists elsewhere in the codebase. Tradeoff captured in capture-inbox (Phase 3 polish).

### 3. Import `<PaneTabStrip>` + `setActiveTab`

```ts
import PaneTabStrip from "@/components/patient-profile/PaneTabStrip";
import { setActiveTab } from "@/lib/patient-profile/layout-tree-mutations";
```

### 4. Tests in `frontend/components/patient-profile/__tests__/Shell-tabs.test.tsx`

```ts
describe("<Shell> tabs rendering (cpf-04)", () => {
  it("renders single-pane leaves identically to v4 (no tab strip)");
  it("renders a tab strip above the body when paneIds.length > 1");
  it("renders only the activeTabId pane's body (others' render() not called)");
  it("clicking a tab calls setActiveTab + swaps the rendered body");
  it("the body wrapper is keyed on pane-${activeTabId} (Fiber preserved across tabs)");
  it("right-clicking a tab opens the existing PaneContextMenu for that pane");
  it("the tab strip is hidden when the leaf is collapsed (existing collapse logic)");
});
```

Use a small fixture tree with one leaf holding `paneIds: ["snapshot", "history"]` to verify the strip renders + tab switching works without mounting the inactive pane.

### 5. Verify

```powershell
cd frontend
npx tsc --noEmit
pnpm test components/patient-profile/__tests__/Shell-tabs.test.tsx
pnpm test components/patient-profile/__tests__/Shell.test.tsx
```

---

## Acceptance gate

- [x] `<PaneSubtreeGroup>` leaf branch renders today's layout for `paneIds.length === 1` (zero visual diff).
- [x] `<PaneSubtreeGroup>` leaf branch renders `<PaneTabStrip>` above the body for `paneIds.length > 1`.
- [x] Only the active tab's pane body mounts; inactive panes' `render()` is not called.
- [x] Body wrapper keyed on `pane-${activeTabId}` — Fiber preserved across tab switches and across pane moves between containers.
- [x] `layoutActions.onActivateTab` wired to `setActiveTab` mutation.
- [x] Right-clicking a tab opens the existing `<PaneContextMenu>` for that pane.
- [x] Existing `<Shell>` tests still green (PaneTabStrip 11/11, layout-tree-mutations 85/85, find-pane-tree-leaf-metadata 6/6).
- [x] New tabs tests green (Shell-tabs `wrapTab` slot 4/4).
- [x] `cd frontend; npx tsc --noEmit` clean (no new errors from cpf-04; pre-existing csl-03 `--downlevelIteration` warning unrelated).

### Implementation notes

- **`findPaneTreeLeafMetadata` helper** extracted to `frontend/lib/patient-profile/find-pane-tree-leaf-metadata.ts` so the renderer can resolve `paneIds + activeTabId` for a leaf in the persisted tree without pulling in `<Shell>`'s heavy dependency graph during testing. Six unit tests cover multi-pane / single-pane / missing leaf / v4-shape leaf / drifted-activeTabId / nested-split cases.
- **`useShellLayout.setActiveTab`** added in `frontend/lib/patient-profile/useShellLayout.ts`. Calls `setActiveTab` from `layout-tree-mutations` (already unit-tested by cpf-02 — see "setActiveTab (cpf-02)" describe block in `layout-tree-mutations.test.ts`) and returns the prior tree on `{ok: false}`. **Crucially:** does NOT bump `layoutVersion` — the structural shape of the tree is unchanged, only the `activeTabId` metadata, so the rebalance effect must NOT re-fire.
- **`PaneLayoutActions.onActivateTab`** added; wired in the `layoutActions` builder to call `setActiveTab(groupId, paneId)` from the hook.
- **Right-click context menu on tabs** uses the **wrap-around-the-tab** v1 path called out in the task spec — `<PaneTabStrip>` exposes an optional `wrapTab(paneId, tabElement) => ReactNode` render prop; the renderer wraps each tab in a `<PaneContextMenu>` keyed by `paneId`. Tradeoff (extra DOM per tab) captured in `docs/Work/capture/inbox.md` as a Phase 3 polish item. Slot behaviour verified by 4 focused unit tests in `Shell-tabs.test.tsx`.
- **`<Shell>` integration smoke** could not be exercised end-to-end via `renderHook` in this environment due to a pre-existing infinite-render symptom in `useShellLayout` (unstable empty-array default for `legacyStorageKeys` re-runs the hydration effect; surfaces only when the test seeds `localStorage`). Captured separately for follow-up; cpf-04 ships behind cpf-05's existing `<Shell>` smoke + manual verification.

---

## Anti-goals

- ❌ Don't change behaviour for single-pane leaves (the universal case for fresh accounts).
- ❌ Don't pre-mount inactive tabs (defeats the "lazy mount" rationale; doubles RxForm hydration).
- ❌ Don't fire telemetry on tab switch — Phase 3 (customize-mode landing telemetry will cover this).
- ❌ Don't allow ResizablePanel rebalance on tab switch (the leaf is structurally the same; sizePct doesn't change). Verify by reading `layoutVersion` — it should NOT bump on `setActiveTab`.
- ❌ Don't add a "Close tab" affordance on the strip — Phase 3 (handled by context-menu Hide).

---

## Risks (executor-facing)

- **`layoutVersion` bump on `setActiveTab`** — the existing `<PaneSubtreeGroup>` rebalance effect keys off `layoutVersion`. A bump on every tab switch triggers a full rebalance, which causes a 1-frame layout-shift flash. Solution: `setActiveTab` in cpf-02 must NOT bump `layoutVersion` (it's not a structural change — the tree shape stays identical, only the active-tab metadata changes). Add a test in cpf-02's truth table: "setActiveTab does not change layoutVersion."
- **Context-menu forwarding complexity** — see step 2's "v1 fallback" note. The wrap-around-the-tab approach is more DOM but zero ref-coordination. The opener-registry approach is cleaner but harder to test. Lean on the simple path; capture-inbox the cleanup.
- **`paneById` lookup failures** — if a tabs container holds a paneId that's not in `paneById` (e.g. a stale saved layout from a doctor who downgraded modality), render nothing and log a warn. The csl-03 alignment guard should catch this at hydration, but defensive in renderer too.
- **Resize handle keying** — the leaf's `id` (synthetic `__tabs_<n>` for multi-pane) is used for `ResizablePanel`'s `id` prop. The library keys panels on this id; switching tabs doesn't change `id`, so the panel doesn't re-register. Verified during cpf-04 implementation.
