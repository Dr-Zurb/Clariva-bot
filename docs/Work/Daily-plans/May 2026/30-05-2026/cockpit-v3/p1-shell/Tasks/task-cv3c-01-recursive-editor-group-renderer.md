# cv3c-01 — Recursive editor-group renderer spine (splits + resize + active body)

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 1 — core shell](../plan-p1-cockpit-v3-shell-batch.md) |
| **Wave** | 1 (Lane A — first, alone) |
| **Depends on** | Phase 0 (cv3s-01 flag + stub, cv3s-02 `foundation.ts`) |
| **Blocks** | cv3c-02, cv3c-03, cv3c-04 |
| **Size** | **L** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-1, v3-DL-2, v3-DL-6, P0-DL-4, P1-DL-1, P1-DL-3, P1-DL-6 |

---

## Objective

Replace the Phase 0 stub's placeholder body with a **real recursive editor-group renderer** over the live `PaneTreeNode`:

- **Split node** → a `ResizablePanelGroup` (direction = the node's `direction`) with one `ResizablePanel` + resize handle per child; recurse into each child.
- **Leaf node** → a group container that renders the **active** pane's body via `paneById[activeTabId].render()`. (The tab strip UI is cv3c-02; for now render a minimal header showing the active pane title so the leaf is identifiable.)
- **State** comes from the kept `useShellLayout`: `paneTree`, `hydrated`, resize via `setGroupSizes` / `setLeafSize`, active tab via `setActiveTab`.

This is the spine. cv3c-02 adds tabs to each leaf; cv3c-03 adds the palette + context menu. No DnD, no palette, no customize mode in this task. Seed from a small **dev-only** hard-coded tree (cv3c-03 swaps it for the blank default).

## Why this task

The renderer is the foundation every later phase hangs off (R-DND3 drops onto it, R-CHROME3/R-PERSIST3 wrap and persist it). Reusing `useShellLayout` means this task is *rendering + wiring*, not state machinery — the scary parts (persistence, mutation correctness) are already tested in the kept hook + engine. Get a faithful recursive renderer here and cv3c-02/03 become additive.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit** — replace the Phase 0 desktop placeholder with `<CockpitCanvas>`; keep the docks + mobile fallback wiring from cv3s-01. |
| `frontend/components/patient-profile/v3/CockpitCanvas.tsx` | **New** — owns `useShellLayout`, hydration gate, and renders the root via `<CockpitGroupView>`. |
| `frontend/components/patient-profile/v3/CockpitGroupView.tsx` | **New** — the recursive primitive: split → `ResizablePanelGroup`; leaf → `<CockpitLeafView>`. |
| `frontend/components/patient-profile/v3/CockpitLeafView.tsx` | **New** — leaf container: minimal header (active pane title) + body (`paneById[activeTabId].render()`). cv3c-02 replaces the header with the tab strip. |
| `frontend/lib/patient-profile/v3/useCockpitV3Layout.ts` | **New (thin)** — wraps `useShellLayout`, exposes the read state + the callbacks the renderer needs, and a single `dispatchEngine(fn)` helper that runs an engine mutation (from `foundation.ts`) and commits via `applyLayout`, returning `{ ok }` so callers can toast on cap rejection. |
| `frontend/components/patient-profile/v3/__tests__/CockpitGroupView.test.tsx` | **New** — render an arbitrary tree (nested splits + multi-tab leaf), assert structure + active-body render + resize commit. |

> **Import discipline (P0-DL-4):** model + engine come **only** from `@/lib/patient-profile/v3/foundation`. `PaneDefinition` / `paneById` come from the page's pane registry (passed as props), same source the kept shell uses. If `foundation.ts` is missing a re-export you need (e.g. `paneTreeToFlat`), add it there with a one-line note — don't import the source module.

## Implementation sketch

### `useCockpitV3Layout` — the thin state wrapper

```typescript
// frontend/lib/patient-profile/v3/useCockpitV3Layout.ts
"use client";
import { useCallback } from "react";
import {
  useShellLayout,
  type UseShellLayoutOptions,
} from "@/lib/patient-profile/useShellLayout";
import { LAYOUT_VERSION, type PaneTreeNode } from "@/lib/patient-profile/v3/foundation";

export function useCockpitV3Layout(opts: UseShellLayoutOptions) {
  const shell = useShellLayout(opts);

  /** Run an engine mutation; commit on ok. Returns ok for caller toasts. */
  const dispatchEngine = useCallback(
    (fn: (tree: PaneTreeNode) => { ok: boolean; tree?: PaneTreeNode; reason?: string }) => {
      const res = fn(shell.paneTree);
      if (res.ok && res.tree) {
        shell.applyLayout({ version: LAYOUT_VERSION, paneTree: res.tree });
      }
      return res;
    },
    [shell],
  );

  return { ...shell, dispatchEngine };
}
```

> Reuse, don't reinvent: `setGroupSizes` / `setLeafSize` / `setActiveTab` / `applyLayout` already exist on `shell`. This wrapper only adds the engine-dispatch convenience. **No new persistence** (P1-DL-1).

### `CockpitGroupView` — the recursion

```tsx
// Pseudostructure — match Shell.tsx's resize wiring, drop its customizeMode branches.
function CockpitGroupView({ node, paneById, layout }: Props) {
  if (node.type === "leaf") {
    return <CockpitLeafView node={node} paneById={paneById} layout={layout} />;
  }
  // split node
  return (
    <ResizablePanelGroup
      direction={node.direction === "row" ? "horizontal" : "vertical"}
      onLayout={(sizes) => layout.setGroupSizes(node.id, mapSizesToChildIds(node, sizes))}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <ResizableHandle />}
          <ResizablePanel defaultSize={child.size ?? evenSplit(node)} minSize={MIN_PANE_PCT}>
            <CockpitGroupView node={child} paneById={paneById} layout={layout} />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
```

- **Direction:** read the node's `direction` field (`row` → horizontal, `column` → vertical) — confirm the exact field name + values against `layout-tree.ts` via `foundation.ts`; mirror what `Shell.tsx` reads.
- **Resize commit:** `onLayout` → `setGroupSizes(node.id, { [childId]: pct, … })`. Match the kept shell's debounce/round behaviour (read `Shell.tsx` ~lines 950–1060 for the rAF/size-mapping detail; re-author cleanly).
- **`minSize`:** reuse the kept shell's min-pane constant (don't invent a new one).

### `CockpitLeafView` — active body (header is a placeholder until cv3c-02)

```tsx
function CockpitLeafView({ node, paneById, layout }: Props) {
  const activeId = node.activeTabId ?? node.paneIds[0];
  const pane = paneById.get(activeId);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* cv3c-02 replaces this with <PaneTabStripV3>. Minimal title for now. */}
      <div className="shrink-0 border-b px-3 py-1.5 text-sm font-medium">
        {pane?.title ?? activeId}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{pane?.render()}</div>
    </div>
  );
}
```

> **Mount the active pane only** (v3-DL-2 leaves are tabbed; only the active tab's body is in the DOM). This matches the kept shell's tabs-leaf behaviour. Reading `node.paneIds` / `node.activeTabId` is the v5 leaf shape — confirm field names via `foundation.ts`.

### `CockpitCanvas` — owns the hook + hydration

```tsx
function CockpitCanvas({ panes, ...layoutOpts }: Props) {
  const layout = useCockpitV3Layout({
    storageKey,
    defaultPaneOrder,   // DEV SEED ONLY — cv3c-03 replaces with blank
    defaultPaneState,
    knownLeafIds: panes.map((p) => p.id),
  });
  const paneById = useMemo(() => new Map(panes.map((p) => [p.id, p])), [panes]);
  if (!layout.hydrated) return <CockpitCanvasSkeleton />;
  return <CockpitGroupView node={layout.paneTree} paneById={paneById} layout={layout} />;
}
```

### `CockpitV3Shell` wiring (edit)

Keep cv3s-01's structure exactly — `safetyDock` above, `actionDock` below, mobile flat fallback — and swap the desktop placeholder `<div>` for `<CockpitCanvas …>`. **The docks must remain `shrink-0` siblings of the canvas** (v3-DL-6 / P1-DL-6); the canvas fills the middle with `min-h-0 flex-1`.

## Tests (`CockpitGroupView.test.tsx`)

Build trees by hand (via `foundation.ts` helpers / literals) and render with a stub `paneById` (each pane renders `<div data-testid={id}>`):

- [x] **Single leaf** → renders the active pane body; sibling panes (other `paneIds`) are NOT in the DOM.
- [x] **Row split (2 leaves)** → two panels side by side; both active bodies render.
- [x] **Nested split** (row containing a column) → structure renders to the right depth.
- [x] **Resize** → invoking a group's `onLayout` calls `setGroupSizes` with the child-id→pct map.
- [x] **Round-trip** → a tree → render → serialise (`foundation` serialise) → deserialise → renders identically (no structural drift).
- [x] **Active tab** → leaf with `activeTabId` = second pane renders the second pane's body, not the first.

> Mock `react-resizable-panels` minimally if the real components fight jsdom (follow the existing `@dnd-kit/core` mock pattern in `Shell-dnd.test.tsx`). Prefer the real components if they render.

## Acceptance criteria

- [x] Flag on → `CockpitV3Shell` renders the dev-seed tree as resizable editor groups; each leaf shows its active pane body.
- [x] Nested splits render with correct direction; resize persists across reload (via `useShellLayout`).
- [x] Only the active pane of each leaf is mounted.
- [x] Model + engine imported via `foundation.ts` only; **no** `customize-mode-context` / `CustomizeBar` / `PaneDropOverlay` import (P1-DL-3).
- [x] No new persistence layer — `useShellLayout` owns state (P1-DL-1).
- [x] Docks stay anchored above/below the canvas (v3-DL-6).
- [x] Flag off → byte-identical to today (no v3 path runs).
- [x] `npx tsc --noEmit` + `npm run lint` clean; `CockpitGroupView.test.tsx` green.
- [x] `layout-tree*.ts` / `types.ts` / `panes/*` / migrations untouched.

## Out of scope (explicit)

- Tab strip UI + close (cv3c-02) — leaf header is a placeholder title here.
- Palette / blank default / context menu (cv3c-03) — dev seed only here.
- DnD (Phase 2). Mobile editor-group behaviour (stays flat). Persistence hardening (Phase 3).

## Decision log

- **Dev seed, not blank, in this task:** the renderer needs *something* to render before the palette exists; cv3c-03 flips the default to blank (P1-DL-4). Keeps cv3c-01 reviewable in isolation.
- **`useCockpitV3Layout` is a thin wrapper, not a fork:** it delegates all state to `useShellLayout` and only adds `dispatchEngine`. Avoids duplicating persistence (P1-DL-1) while giving the renderer one clean mutation entry point.
- **Re-author, don't copy `Shell.tsx`:** the kept shell's resize math is the behavioural reference, but its `customizeMode` branching is exactly what v3 sheds (v3-DL-3).

## References

- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — state + persistence + resize (`setGroupSizes` / `setLeafSize` / `setActiveTab` / `applyLayout` / `hydrated`).
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — recursive `ResizablePanelGroup` reference (resize wiring ~L950–1320); re-author without customize branches.
- [`frontend/lib/patient-profile/v3/foundation.ts`](../../../../../../frontend/lib/patient-profile/v3/foundation.ts) — the sanctioned import door.
- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — the Phase 0 stub to fill.
- Batch: [`plan-p1-cockpit-v3-shell-batch.md`](../plan-p1-cockpit-v3-shell-batch.md) · Order: [`EXECUTION-ORDER-p1-cockpit-v3-shell.md`](./EXECUTION-ORDER-p1-cockpit-v3-shell.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
