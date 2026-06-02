# cpfd-02 · `<PaneDropOverlay>` — the 5-zone drop overlay primitive

> **Wave 2, step 0** of [p2-cockpit-pane-freedom-dnd](../plan-p2-cockpit-pane-freedom-dnd-batch.md). The new user-visible primitive — a transient overlay that lights up the five drop zones on a container while a drag is in progress.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | cpfd-01 (`DropZone` type) | **Blocks** | cpfd-03 |

---

## Why this task

When the doctor picks up a pane, every container needs to show *where* a drop will land: a big **Center** target ("add as a tab here") surrounded by four **edge** targets ("split on this side"). This is the Cursor / VS Code drop affordance.

`<PaneDropOverlay>` is the component that draws those five regions and registers each as a dnd-kit droppable, so the existing `<DndContext>` resolves which zone the pointer is over. It is otherwise dumb: it knows nothing about the layout tree, the mutation ops, or what's being dragged. cpfd-03 mounts one per container and reacts to the drops it produces.

---

## What to do

### 1. New `frontend/components/patient-profile/PaneDropOverlay.tsx`

```tsx
"use client";

import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@/lib/patient-profile/layout-tree-mutations";
import { cn } from "@/lib/utils";

export interface PaneDropOverlayProps {
  /** The leaf/container id this overlay covers (the tree node id). */
  groupId: string;
  /**
   * When false, the overlay refuses every zone (e.g. the dragged pane is the
   * guarded `body` during a live consult, or this container is the source's
   * own single-pane home). Zones render dimmed + non-interactive.
   */
  enabled?: boolean;
  /** Optional: hide the center zone (e.g. when a tab-into would be a no-op). */
  allowCenter?: boolean;
  className?: string;
}

const ZONES: DropZone[] = ["center", "north", "south", "east", "west"];

const ZONE_LABEL: Record<DropZone, string> = {
  center: "Add as tab",
  north: "Split up",
  south: "Split down",
  east: "Split right",
  west: "Split left",
};

/** Absolute-position class per zone. Center is an inset square; edges are strips. */
const ZONE_BOX: Record<DropZone, string> = {
  center: "inset-[28%]",
  north: "inset-x-[28%] top-0 h-[28%]",
  south: "inset-x-[28%] bottom-0 h-[28%]",
  west: "inset-y-[28%] left-0 w-[28%]",
  east: "inset-y-[28%] right-0 w-[28%]",
};

function ZoneTarget({
  groupId,
  zone,
  enabled,
}: {
  groupId: string;
  zone: DropZone;
  enabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${groupId}-${zone}`,
    data: { groupId, zone },
    disabled: !enabled,
  });
  return (
    <div
      ref={setNodeRef}
      data-drop-zone={zone}
      data-drop-group-id={groupId}
      className={cn(
        "absolute flex items-center justify-center rounded-md border border-dashed transition-colors",
        ZONE_BOX[zone],
        enabled
          ? isOver
            ? "border-primary bg-primary/20 text-primary"
            : "border-primary/40 bg-primary/5 text-transparent hover:text-primary/70"
          : "border-muted bg-muted/10 text-transparent",
      )}
      aria-hidden
    >
      <span className="pointer-events-none select-none text-[11px] font-medium">
        {ZONE_LABEL[zone]}
      </span>
    </div>
  );
}

export default function PaneDropOverlay({
  groupId,
  enabled = true,
  allowCenter = true,
  className,
}: PaneDropOverlayProps): React.JSX.Element | null {
  const { active } = useDndContext();
  // Only present while a drag is in progress (P2-DL-4).
  if (!active) return null;
  const zones = allowCenter ? ZONES : ZONES.filter((z) => z !== "center");
  return (
    <div
      data-pane-drop-overlay={groupId}
      className={cn(
        "pointer-events-none absolute inset-0 z-20",
        className,
      )}
    >
      {/* Children re-enable pointer events so each zone can receive the drop. */}
      <div className="pointer-events-auto absolute inset-0">
        {zones.map((zone) => (
          <ZoneTarget
            key={zone}
            groupId={groupId}
            zone={zone}
            enabled={enabled}
          />
        ))}
      </div>
    </div>
  );
}
```

> **Why `useDroppable` per zone (P2-DL-1)?** dnd-kit's collision detection (`pointerWithin`, configured in cpfd-03's `<DndContext>`) resolves which zone box the pointer is inside, so we get hit-testing for free instead of computing geometry by hand in `onDragMove`. Five droppables × N containers is cheap — they only mount while a drag is active.

> **Pointer-events dance:** the outer wrapper is `pointer-events-none` so the overlay doesn't eat clicks at rest; the inner wrapper + zones are `pointer-events-auto` so they capture the drop. Combined with the `if (!active) return null` guard, the overlay is fully inert except during a drag.

### 2. Tests in `frontend/components/patient-profile/__tests__/PaneDropOverlay.test.tsx`

Wrap renders in a `<DndContext>` with a stubbed active drag (dnd-kit exposes context via provider; for "active" state, render inside a `<DndContext>` and assert the no-active case returns null, plus the structural cases when a fixture active is provided via a custom wrapper or by mocking `useDndContext`).

```ts
describe("<PaneDropOverlay>", () => {
  it("renders nothing when no drag is active");
  it("renders five zone targets when a drag is active");
  it("renders four zones (no center) when allowCenter is false");
  it("each zone droppable id is `drop-<groupId>-<zone>` with data { groupId, zone }");
  it("zone label text matches ZONE_LABEL (Add as tab / Split up / down / left / right)");
  it("disables every zone droppable when enabled=false");
  it("the over zone gets the active highlight class");
});
```

> If mocking `useDndContext` to fake an active drag is awkward in the test harness, assert the `enabled` / `allowCenter` branches and the droppable id/label structure with a real `<DndContext>` + a programmatic drag (dnd-kit testing utilities), and leave the visual highlight to the cpfd-03 integration + smoke. Keep at least the "returns null with no active drag" and "five vs four zones" rows.

### 3. Verify

```powershell
cd frontend
npx tsc --noEmit
npm test components/patient-profile/__tests__/PaneDropOverlay.test.tsx
```

---

## Acceptance gate

- [x] `PaneDropOverlay.tsx` exports a default component accepting `groupId`, `enabled?`, `allowCenter?`, `className?`.
- [x] Returns `null` unless a drag is active (`useDndContext().active`).
- [x] Renders five zone regions; each is a `useDroppable` keyed `drop-<groupId>-<zone>` with `data: { groupId, zone }`.
- [x] `allowCenter={false}` omits the center zone (four edges only).
- [x] `enabled={false}` disables every zone droppable and renders them dimmed.
- [x] The pointer-over zone is visually highlighted; each zone carries an action label.
- [x] Outer wrapper is `pointer-events-none`; zones are `pointer-events-auto` (inert at rest).
- [x] Pure of layout-tree knowledge — no imports from `layout-tree.ts` beyond the `DropZone` type, no mutation calls.
- [x] Tests green; `cd frontend; npx tsc --noEmit` clean.

---

## Anti-goals

- ❌ Don't read or mutate the layout tree — props in, droppable refs out.
- ❌ Don't fire telemetry — cpfd-03's drop handler owns the event.
- ❌ Don't compute zone geometry in JS (`onDragMove` math) — use one `useDroppable` per zone (P2-DL-1).
- ❌ Don't render the overlay at rest — only while `active` is set (P2-DL-4).
- ❌ Don't create a second `<DndContext>` — the overlay consumes the existing one via `useDndContext`.
- ❌ Don't add the center zone unconditionally when a tab-into would be a no-op — honour `allowCenter`.

---

## Risks (executor-facing)

- **Zone overlap at the corners.** With center inset at 28% and edges at 28% strips, the corners are covered by edge strips only (center is the inner square). `pointerWithin` resolves a single droppable per pointer position; verify in smoke that corner drags resolve to the nearer edge, not nothing. Tune the inset % in cpfd-03 if a corner feels dead.
- **`useDndContext` in tests.** dnd-kit's context requires a `<DndContext>` ancestor. The "no active drag" case renders null cleanly; faking an active drag may need dnd-kit's test helpers or a light mock of `useDndContext`. Keep the test pragmatic — structure + branch coverage here, visual highlight in the cpfd-03 integration test + manual smoke.
- **z-index vs pane content.** The overlay is `z-20` over the pane body. If a pane renders its own high-z element (e.g. a sticky strip), confirm the overlay still sits on top during a drag. Bump z in cpfd-03 if needed; the value lives here so there's one knob.
- **`allowCenter` / `enabled` are computed by cpfd-03**, not here — this component just honours them. The no-op/guard *logic* lives in the page handler + the wiring; the overlay only reflects it visually.
