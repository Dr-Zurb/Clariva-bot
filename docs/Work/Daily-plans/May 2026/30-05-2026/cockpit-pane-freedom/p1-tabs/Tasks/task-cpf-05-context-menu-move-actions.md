# cpf-05 · `<PaneContextMenu>` — "Move pane to..." submenu + page handler

> **Wave 2, lane β** of [cockpit-pane-freedom](../plan-p1-cockpit-pane-freedom-batch.md). The user-visible workflow — no DnD yet, but doctors get a no-mouse-required path to reshape their layout via right-click.

| **Size** | S | **Model** | Composer 2 Fast | **Wave** | 2 | **Depends on** | cpf-02 (mutation ops) | **Blocks** | cpf-06 (smoke) |

---

## Why this task

cpf-02 shipped the mutation engine. cpf-03 + cpf-04 will ship the renderer. cpf-05 surfaces those ops to doctors via the existing `<PaneContextMenu>` so they can:
1. **Tab a pane into an existing container** — "Move pane to..." → submenu listing every other leaf id → pick one → pane appears as a tab there.
2. **Split off a new sibling** — "Move to new split (right)" / "Move to new split (below)" → invokes `extractFromTabsNode`.
3. **Respect the live-consult guard (DL-8)** — `body` cannot be moved during a live call; toast + disabled submenu items.

This task does NOT ship DnD. It's the keyboard-and-right-click workflow that proves the data model works end-to-end before Phase 2 layers visual drag affordances on top.

---

## What to do

### 1. Extend `frontend/components/patient-profile/PaneContextMenu.tsx`

Add a `<ContextMenuSub>` for "Move pane to..." with three groups of children:

```tsx
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";

export interface PaneContextMenuMoveTarget {
  /** A target leaf id (tabs container) to tab into. */
  kind: "tab-into";
  groupId: string;
  /** Display label — typically the active tab pane's title; fall back to first paneId's title. */
  label: string;
}

export interface PaneContextMenuSplitTarget {
  kind: "split-horizontal" | "split-vertical";
}

export type PaneContextMenuMoveOption = PaneContextMenuMoveTarget | PaneContextMenuSplitTarget;

export interface PaneContextMenuProps {
  /* existing props ... */

  /** Targets the doctor can move this pane into. Excludes the source's own container. */
  moveTargets?: PaneContextMenuMoveOption[];
  onMove?: (target: PaneContextMenuMoveOption) => void;
  /** When true, the entire Move submenu is disabled with a tooltip/reason. */
  moveDisabled?: { reason: string };
}
```

Render the submenu when `moveTargets?.length || onMove` is set:

```tsx
{props.moveTargets && props.onMove ? (
  <>
    <ContextMenuSeparator />
    <ContextMenuSub>
      <ContextMenuSubTrigger
        disabled={Boolean(props.moveDisabled)}
        title={props.moveDisabled?.reason}
      >
        Move pane to…
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {props.moveTargets
          .filter((t) => t.kind === "tab-into")
          .map((t) => (
            <ContextMenuItem
              key={`tab-${(t as PaneContextMenuMoveTarget).groupId}`}
              onSelect={() => props.onMove?.(t)}
            >
              {(t as PaneContextMenuMoveTarget).label}
            </ContextMenuItem>
          ))}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => props.onMove?.({ kind: "split-horizontal" })}>
          New split — right
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => props.onMove?.({ kind: "split-vertical" })}>
          New split — below
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  </>
) : null}
```

### 2. Compute `moveTargets` + wire `onMove` in `PatientProfilePage.tsx`

```ts
// Adjacent to the existing pane-action handlers (handleSplit, handleMerge, ...).

const handleMovePaneTo = useCallback(
  (sourcePaneId: string, target: PaneContextMenuMoveOption) => {
    const shell = shellRef.current;
    if (!shell) return;
    const currentTree = shell.getLayoutTree();
    if (!currentTree) return;

    // Live-consult guard (DL-8).
    if (sourcePaneId === "body" && state === "live") {
      toast.error("Pause the consult before rearranging.");
      return;
    }

    let result: ReturnType<typeof moveLeafBetweenTabs>;
    if (target.kind === "tab-into") {
      result = moveLeafBetweenTabs(currentTree, sourcePaneId, target.groupId);
    } else {
      const direction = target.kind === "split-horizontal" ? "horizontal" : "vertical";
      result = extractFromTabsNode(currentTree, sourcePaneId, direction);
    }
    if (!result.ok) {
      toast.error(`Could not move pane: ${result.reason}`);
      console.warn("[PatientProfilePage] move pane failed:", result.reason);
      return;
    }
    shell.applyLayoutTree(result.tree);
    trackCockpitPaneFreedomMoveViaContextMenu({
      sourcePaneId,
      targetType: target.kind,
    });
  },
  [state],
);

const computeMoveTargets = useCallback(
  (sourcePaneId: string): PaneContextMenuMoveOption[] => {
    const tree = shellRef.current?.getLayoutTree();
    if (!tree) return [];
    const groups = listTabsContainers(tree);
    return groups
      .filter((g) => !g.paneIds.includes(sourcePaneId))
      .map((g): PaneContextMenuMoveOption => ({
        kind: "tab-into",
        groupId: g.id,
        label: g.label, // pane title of activeTabId
      }));
  },
  [],
);

const computeMoveDisabled = useCallback(
  (sourcePaneId: string): { reason: string } | undefined => {
    if (sourcePaneId === "body" && state === "live") {
      return { reason: "Pause the consult before rearranging." };
    }
    return undefined;
  },
  [state],
);
```

Pass `moveTargets={computeMoveTargets(pane.id)}`, `onMove={(t) => handleMovePaneTo(pane.id, t)}`, `moveDisabled={computeMoveDisabled(pane.id)}` to each `<PaneContextMenu>` instance in the tree (or via the existing layoutActions chain — pick whichever lives in `Shell.tsx`).

### 3. Add `listTabsContainers` helper to `frontend/lib/patient-profile/layout-tree.ts`

```ts
export interface TabsContainerInfo {
  /** Leaf node id. */
  id: string;
  paneIds: string[];
  activeTabId: string;
  /** Human-readable label — typically `paneById[activeTabId].title`. */
  label: string;
}

export function listTabsContainers(
  tree: PaneTreeNode,
  labelFor?: (paneId: string) => string,
): TabsContainerInfo[] {
  const out: TabsContainerInfo[] = [];
  function walk(n: PaneTreeNode) {
    if (n.children && n.children.length > 0) {
      n.children.forEach(walk);
      return;
    }
    const paneIds = n.paneIds && n.paneIds.length > 0 ? n.paneIds : [n.id];
    const activeTabId = n.activeTabId ?? paneIds[0]!;
    out.push({
      id: n.id,
      paneIds,
      activeTabId,
      label: labelFor?.(activeTabId) ?? activeTabId,
    });
  }
  walk(tree);
  return out;
}
```

Pass `paneById[id]?.title ?? id` as `labelFor` from the caller.

### 4. Add telemetry function in `frontend/lib/patient-profile/telemetry.ts`

```ts
export function trackCockpitPaneFreedomMoveViaContextMenu(payload: {
  sourcePaneId: string;
  targetType: "tab-into" | "split-horizontal" | "split-vertical";
}): void {
  logCockpitEvent(
    "cockpit_pane_freedom.move_via_context_menu",
    payload as Record<string, string | number | boolean>,
  );
}
```

No one-shot window flag — every move is interesting (volume gives shape of doctor behaviour).

### 5. Tests in `frontend/components/patient-profile/__tests__/PaneContextMenu.test.tsx`

Add:

```ts
describe("<PaneContextMenu> Move submenu (cpf-05)", () => {
  it("renders 'Move pane to…' submenu when moveTargets + onMove are provided");
  it("does not render the submenu when moveTargets is empty / undefined");
  it("renders one item per tab-into target");
  it("always renders 'New split — right' + 'New split — below' below the tab targets");
  it("invokes onMove with the correct target on click");
  it("disables the submenu (with tooltip) when moveDisabled is set");
});
```

And add a small test for `listTabsContainers`:

```ts
describe("listTabsContainers (cpf-05)", () => {
  it("returns one entry per leaf with paneIds + activeTabId + label");
  it("uses labelFor callback when provided; falls back to paneId");
  it("returns no entries for an empty tree (defensive)");
});
```

### 6. Verify

```powershell
cd frontend
npx tsc --noEmit
pnpm test components/patient-profile/__tests__/PaneContextMenu.test.tsx
pnpm test lib/patient-profile/__tests__/layout-tree.test.ts
```

---

## Acceptance gate

- [x] `<PaneContextMenu>` gains a "Move pane to…" submenu when `moveTargets + onMove` are provided.
- [x] Submenu items: one per `tab-into` target + always "New split — right" + "New split — below".
- [x] Selecting a target invokes `onMove(target)` which calls `moveLeafBetweenTabs` / `extractFromTabsNode` via `shellRef.applyLayout` (PaneTreeNode).
- [x] Live-consult guard (DL-8): when `state === "live"` and pane is `body`, submenu is disabled with tooltip "Pause the consult before rearranging."
- [x] Telemetry `cockpit_pane_freedom.move_via_context_menu` fires on every successful move with `{ sourcePaneId, targetType }`.
- [x] `listTabsContainers` helper exported from `layout-tree.ts`.
- [x] All tests green.
- [x] `cd frontend; npx tsc --noEmit` clean.

---

## Anti-goals

- ❌ Don't ship DnD — Phase 2.
- ❌ Don't add "Move to new column" / "Move to new row" as distinct items — the two split items cover the two orientations.
- ❌ Don't list the source's own container in `moveTargets` — already filtered.
- ❌ Don't allow moving multiple panes at once — one pane per right-click action.
- ❌ Don't bump `layoutVersion` on move (the underlying mutation ops handle structural changes; `setActiveTab` is the only no-op-version case).
- ❌ Don't toast on success — only on failure. Success is implicit in the UI updating.

---

## Risks (executor-facing)

- **Submenu label collisions** — multiple tabs containers may have the same active-tab title if a doctor stacked the same pane name across containers (e.g. two "Plan" tab groups — not possible due to single-home, but two `{snapshot, history}` groups COULD have either "Snapshot" or "History" as the active label). Disambiguate via the container's position descriptor: "Snapshot (left)" / "History (bottom-right)" only when needed. v1: just use the active-tab title; capture-inbox the disambiguation.
- **`shellRef.getLayoutTree` availability** — `PatientProfileShell` exposes `getLayoutTree` / `applyLayoutTree` / `paneState` / `paneOrder` via the existing handle. Verify the handle is forwarded by the time the context menu opens (it should be — context menu requires a mounted shell).
- **State derivation timing** — `state === "live"` reads from React state; the guard fires on the click, which happens after any state update. No race expected; tested via the live-consult fixture in `PaneContextMenu.test.tsx`.
- **Toast import** — the codebase uses `import { toast } from "sonner"` (verify against the existing toast usages in `PatientProfilePage.tsx`). Match the existing pattern.
