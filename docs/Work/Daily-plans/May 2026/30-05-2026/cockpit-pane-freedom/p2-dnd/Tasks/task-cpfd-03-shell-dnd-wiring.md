# cpfd-03 · Shell DnD wiring — mount the overlay, route drops, add the page handler

> **Wave 2, step 1** of [p2-cockpit-pane-freedom-dnd](../plan-p2-cockpit-pane-freedom-dnd-batch.md). The batch's heaviest task — it turns the static overlay + the new op into a working drag-drop gesture. **Highest-cost task in the batch.**

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | cpfd-02 (`<PaneDropOverlay>`) | **Blocks** | cpfd-04, cpfd-05 |

---

## Why this task

cpfd-01 built the op. cpfd-02 built the overlay. cpfd-03 connects them to the existing `<DndContext>`: render an overlay on every container during a drag, read the dropped zone, and call the op via a new page handler. The DnD scaffold already exists in `Shell.tsx` (`<DndContext>`, a `PointerSensor`, the `ShellPaneHeader` drag grip, and a flat `handleDragEnd`); this task *completes* that intentionally-stubbed surface — the comment above `DesktopShell` literally anticipates it.

---

## What to do

### 1. Configure collision detection on the existing `<DndContext>` (`Shell.tsx`)

The context is in `DesktopShell` (around line 663). Add `pointerWithin` collision detection so the pointer position selects the zone droppable, and add an `onDragStart` to track the active source for the `<DragOverlay>` preview.

```tsx
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

// inside DesktopShell:
const [activeDragPaneId, setActiveDragPaneId] = useState<string | null>(null);

const handleDragStart = useCallback((event: DragStartEvent) => {
  const paneId = event.active.data.current?.paneId as string | undefined;
  setActiveDragPaneId(paneId ?? null);
}, []);
```

### 2. Rewrite `handleDragEnd` to route zone drops (`Shell.tsx`)

Replace the current flat-reorder body (it calls `reorderPane(fromId, toId)` — **retire that path**, P2-DL-6) with zone routing:

```tsx
const handleDragEnd = useCallback(
  (event: DragEndEvent) => {
    setActiveDragPaneId(null);
    const sourcePaneId = event.active.data.current?.paneId as string | undefined;
    const over = event.over?.data.current as
      | { groupId: string; zone: DropZone }
      | undefined;
    if (!sourcePaneId || !over?.groupId || !over.zone) return;
    paneMoveUx?.onDropPaneOnZone?.(sourcePaneId, over.groupId, over.zone);
  },
  [paneMoveUx],
);
```

> `over.data` comes from the zone droppables `<PaneDropOverlay>` registered (`{ groupId, zone }`). The header droppable (`pane-drop-<id>`) still exists for the at-rest ring highlight but no longer drives a reorder; you may keep it for the hover affordance or remove it — prefer removing the now-dead `reorderPane` call and the `pane-drop-<id>` droppable if nothing else uses it.

### 3. Mount `<PaneDropOverlay>` on every container leaf (`PaneSubtreeGroup`)

In the leaf branch of `<PaneSubtreeGroup>` (around line 1069, both the single-pane and multi-pane sub-branches), wrap the body in a `relative` container and render the overlay. The overlay self-hides when no drag is active, so it's safe to always mount it on visible leaves.

```tsx
// the leaf body wrapper becomes position-relative so the absolute overlay anchors to it:
<div className="relative min-h-0 flex-1 overflow-auto" data-cockpit-pane-id={activeId}>
  {activePane.render()}
  <PaneDropOverlay
    groupId={node.id}
    enabled={paneMoveUx?.canDropSource?.(activeDragPaneId, node.id) ?? true}
    allowCenter={paneMoveUx?.canTabInto?.(activeDragPaneId, node.id) ?? true}
  />
</div>
```

> `activeDragPaneId` must reach `PaneSubtreeGroup`. Thread it down through `RenderPaneSubtreeArgs` (add `activeDragPaneId: string | null`) alongside the existing `layoutActions` / `paneMoveUx` props, OR read it from a small React context created in `DesktopShell`. **Prefer threading the prop** — the tree already threads `paneMoveUx` and `layoutVersion`, so one more prop matches the existing pattern and avoids a new context.

> `enabled` / `allowCenter` are optional `paneMoveUx` predicates (step 5). Default `true` if `paneMoveUx` is absent (e.g. in unit tests that mount the shell without the page).

### 4. Add the `<DragOverlay>` drag preview (`Shell.tsx`)

Inside the `<DndContext>`, after the recursive root, render a preview of the dragged pane:

```tsx
<DragOverlay dropAnimation={null}>
  {activeDragPaneId && paneById[activeDragPaneId] ? (
    <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-md">
      {paneById[activeDragPaneId].icon
        ? React.createElement(paneById[activeDragPaneId].icon!, {
            className: "h-3.5 w-3.5",
            "aria-hidden": true,
          })
        : null}
      <span>{paneById[activeDragPaneId].title}</span>
    </div>
  ) : null}
</DragOverlay>
```

### 5. Extend `paneMoveUx` + add the page handler (`PatientProfilePage.tsx`)

`paneMoveUx` currently carries `getMoveTargets` / `onMovePane` / `getMoveDisabled` (cpf-05). Add the drop surface. Update the prop type in `Shell.tsx` (`PatientProfileShellProps.paneMoveUx`) AND the object in `PatientProfilePage.tsx`:

```ts
// Shell.tsx — extend the paneMoveUx prop type:
paneMoveUx?: {
  getMoveTargets: (contextPaneId: string) => PaneContextMenuMoveOption[];
  onMovePane: (contextPaneId: string, target: PaneContextMenuMoveOption) => void;
  getMoveDisabled: (contextPaneId: string) => { reason: string } | undefined;
  /** cpfd-03 — commit a 5-zone drag-drop. */
  onDropPaneOnZone: (sourcePaneId: string, targetGroupId: string, zone: DropZone) => void;
  /** cpfd-03 — false → disable ALL zones on `targetGroupId` for the active source (guard / no-op). */
  canDropSource?: (sourcePaneId: string | null, targetGroupId: string) => boolean;
  /** cpfd-03 — false → hide the center zone (tab-into would be a no-op / already-in-target). */
  canTabInto?: (sourcePaneId: string | null, targetGroupId: string) => boolean;
};
```

```ts
// PatientProfilePage.tsx — adjacent to handleMovePaneTo (line ~546):
const handleDropPaneOnZone = useCallback(
  (sourcePaneId: string, targetGroupId: string, zone: DropZone) => {
    const shell = shellRef.current;
    if (!shell) return;
    const currentTree = shell.getPaneTree();

    // Live-consult guard (DL-8) — reuse the SAME condition as computeMoveDisabled.
    if (sourcePaneId === "body" && state === "live") {
      layoutUxToast.error("Pause the consult before rearranging.");
      return;
    }

    const result = dropPaneIntoZone(currentTree, sourcePaneId, targetGroupId, zone);
    if (!result.ok) {
      // Swallow no-op silently; toast only on real failures.
      if (result.reason !== "no-op") {
        layoutUxToast.error(`Could not move pane: ${result.reason}`);
        if (typeof console !== "undefined") {
          console.warn("[PatientProfilePage] drop pane failed:", result.reason);
        }
      }
      return;
    }
    shell.applyLayout({ version: 5, paneTree: result.tree });
    trackCockpitPaneFreedomDragDrop({ sourcePaneId, targetGroupId, zone });
  },
  [state],
);

const canDropSource = useCallback(
  (sourcePaneId: string | null, _targetGroupId: string): boolean => {
    if (!sourcePaneId) return false;
    if (sourcePaneId === "body" && state === "live") return false; // DL-8
    return true;
  },
  [state],
);

const canTabInto = useCallback(
  (sourcePaneId: string | null, targetGroupId: string): boolean => {
    if (!sourcePaneId) return false;
    const tree = shellRef.current?.getPaneTree();
    if (!tree) return true;
    // Hide center when the source already lives in this exact container.
    const container = listTabsContainers(tree).find((c) => c.id === targetGroupId);
    return !container?.paneIds.includes(sourcePaneId);
  },
  [],
);

// extend the paneMoveUx useMemo:
const paneMoveUx = useMemo(
  () => ({
    getMoveTargets: computeMoveTargets,
    onMovePane: handleMovePaneTo,
    getMoveDisabled: computeMoveDisabled,
    onDropPaneOnZone: handleDropPaneOnZone,
    canDropSource,
    canTabInto,
  }),
  [computeMoveTargets, handleMovePaneTo, computeMoveDisabled, handleDropPaneOnZone, canDropSource, canTabInto],
);
```

### 6. Disable the `body` drag grip during a live consult (`Shell.tsx`)

In `ShellPaneHeader`, accept a `dragDisabled` prop and pass it to `useDraggable({ disabled })` + hide/disable the grip button. The renderer computes it from `paneMoveUx.canDropSource(node.id, node.id)` or a dedicated `isPaneDraggable` predicate. The guard already lives in the page; thread it as a boolean. (This is the visual half of DL-8 — the grip shouldn't even start a drag for `body` during live.)

### 7. Add the telemetry event (`frontend/lib/patient-profile/telemetry.ts`)

```ts
/** cpfd-03 — pane moved via drag-drop onto a 5-zone overlay. */
export function trackCockpitPaneFreedomDragDrop(payload: {
  sourcePaneId: string;
  targetGroupId: string;
  zone: "center" | "north" | "south" | "east" | "west";
}): void {
  logCockpitEvent(
    "cockpit_pane_freedom.drag_drop",
    payload as Record<string, string | number | boolean>,
  );
}
```

### 8. Tests in `frontend/components/patient-profile/__tests__/Shell-dnd.test.tsx`

```ts
describe("<Shell> drag-drop wiring (cpfd-03)", () => {
  it("renders <PaneDropOverlay> on each visible leaf only while a drag is active");
  it("handleDragEnd calls onDropPaneOnZone with (sourcePaneId, groupId, zone) from over.data");
  it("handleDragEnd no longer calls reorderPane");
  it("a center drop routes a zone of 'center'; an east drop routes 'east'");
  it("<DragOverlay> shows the dragged pane's title while dragging");
  it("the body grip is disabled when isPaneDraggable('body') is false (live guard)");
  it("renders no overlay / no drag sources on the mobile branch (DL-7)");
});
```

> If the pre-existing `useShellLayout` seeded-localStorage hang (captured in `docs/Work/capture/inbox.md` as a cpf-04 follow-up) still blocks full `<Shell>` mounting in tests, fall back to focused tests on `handleDragEnd`'s routing function + the overlay-mount predicate, and lean on the cpfd-05 smoke matrix for the end-to-end gesture — mirror how cpf-04 handled the same limitation.

### 9. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test components/patient-profile/__tests__/Shell-dnd.test.tsx
npm test components/patient-profile/__tests__/Shell.test.tsx
npm test components/patient-profile/__tests__/Shell-tabs.test.tsx
```

---

## Acceptance gate

- [x] `<DndContext>` uses `pointerWithin` collision detection + an `onDragStart` that tracks `activeDragPaneId`.
- [x] `handleDragEnd` reads `{ groupId, zone }` from `over.data` and calls `paneMoveUx.onDropPaneOnZone`; the flat `reorderPane` cross-pane path is removed (P2-DL-6).
- [x] `<PaneDropOverlay>` is mounted on every visible leaf (single-pane and multi-pane branches), anchored to a `relative` body wrapper.
- [x] `<DragOverlay>` renders the dragged pane's icon + title.
- [x] `paneMoveUx` extended with `onDropPaneOnZone` (+ `canDropSource` / `canTabInto`); `PatientProfilePage.handleDropPaneOnZone` calls `dropPaneIntoZone`, applies via `shell.applyLayout({ version: 5, paneTree })`, swallows `no-op`, toasts other failures.
- [x] Live-consult guard (DL-8): `body` grip is non-draggable during `state === "live"`; a guarded drop is refused with the existing toast (no second guard invented — reuses the `body` + live condition).
- [x] DL-9: a dropped pane's body is not remounted (`pane-<id>` key preserved across the move).
- [x] DL-7: `<MobileShell>` mounts no overlay and no drag sources.
- [x] Telemetry `cockpit_pane_freedom.drag_drop` fires once per successful drop with `{ sourcePaneId, targetGroupId, zone }`.
- [x] New tests green; existing `Shell` / `Shell-tabs` suites still green; `cd frontend; npx tsc --noEmit` clean.

---

## Anti-goals

- ❌ Don't keep both the flat reorder AND zone drops — zone drops supersede (P2-DL-6).
- ❌ Don't make tabs draggable here — that's cpfd-04 (this task's sources are the existing pane-header grips).
- ❌ Don't fire telemetry on `no-op` / guarded / failed drops — success only.
- ❌ Don't introduce a second `<DndContext>` — extend the one in `DesktopShell`.
- ❌ Don't add a persistent overlay / customize toggle — Phase 3 (overlay only during active drag).
- ❌ Don't render the overlay on mobile or pre-mount it at rest.
- ❌ Don't bump `layoutVersion` semantics — `applyLayout` already handles structural change persistence.

---

## Risks (executor-facing)

- **Threading `activeDragPaneId` into `PaneSubtreeGroup`.** The recursive renderer is several levels deep. Add it to `RenderPaneSubtreeArgs` and pass it on every recursive `<PaneSubtreeGroup>` call (there's one nested call site, ~line 1146). Missing one branch = overlay won't know the source for `canDropSource` / `canTabInto`. Alternative: a tiny `DragSourceContext` in `DesktopShell`. Prefer the prop to match the existing `paneMoveUx` threading.
- **Overlay anchoring.** The overlay is `absolute inset-0`; its parent must be `relative`. The single-pane leaf body is currently `min-h-0 flex-1 overflow-auto` (no `relative`). Add `relative`. Watch that `overflow-auto` doesn't clip the overlay — if it does, move the overlay outside the scroll container (sibling of the scroll div, both inside a `relative` wrapper).
- **`pointerWithin` vs the old reorder.** Switching collision detection may change behaviour for any other droppable in the tree. The only other droppable is the header `pane-drop-<id>`; once the reorder path is removed, that droppable is either deleted or harmless. Verify no stray droppable still claims the pointer.
- **Pre-existing `useShellLayout` test hang.** Full `<Shell>` mounting in Vitest can hang on seeded localStorage (documented cpf-04 follow-up). Don't try to fix it here; use focused tests + the cpfd-05 smoke, exactly as cpf-04 did.
- **`React.createElement` for the drag preview icon** — `pane.icon` is a `LucideIcon | undefined`; render conditionally. Match the icon-optional handling already in `<PaneTabStrip>`.
