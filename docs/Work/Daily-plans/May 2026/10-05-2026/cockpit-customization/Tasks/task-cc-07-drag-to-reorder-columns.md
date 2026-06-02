# Task cc-07: Drag-to-reorder columns via header drag handles

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase C, Lane δ step 3 — **M, ~2h**

---

## Task overview

cc-06 ships the dropdown menu — discoverable, low-friction. cc-07 ships the **direct-manipulation** alternative: drag a column header onto another column header to swap their slots.

Implementation uses `@dnd-kit/core` (lightweight, accessible, integrates well with React refs). Each `<CockpitColumnHeader>` renders a small drag-handle icon (`⋮⋮` two-dot grip) on the LEFT of the title. The handle is the *only* draggable surface — the rest of the header is click-passthrough so the collapse chevron stays clickable.

Drop zones are the OTHER two column headers (whichever the dragged column isn't currently in). Drop on a drop zone → swap the dragged column's slot with the drop-target's slot.

Activation distance: 8px. Below that, treat as a click. Avoids accidental drags when the doctor was actually trying to click the title region.

**Estimated time:** ~2h.

**Status:** Pending.

**Hard deps:** cc-04 (need `setLayout` and `swapSlots`), cc-06 (the menu has to coexist with the new drag UX — the menu still drives the trigger).

**Source:** [plan-cockpit-customization-batch.md § CC-D3](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/consultation/ConsultationCockpit.tsx` (where the `<DndContext>` will mount).
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` (the `dragHandle` slot from cc-02).
- `frontend/lib/consultation/cockpit-layout.ts` (the `swapSlots` helper).
- `@dnd-kit/core` README (online) — `useDraggable`, `useDroppable`, `<DndContext onDragEnd>`, activation constraint API.

**Estimated turns:** 3 turns.

---

## Acceptance criteria

### Add `@dnd-kit/core` dependency

- [ ] `cd frontend && pnpm add @dnd-kit/core` — picks up the latest 6.x.
- [ ] No additional sub-packages needed (`@dnd-kit/sortable` is overkill for a 3-element fixed-position swap).

### Drag handle in column header

- [ ] In `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx`, the `dragHandle` slot is already part of the cc-02 contract. cc-07 fills it via the parent `<ConsultationCockpit>` rather than re-shaping the header.

- [ ] Create `frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx`:

  ```tsx
  import { useDraggable } from '@dnd-kit/core';
  import { GripVertical } from 'lucide-react';
  import type { ColumnType } from '@/lib/consultation/cockpit-layout';

  export interface CockpitColumnDragHandleProps {
    columnType: ColumnType;
    /** When true, hides the handle (e.g. for accessibility test environments). Optional. */
    hidden?: boolean;
  }

  export default function CockpitColumnDragHandle({
    columnType,
    hidden = false,
  }: CockpitColumnDragHandleProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: `cockpit-drag-${columnType}`,
      data: { columnType },
    });

    if (hidden) return null;

    return (
      <button
        ref={setNodeRef}
        type="button"
        aria-label={`Drag to reorder ${columnType} column`}
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground',
          'cursor-grab active:cursor-grabbing hover:bg-muted hover:text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          isDragging && 'opacity-40',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }
  ```

### Drop zones on column headers

- [ ] In `<CockpitColumnHeader>`, expose a wrapper `<HeaderDropZone columnType={columnType}>` around the entire header content. The drop zone uses `useDroppable` from `@dnd-kit/core`:

  - Implement as a sibling component `frontend/components/consultation/cockpit/CockpitColumnDropZone.tsx`:

  ```tsx
  import { useDroppable } from '@dnd-kit/core';
  import type { ColumnType } from '@/lib/consultation/cockpit-layout';

  export default function CockpitColumnDropZone({
    columnType,
    children,
  }: {
    columnType: ColumnType;
    children: React.ReactNode;
  }) {
    const { setNodeRef, isOver } = useDroppable({
      id: `cockpit-drop-${columnType}`,
      data: { columnType },
    });
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'relative h-full w-full transition-colors',
          isOver && 'bg-primary/10 ring-2 ring-primary/40 ring-offset-0',
        )}
      >
        {children}
      </div>
    );
  }
  ```

  - **Why wrap the whole column** rather than just the header? Larger drop targets are easier to hit. The hover ring spans the full column to give visual feedback.

### Mount `<DndContext>` and wire `onDragEnd`

- [ ] In `<ConsultationCockpit>`, wrap the desktop branch's `<ResizablePanelGroup>` in a `<DndContext>`:

  ```tsx
  import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // 8px before drag starts
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const fromType = event.active.data.current?.columnType as ColumnType | undefined;
      const toType = event.over?.data.current?.columnType as ColumnType | undefined;
      if (!fromType || !toType || fromType === toType) return;

      const nextSlots = swapSlots(layout.slots, fromType, toType);
      // Reorder only — keep widths and collapsed flags
      handleApplyPreset({ ...layout, slots: nextSlots });
    },
    [layout, handleApplyPreset],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <ResizablePanelGroup …>
        {visibleSlots.map((columnType, slotIndex) => (
          <Fragment key={columnType}>
            {slotIndex > 0 && <ResizableHandle withHandle />}
            <ResizablePanel …>
              <CockpitColumnDropZone columnType={columnType}>
                {/* The column body (header + content), unchanged from cc-04 */}
                {renderColumnInner(columnType, slotIndex)}
              </CockpitColumnDropZone>
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    </DndContext>
  );
  ```

- [ ] Pass `<CockpitColumnDragHandle columnType={columnType} />` into the `dragHandle` slot of every `<CockpitColumnHeader>` rendered by `<ConsultationCockpit>`. Body's header gets a drag handle too — body is reorderable; the only thing it can't do is collapse.

### Swap-into-middle guard

- [ ] cc-05's `setLayoutWithGuards` already auto-expands a collapsed column on reorder-into-middle. Verify this fires correctly when the swap path comes from drag-drop (it should — `handleApplyPreset` calls `setLayoutWithGuards` internally).

### Tests

- [ ] In `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`:
  - Add it-block: "drag-handle is rendered on every column header (chart / body / rx)".
  - Add it-block (using `@dnd-kit/test-utils` if installed, or a programmatic `fireEvent` mock): "dragging chart-handle onto rx-drop-zone calls swapSlots(['chart','body','rx'], 'chart', 'rx')".
- [ ] `pnpm --filter frontend tsc --noEmit` clean. Lint clean.

### Manual verification

- [ ] Open the cockpit. Each column header has a `⋮⋮` grip on the left of the title.
- [ ] Click the chevron next to "Patient chart". It collapses normally — no drag triggered (activation distance protects clicks).
- [ ] Click and HOLD the grip on the chart header. Drag it across to the Rx column. The Rx column shows the hover ring. Release. Chart and Rx swap; the cockpit now shows Rx-Body-Chart.
- [ ] Drag the body grip to the chart slot. Body and chart swap; cockpit shows Body-Chart-Rx (chart is now in the middle, so its chevron disappears).
- [ ] Drag a collapsed Rx into the middle slot. Auto-expands as cc-05 specifies.

---

## Out of scope

- **Sortable list-style reorder** (`@dnd-kit/sortable`) — overkill for 3 columns. Direct swap is the right shape.
- **Animated swap transitions** — keep it instant for the first ship; animation is a polish task for a future batch.
- **Touch-screen support** — `@dnd-kit/core` supports it natively via PointerSensor; no extra wiring. iPad smoke test optional.
- **Drag preview customization** — default ghost is fine. A `<DragOverlay>` with a custom preview can land in a future polish task.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~50 LOC delta — `<DndContext>` wrapper, sensors, `handleDragEnd`, drop-zone wrapping inside each `<ResizablePanel>`).
- `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` (~40 LOC delta — 2 new it-blocks).
- `frontend/package.json` + `pnpm-lock.yaml` (`@dnd-kit/core` dep).

**New:**
- `frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx` (~50 LOC).
- `frontend/components/consultation/cockpit/CockpitColumnDropZone.tsx` (~30 LOC).

---

## Notes / open decisions

1. **Why `@dnd-kit/core` over `react-dnd`?** Smaller, more modern, accessible by default (keyboard sensor included), and React-18-friendly. `react-dnd` has a heavier API surface for our needs.
2. **Why 8px activation distance?** Small enough that intentional drags feel responsive; large enough to absorb micro-movements during clicks. iOS standard is 10px; we go slightly tighter for desktop.
3. **What about keyboard reorder?** `@dnd-kit/core`'s `KeyboardSensor` enables Tab→Space→ArrowKeys reorder. For cc-07 we ship pointer-only and add a keyboard sensor in a follow-up if doctors ask. The dropdown menu (cc-06) is the keyboard path today.
4. **Drag from the body grip — what if body lands in a side slot?** Body in a side slot is allowed by CC-D2 (body is just non-collapsible; not non-side). The slot swap proceeds; body just sits in a side slot, headerful, content scrolling normally.
5. **What if the doctor drops outside any drop zone?** `event.over` is `undefined` → `handleDragEnd` no-ops. No layout change. Standard `@dnd-kit` behavior.

---

## References

- **Affected files:**
  - `frontend/components/consultation/ConsultationCockpit.tsx`
  - new `frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx`
  - new `frontend/components/consultation/cockpit/CockpitColumnDropZone.tsx`
- **Predecessors:** cc-04 (slot-state), cc-05 (collapsibility guards), cc-06 (menu coexists with drag).
- **External docs:** [`@dnd-kit/core` 6.x docs](https://docs.dndkit.com/) — `useDraggable`, `useDroppable`, `<DndContext>`, sensors.

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
