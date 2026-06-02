# cv3d-02 — Cursor-style drop overlay + pointer-geometry zone resolver

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 2 — interaction](../plan-p2-cockpit-v3-dnd-batch.md) |
| **Wave** | 2 (Lane A — after cv3d-01) |
| **Depends on** | cv3d-01 (drag sources + `<DndContext>` + `activeDragPaneId`) |
| **Blocks** | cv3d-03, cv3d-04 |
| **Size** | **M–L** (heaviest task in the batch) |
| **Model** | **Auto** (optional Opus close-gate on the geometry — see batch §Cost) |
| **Decision locks** | v3-DL-4, P0-DL-4, P2-DL-1, P2-DL-2, P2-DL-3 |

---

## Objective

Build the **single Cursor-style preview** that replaces the five dashed boxes — visual only; **no commit** (cv3d-03 commits):

1. **Pure geometry resolver.** New `resolveDropZoneFromPointer(rect, point, opts)` → `DropZone` (`"west" | "east" | "north" | "south" | "center"`), fully unit-tested via a truth table **before** any wiring. Given a group's bounding rect + the pointer position (+ whether the pointer is over the tab bar), it returns exactly one zone.
2. **One translucent preview.** New `CockpitDropOverlay` renders **exactly one** translucent region over the hovered group — the left/right half (column), top/bottom half (row), or the full group highlight when targeting the tab bar (`center`). No labels, no dashed boxes (v3-DL-4 / P2-DL-2).
3. **Droppables.** Each leaf group is one `useDroppable` (`data: { groupId }`) covering the body region; the `PaneTabStripV3` tab bar is a first-class droppable resolving to `center`.
4. **Expose, don't commit.** The overlay computes the zone (from the pointer over the active droppable) and surfaces it (local state / context) so cv3d-03's `handleDragEnd` can read `{ groupId, zone }`. Dropping still mutates nothing in this task.

## Why this task

This is what makes v3 *feel like Cursor* — and the entire risk of R-DND3 concentrates in one pure function. By isolating `resolveDropZoneFromPointer` and truth-tabling it first, the "did it pick the right half?" question is answered in unit tests, not by dragging on a monitor. The overlay then just paints what the function returns, and cv3d-03 just commits it. One droppable per group (not five) is the structural shift from the old `PaneDropOverlay`.

## The geometry (locked here)

A group rect of width `w`, height `h`, with the pointer at local `(x, y)`:

| Region | Resolves to | Rule (default thresholds) |
|---|---|---|
| Over the tab bar | `center` | pointer y within the tab-strip band (the tab-bar droppable wins outright) |
| Left edge band | `west` | `x < w * EDGE` (default `EDGE = 0.5` → left half) |
| Right edge band | `east` | `x > w * (1 - EDGE)` |
| Top edge band | `north` | `y < h * EDGE` |
| Bottom edge band | `south` | `y > h * (1 - EDGE)` |
| (tie-break) | see note | when both an x- and y-rule match a corner, the **dominant axis wins** (larger normalized distance from center); exact ties resolve to the **horizontal** zone deterministically |

> **Default model = halves** (`EDGE = 0.5`) so the whole body splits left/right OR top/bottom, matching Cursor's "drop on a half" feel. The tab bar (`center`) is resolved by the *separate tab-bar droppable*, not by the body geometry — so `center` is never a body region. Keep `EDGE` a named constant; cv3d-04 / dogfood may tune it (V3-R6). If a quadrant model is preferred after dogfood, the same function supports it by lowering `EDGE` (e.g. `0.25`) — but ship halves.

## Files

| File | Change |
|---|---|
| `frontend/lib/patient-profile/v3/dropZoneGeometry.ts` | **New** — pure `resolveDropZoneFromPointer(rect, point, { overTabBar })` → `DropZone`; named `EDGE` constant; no React, no dnd-kit. |
| `frontend/components/patient-profile/v3/CockpitDropOverlay.tsx` | **New** — the single translucent preview. Owns a `useDroppable({ id: drop-<groupId>, data: { groupId } })` for the body, reads pointer vs rect to compute the zone (via the resolver), and paints one region. Renders only while a drag is active (reads `activeDragPaneId` from cv3d-01). |
| `frontend/components/patient-profile/v3/CockpitLeafView.tsx` | **Edit** — mount `<CockpitDropOverlay groupId={node.id} …>` over the body region (relatively-positioned container); make the `PaneTabStripV3` tab bar a `center` droppable (a `useDroppable` wrapping the strip, `data: { groupId, overTabBar: true }`). |
| `frontend/components/patient-profile/v3/PaneTabStripV3.tsx` | **Edit (thin, optional)** — accept an optional `tabBarDroppableRef` / wrapper so the leaf can register the tab bar as a `center` droppable without the strip owning DnD logic (keep the strip presentational). |
| `frontend/lib/patient-profile/v3/__tests__/dropZoneGeometry.test.ts` | **New** — the truth table (the core deliverable of this task). |
| `frontend/components/patient-profile/v3/__tests__/CockpitDropOverlay.test.tsx` | **New** — one preview at a time; correct region painted per pointer; tab-bar → center; hidden when no drag. |

> **Import discipline (P0-DL-4):** `DropZone` + engine via `foundation.ts`; `useDroppable` from `@dnd-kit/core`. The geometry file imports **only** the `DropZone` type. **No** import of the old `PaneDropOverlay` (P2-DL-2).

## Implementation sketch

### `resolveDropZoneFromPointer` (pure)

```typescript
// frontend/lib/patient-profile/v3/dropZoneGeometry.ts
import type { DropZone } from "@/lib/patient-profile/v3/foundation";

export const EDGE = 0.5; // halves model (v3-DL-4). Tunable post-dogfood (V3-R6).

export interface Rect { width: number; height: number; }
export interface Point { x: number; y: number; } // local to the group's top-left

export function resolveDropZoneFromPointer(
  rect: Rect,
  point: Point,
  opts?: { overTabBar?: boolean },
): DropZone {
  if (opts?.overTabBar) return "center";
  const { width: w, height: h } = rect;
  if (w <= 0 || h <= 0) return "center"; // degenerate → safest
  const nx = point.x / w;          // 0..1
  const ny = point.y / h;
  // distance from center along each axis, normalized
  const dx = Math.abs(nx - 0.5);
  const dy = Math.abs(ny - 0.5);
  if (dx >= dy) {                  // horizontal dominates (ties → horizontal)
    return nx < 0.5 ? "west" : "east";
  }
  return ny < 0.5 ? "north" : "south";
}
```

> This is the function the optional Opus close-gate reviews. Keep it total (every input → one zone), deterministic on ties, and degenerate-safe. The `EDGE` constant is reserved for an explicit band/quadrant variant if dogfood asks for one; the shipped default is the dominant-axis halves above.

### `CockpitDropOverlay`

```tsx
function CockpitDropOverlay({ groupId, activeDragPaneId }: Props) {
  const { setNodeRef, isOver, node } = useDroppable({ id: `drop-${groupId}`, data: { groupId } });
  const [zone, setZone] = useState<DropZone | null>(null);

  // Track pointer within the droppable rect during a drag to compute the zone.
  // Use dnd-kit's onDragMove (from context) OR a pointermove listener while isOver.
  // setZone(resolveDropZoneFromPointer(rect, localPoint));

  if (!activeDragPaneId) return null;     // only during a drag (P2-DL-2)
  return (
    <div ref={setNodeRef} className="pointer-events-none absolute inset-0 z-20">
      {isOver && zone ? <ZonePreview zone={zone} /> : null}
    </div>
  );
}
```

- **One preview:** `ZonePreview` renders a single translucent rectangle (`bg-primary/15 border-primary/50`) positioned to the resolved half: `west` → `inset-y-0 left-0 w-1/2`, `east` → right half, `north` → top half, `south` → bottom half. `center` is shown by highlighting the **tab bar** (handled by the tab-bar droppable's own `isOver` style), not a center box.
- **Pointer tracking:** prefer dnd-kit's `onDragMove` (subscribe via the context) to get the active pointer, convert to the droppable's local rect (`node.current.getBoundingClientRect()`), call the resolver. A `pointermove` listener gated on `isOver` is an acceptable fallback. Throttle with `requestAnimationFrame` to avoid churn.
- **Surface the zone:** lift the resolved `{ groupId, zone }` to the context (cv3d-01's `CockpitDndContext`) or store it on the droppable `data` so cv3d-03's `handleDragEnd` can read it. (dnd-kit's `over.data.current` only has `{ groupId }`; the *zone* is geometry-derived, so stash the latest resolved zone in a ref/context the end handler reads — document the chosen channel.)

### `CockpitLeafView` — mount overlay + tab-bar droppable

```tsx
<div className="relative flex h-full min-h-0 flex-col" data-cockpit-leaf={node.id}>
  <TabBarDroppable groupId={node.id}>      {/* useDroppable data:{groupId, overTabBar:true} → center */}
    <CockpitLeafMenu …>
      <PaneTabStripV3 … isTabDraggable={…} />
    </CockpitLeafMenu>
  </TabBarDroppable>
  <div id={`pane-body-${activeId}`} className="relative min-h-0 flex-1 overflow-auto">
    {pane?.render()}
    <CockpitDropOverlay groupId={node.id} activeDragPaneId={activeDragPaneId} />
  </div>
</div>
```

- The body container is `relative` so the absolutely-positioned overlay covers exactly the body region (not the tab bar). The tab-bar droppable sits above it and wins for `center`.
- The overlay is `pointer-events-none` except where it must receive the drop — dnd-kit's droppable node ref handles hit-testing; the visual preview layer stays non-interactive (mirror the old overlay's `pointer-events` discipline).

## Tests

**`dropZoneGeometry.test.ts`** (the truth table — core deliverable)

- [x] **Halves** → pointer at left-center → `west`; right-center → `east`; top-center → `north`; bottom-center → `south`.
- [x] **Dominant axis** → a point near the left edge but slightly above center → `west` (horizontal dominates); near the top edge but slightly left → `north`.
- [x] **Exact ties** → dead center → deterministic (`west` per the documented tie-break); exact corner (nx=0, ny=0) → dominant-axis rule, deterministic.
- [x] **Tab bar** → `overTabBar: true` → `center` regardless of x/y.
- [x] **Degenerate** → zero/negative width or height → `center` (safe), never throws or returns undefined.
- [x] **Totality** → a grid sweep of (nx, ny) over [0,1]² yields a defined `DropZone` for every cell (no dead pixels, no overlaps).
- [x] **Aspect ratios** → the same relative point resolves identically at 16:9, 4:3, and tall-narrow rects (the function is normalized, so assert invariance).

**`CockpitDropOverlay.test.tsx`**

- [x] **Hidden when idle** → no `activeDragPaneId` → overlay renders nothing.
- [x] **One preview** → during a drag with the pointer in the right half, exactly one preview element is in the DOM, positioned right; never two.
- [x] **Region matches pointer** → moving the mock pointer left/top/bottom swaps the single preview accordingly.
- [x] **Tab bar → center** → hovering the tab-bar droppable highlights the strip (center) and shows no body half-preview.

> Mock `@dnd-kit/core`'s `useDroppable` / drag context minimally (follow the kept `Shell-dnd.test.tsx` mock). The geometry test needs no mocks — it's a pure function.

## Acceptance criteria

- [x] `resolveDropZoneFromPointer` is pure, total, deterministic, degenerate-safe, and truth-tabled (P2-DL-1 inputs to the engine).
- [x] `CockpitDropOverlay` shows **exactly one** translucent region per hovered group; left/right → column halves, top/bottom → row halves; **no** dashed boxes / labels (v3-DL-4 / P2-DL-2).
- [x] Each leaf group is **one** `useDroppable`; the tab bar is a first-class `center` droppable (no center box).
- [x] The resolved `{ groupId, zone }` is exposed for cv3d-03 to consume; **no mutation** happens in this task.
- [x] Overlay renders only during an active drag; `pointer-events` don't block the body when idle.
- [x] Old `PaneDropOverlay` **not** imported by any `v3/` file (P0-DL-4 / P2-DL-2).
- [x] `npx tsc --noEmit` + `npm run lint` clean; geometry + overlay suites green.
- [x] Flag off → unchanged.

## Out of scope (explicit)

- Committing the drop / `movePane` / caps toast / telemetry → cv3d-03.
- Within-strip tab reorder (V3-Q2) → cv3d-03.
- Quadrant (4-corner) split model → ship halves; quadrant is a post-dogfood tuning of `EDGE` if requested (V3-R6).

## Decision log

- **Geometry as a pure function, tested first:** the only silent-misbehaviour surface in the batch. A truth table makes "which half?" answerable without a monitor and gives the optional Opus close-gate a tight target.
- **One droppable per group, not five:** the structural break from `PaneDropOverlay`. dnd-kit resolves *which group* (collision), the geometry resolves *which region* — so the screen shows one preview, not five boxes (v3-DL-4).
- **Halves, not quadrants, for launch:** matches Cursor's dominant feel and is the simplest correct model; `EDGE` keeps the door open to quadrants after dogfood without a rewrite (V3-R6).
- **Tab bar is a separate droppable for `center`:** keeps `center` out of the body geometry entirely (no center box), and lets the strip stay presentational (the leaf owns the droppable wrapper).

## References

- [`frontend/components/patient-profile/PaneDropOverlay.tsx`](../../../../../../frontend/components/patient-profile/PaneDropOverlay.tsx) — the **5-zone overlay this replaces** (`useDroppable` per zone, `ZONE_BOX` insets). v3 collapses it to one droppable + geometry. **Not imported** by v3.
- [`frontend/components/patient-profile/v3/CockpitLeafView.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitLeafView.tsx) — overlay + tab-bar droppable mount point (`data-cockpit-leaf`).
- [`frontend/lib/patient-profile/v3/foundation.ts`](../../../../../../frontend/lib/patient-profile/v3/foundation.ts) — `DropZone` type + engine.
- [`frontend/components/patient-profile/v3/CockpitGroupView.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitGroupView.tsx) — `data-cockpit-orientation` (useful if the preview wants to hint the resulting split axis).
- cv3d-01: [`task-cv3d-01-…`](./task-cv3d-01-tab-drag-sources-and-dnd-context.md) — `activeDragPaneId` + the single context this overlay reads.
- Batch: [`plan-p2-cockpit-v3-dnd-batch.md`](../plan-p2-cockpit-v3-dnd-batch.md) · Order: [`EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](./EXECUTION-ORDER-p2-cockpit-v3-dnd.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
