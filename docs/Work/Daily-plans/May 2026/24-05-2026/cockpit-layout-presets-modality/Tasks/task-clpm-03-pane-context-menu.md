# clpm-03 · `<PaneContextMenu>` + shell wire

> **Wave 2** of [cockpit-layout-presets-modality](../plan-cockpit-layout-presets-modality-batch.md). The user-visible affordance.

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | — (parallel to clpm-02) | **Blocks** | clpm-05 (uses the actions) |
| **Status** | ✅ Done (2026-05-24) |

---

## What to do

### 1. New `frontend/components/patient-profile/PaneContextMenu.tsx`

Use shadcn's `ContextMenu` primitive:

```tsx
"use client";

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

export interface PaneContextMenuProps {
  paneId: string;
  isCollapsed: boolean;
  canMerge: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onMerge: () => void;
  onToggleCollapsed: () => void;
  onHide: () => void;
  children: React.ReactNode;
}

export default function PaneContextMenu(props: PaneContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={props.onSplitHorizontal}>Split horizontally</ContextMenuItem>
        <ContextMenuItem onSelect={props.onSplitVertical}>Split vertically</ContextMenuItem>
        <ContextMenuItem onSelect={props.onMerge} disabled={!props.canMerge}>
          Merge with sibling
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={props.onToggleCollapsed}>
          {props.isCollapsed ? "Expand pane" : "Collapse pane"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={props.onHide}>Hide pane</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

### 2. Wire into pane header in `Shell.tsx`

Wrap **only the pane header** (not the body), per DL-10:

```tsx
<div className="pane">
  <PaneContextMenu
    paneId={pane.id}
    isCollapsed={Boolean(pane.collapsed)}
    canMerge={treeNodeHasSibling(layoutTree, pane.id)}
    onSplitHorizontal={() => handleSplit(pane.id, "horizontal")}
    onSplitVertical={() => handleSplit(pane.id, "vertical")}
    onMerge={() => handleMerge(pane.id)}
    onToggleCollapsed={() => handleToggleCollapsed(pane.id)}
    onHide={() => handleHide(pane.id)}
  >
    <div className="pane-header" data-cockpit-pane-id={pane.id}>
      {pane.title}
    </div>
  </PaneContextMenu>
  <div className="pane-body">{renderPane(pane)}</div>
</div>
```

The handler implementations call `setLayoutTree(mutate(currentTree))` using clpm-04's mutation functions. In Wave 2 these handlers can be stubs (TODO comments + `console.log`); Wave 3 wires the real mutations.

Fire `trackCockpitV2RLayoutUxContextMenuOpened({ paneId })` from a `onOpenChange` callback on `<ContextMenu>` (open=true side).

### 3. Tests `frontend/components/patient-profile/__tests__/PaneContextMenu.test.tsx`

- Renders trigger child.
- Right-click on trigger opens menu.
- Items fire callbacks on select.
- "Merge" item disabled when `canMerge={false}`.
- Toggle item label changes with `isCollapsed`.

### 4. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/patient-profile/__tests__/PaneContextMenu.test.tsx
```

---

## Acceptance gate

- [x] Component renders correctly.
- [x] Context menu opens on right-click header, NOT on right-click body (DL-10).
- [x] All 5 actions wired (stubs OK).
- [x] Telemetry fires on open.

---

## Anti-goals

- ❌ Don't fire mutations from this component — pure event-emission.
- ❌ Don't add a "Pin" / "Lock" item in v1 — capture-inbox.
- ❌ Don't intercept body right-clicks (DL-10).
