# Task ppr-03: `<PatientProfileShell>` — pure layout primitive

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 1, Lane α step 2 — **L, ~4–5h, Opus 4.7**

---

## Task overview

The keystone of the whole batch. Build a **content-agnostic shell** that consumes the `PaneDefinition[]` contract from ppr-02 and produces a clean three-column layout with:

1. Drag-resize between panes via `react-resizable-panels`.
2. Drag-to-reorder columns via `@dnd-kit/core` (drag handle = column header).
3. **Uniform 40px collapse** for every pane (DL-6). No middle-vs-side rule. No directional collapse.
4. **Adjacent absorber rule** when a pane collapses (left-to-right scan), with a trailing invisible **spacer panel** to absorb leftover width when multiple panes are collapsed.
5. localStorage persistence keyed by `storageKey` prop.

End-of-task: open `/dashboard/appointments/[id]/v2` and see **three coloured `<div>` panes** (no medical content). Drag, resize, collapse, reorder all work end-to-end on those dummies. ppr-04..07 then plug real medical content into the same shell without touching its layout code.

**Estimated time:** ~4–5h. The bulk is getting the absorber rule + dnd-kit + spacer panel + persistence working together on a clean slate.

**Status:** Pending.

**Hard deps:** ppr-01 (folder + ESLint zone), ppr-02 (types + hook).

**Source:** R1.3 + R1.5 + DL-2 + DL-6 + DL-11 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Thinking-XHigh**.

**Why Opus:**
- Six column permutations × four collapse states = 24 visual cells the shell must render correctly.
- The absorber rule is subtle (proven by this week's bugs); getting it right the first time saves a ppr-11 regression.
- dnd-kit + react-resizable-panels coexistence has gotchas (activation distance, hydration warnings) that need careful sequencing.

**New chat?** **Yes — fresh chat.** Pre-load:
- This task file.
- `frontend/components/consultation/ConsultationCockpit.tsx` (the OLD shell — STUDY the spacer panel, the absorber math, the `buildPanelLayoutMap` helper, the dnd-kit wiring. **Keep what worked; drop the slot-vs-column-type dispatch.**)
- `frontend/lib/patient-profile/types.ts` + `useShellLayout.ts` from ppr-02.
- `frontend/components/ui/resizable.tsx` (the shadcn wrapper around `react-resizable-panels`).
- [Product plans/plan-patient-profile-shell-rebuild.md § DL-6](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md) (the absorber rule spec).
- `frontend/components/consultation/cockpit/RailCollapsedStub.tsx` (the collapsed-strip pattern we keep).
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` (the column-header primitive we reuse).
- `frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx` + `CockpitColumnDropZone.tsx` (existing dnd-kit pattern).

**Estimated turns:** 6–10 turns. The shell is ~250 LOC but every line has a constraint.

**Branch:** `feature/ppr-shell-foundation` (shared with ppr-01 and ppr-02).

---

## Acceptance criteria

### `frontend/components/patient-profile/Shell.tsx`

- [ ] Create the file. Public surface:

  ```tsx
  "use client";

  import type { PaneDefinition } from "@/lib/patient-profile/types";

  export interface PatientProfileShellProps {
    /** Panes in the user's preferred order. Length = N (3 in v1). */
    panes: PaneDefinition[];
    /** localStorage key for persisting this shell's layout. */
    storageKey: string;
    /** Optional className for the outer wrapper. */
    className?: string;
  }

  export default function PatientProfileShell(props: PatientProfileShellProps): JSX.Element;
  ```

- [ ] **DL-2 enforcement (verify with the lint zone):** imports allowed from:
  - `@/lib/patient-profile/*`
  - `@/components/ui/*` (shadcn primitives — `Resizable*`, `Button`, etc.)
  - `@/lib/utils` (`cn`)
  - `react`, `react-resizable-panels`, `@dnd-kit/core`, `@dnd-kit/sortable`, `lucide-react`
  - `next/*`
  
  Imports FORBIDDEN: anything from `@/components/consultation/**`, `@/components/ehr/**`, `@/lib/consultation/**`, or `@/types/appointment`. The ESLint zone from ppr-01 should already fail the build if any of these slip in.

### Layout shape

The rendered DOM structure for N=3 panes:

```
<DndContext>
  <div className="flex h-full flex-col">
    {/* Optional header row passed in via children prop — out of ppr-03's scope */}
    <ResizablePanelGroup direction="horizontal" id={storageKey}>
      {panes.map((pane, i) => (
        <Fragment key={pane.id}>
          <ResizablePanel
            id={pane.id}
            order={i}
            defaultSize={paneState[pane.id].sizePct}
            minSize={pane.minSizePct ?? 12}
            collapsible
            collapsedSize={collapsedSizePct} // computed from 40px / container width
            ref={refs[pane.id]}
            onCollapse={() => handleCollapse(pane.id)}
            onExpand={() => handleExpand(pane.id)}
            onResize={(size) => handleResize(pane.id, size)}
          >
            {paneState[pane.id].collapsed
              ? (pane.collapsedRender?.() ?? <DefaultCollapsedStub paneId={pane.id} ... />)
              : (
                <>
                  <ColumnHeader paneId={pane.id} title={pane.title} ... />
                  {pane.render()}
                </>
              )}
          </ResizablePanel>
          {i < panes.length - 1 && <ResizableHandle />}
        </Fragment>
      ))}
      {/* Trailing spacer panel — absorbs any width the main panes don't claim. */}
      <ResizableHandle className="invisible" />
      <ResizablePanel
        id={SHELL_SPACER_ID}
        order={panes.length}
        defaultSize={0}
        minSize={0}
        maxSize={100}
        className="pointer-events-none"
        aria-hidden
      />
    </ResizablePanelGroup>
  </div>
</DndContext>
```

- [ ] `SHELL_SPACER_ID = "patient-profile:spacer"`.
- [ ] The collapsed-size in pixels (40) is converted to a percentage of the group width on mount + on viewport resize. Use the `getCollapsedSizePct(containerWidth: number): number` helper — clamp to a minimum of 3% (defensive against zero-width on first render).
- [ ] Each `ResizablePanel`'s `id` is the pane id, NOT the position. This is critical: reordering keeps panel state stable when the user drags column B to position 0.

### Collapse + absorber rule (DL-6)

When the user clicks a column header's collapse chevron OR clicks a hotkey OR drags a separator past the collapse threshold:

1. **Set the pane's `collapsed` bit** via `setPaneCollapsed(id, true)`.
2. **Imperatively call `panelRef.current?.collapse()`** so the library snaps the panel to `collapsedSize`. (This is the bug that bit us in cc-04 — letting the library infer collapse from sizePct alone produced the "wide strip" symptom.)
3. **Allocate the freed width to the nearest-expanded neighbour, left-first, then right:**

   ```ts
   /**
    * Find the absorber for a collapsing pane.
    *
    * - Scan LEFT from the collapsing pane: first expanded, non-spacer pane wins.
    * - If no left neighbour is expanded, scan RIGHT.
    * - If no other pane is expanded (all-collapsed state), the SPACER absorbs.
    *
    * Returns the absorber id, or `SHELL_SPACER_ID` if none found.
    */
   function findAbsorber(
     collapsingId: string,
     paneOrder: string[],
     paneState: Record<string, PaneRuntimeState>,
   ): string {
     const idx = paneOrder.indexOf(collapsingId);
     for (let i = idx - 1; i >= 0; i--) {
       if (!paneState[paneOrder[i]].collapsed) return paneOrder[i];
     }
     for (let i = idx + 1; i < paneOrder.length; i++) {
       if (!paneState[paneOrder[i]].collapsed) return paneOrder[i];
     }
     return SHELL_SPACER_ID;
   }
   ```

4. **Imperatively `setLayout()` the panel group** so the absorber receives the freed width and the spacer takes any remainder. Use the existing `buildPanelLayoutMap`-style helper from `ConsultationCockpit.tsx` as a reference, but simplify: in v2 there's no `ColumnType` and no `middleCollapseSide`, so the math is:

   ```
   collapsedFootprint = collapsedSizePct
   for each pane in paneOrder:
     if collapsed: layout[pane.id] = collapsedSizePct
     else if id === absorberId: layout[id] = original_sizePct + freedPct
     else: layout[id] = original_sizePct
   layout[SPACER_ID] = 100 - sum(above)
   ```

5. **On uncollapse:** mirror the operation — restore the pane's sizePct to `naturalSizePct ?? originalSize` (capped at the absorber's `minSizePct`). The absorber gives the width back. Spacer absorbs any remaining.

### All-collapsed state

- [ ] When all three panes are collapsed simultaneously, the rendered result is:
  - Pane 1 collapsed strip (40px) on the left.
  - Pane 2 collapsed strip (40px) immediately right of it.
  - Pane 3 collapsed strip (40px) immediately right of that.
  - Spacer fills the remaining ~80%+ of the viewport with empty space.
- [ ] This is the bug fix that broke last week's shell when the spacer math didn't sum correctly. The shell MUST render this state without the strips stretching to fill the row.

### Reorder via `@dnd-kit/core`

- [ ] Use a `<DndContext>` wrapper around the panel group.
- [ ] Each column header (the in-pane `<ColumnHeader>` mini-component or pass-through to the pane's render) hosts a `useDraggable` source AND a `useDroppable` target.
- [ ] `PointerSensor` with `activationConstraint: { distance: 8 }` — same as cc-07; prevents header clicks from accidentally starting drags.
- [ ] On drop: call `reorderPane(activeId, overId)` (the swap helper from `useShellLayout`).
- [ ] **Sortable id semantics:** the dnd-kit id is the pane id, NOT the position. This guarantees the drag overlay renders against stable identity.

### `<ColumnHeader>` (in-file or extracted)

For ppr-03, render a minimal column header inline (top of each non-collapsed panel):

```tsx
function ColumnHeader({
  paneId,
  title,
  canCollapse,
  isCollapsed,
  onToggleCollapse,
  dragAttributes,
  dragListeners,
}: { ... }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <button
          {...dragAttributes}
          {...dragListeners}
          aria-label={`Reorder ${title}`}
          className="cursor-grab text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 className="truncate text-sm font-semibold">{title}</h3>
      </div>
      {canCollapse !== false && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          className="..."
        >
          {isCollapsed ? <ChevronRight ... /> : <ChevronLeft ... />}
        </button>
      )}
    </header>
  );
}
```

- [ ] Style identical to today's `<CockpitColumnHeader>` so visual parity holds.
- [ ] **No imports from `@/components/consultation/cockpit/**`** — we deliberately RE-IMPLEMENT the header here so the shell is self-contained. ppr-13 may later swap to a shared `<PatientProfileColumnHeader>` if duplication becomes painful, but for ppr-03 self-containment > DRY.

### `DefaultCollapsedStub`

- [ ] Inline component rendered when a pane is collapsed AND has no `collapsedRender`. Shows a single expand chevron at the top:

  ```tsx
  function DefaultCollapsedStub({ paneId, title, onExpand }: { ... }) {
    return (
      <div className="flex h-full flex-col items-center pt-2">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${title}`}
          className="..."
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mt-2 rotate-180 text-xs text-muted-foreground" style={{ writingMode: 'vertical-rl' }}>
          {title}
        </span>
      </div>
    );
  }
  ```

- [ ] 40px target width. No bigger, no smaller.

### Persistence

- [ ] On mount, `useShellLayout` reads `localStorage[storageKey]`. Shell uses returned `paneOrder` + `paneState`.
- [ ] On every layout change (resize settle / collapse / reorder), hook writes back to `localStorage`. Debounced 200ms in the hook (ppr-02 owned).
- [ ] Shell does NOT touch localStorage directly. All persistence is through `useShellLayout`.

### Mobile fallback (DL-11)

- [ ] When the viewport is below `lg` (`<1024px`), render `panes.map(p => p.render())` stacked vertically inside a `<div>`. **Skip the `ResizablePanelGroup` entirely** — no resize, no collapse, no reorder on mobile.
- [ ] Use `useMediaQuery("(min-width: 1024px)")` from the existing `frontend/hooks/useMediaQuery.ts`.
- [ ] On mobile, also skip the `<DndContext>` wrapper (hydration savings).

### Smoke render for the dev route

- [ ] In `<PatientProfilePage>` (from ppr-01), replace the placeholder with three synthetic panes wired into the shell:

  ```tsx
  "use client";

  import type { Appointment } from "@/types/appointment";
  import PatientProfileShell from "@/components/patient-profile/Shell";
  import type { PaneDefinition } from "@/lib/patient-profile/types";

  export default function PatientProfilePage({ appointment, token }: PatientProfilePageProps) {
    void appointment;
    void token;

    const panes: PaneDefinition[] = [
      {
        id: "chart",
        title: "Patient chart",
        render: () => (
          <div className="h-full bg-blue-50 p-4 text-blue-900">
            Synthetic pane: chart
          </div>
        ),
        naturalSizePct: 26,
      },
      {
        id: "body",
        title: "Consultation",
        render: () => (
          <div className="h-full bg-green-50 p-4 text-green-900">
            Synthetic pane: body
          </div>
        ),
        naturalSizePct: 48,
      },
      {
        id: "rx",
        title: "Prescription",
        render: () => (
          <div className="h-full bg-amber-50 p-4 text-amber-900">
            Synthetic pane: rx
          </div>
        ),
        naturalSizePct: 26,
      },
    ];

    return (
      <PatientProfileShell
        panes={panes}
        storageKey="patient-profile:v1:layout"
      />
    );
  }
  ```

- [ ] This is the LAST time `<PatientProfilePage>` looks like this. ppr-07 replaces the synthetic panes with real medical content.

### Tests

- [ ] Unit tests at `frontend/components/patient-profile/__tests__/Shell.test.tsx` (Vitest + @testing-library/react):
  - Renders N panels for N panes + 1 spacer (assert via `[data-panel]` or `[role="group"]` count).
  - Calling `setPaneCollapsed("chart", true)` via the column-header chevron click sets `aria-expanded="false"` on the chart header's collapse button.
  - Drag the `body` header onto the `rx` header (simulate dnd-kit events) → `paneOrder` swaps `body` ↔ `rx`.
  - **All-collapsed sanity test:** collapse all three panes → assert each `[data-panel-id]` has computed width close to 40px (within ±2px tolerance for FP drift) and the spacer's width >= viewport width − 3×40px − handle gutters.
  - Layout persists across re-mounts via the supplied `storageKey`.

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean (the ESLint zone passes — Shell.tsx imports nothing forbidden).
- [ ] No console warnings during the dev smoke.

### Manual smoke

- [ ] Open `/dashboard/appointments/[some-real-id]/v2` in a 1440×900 dev viewport.
- [ ] See three coloured boxes labelled "chart" / "body" / "rx". Drag a separator → middle resize works.
- [ ] Click chart's chevron → chart shrinks to 40px strip; body absorbs the freed width; spacer unchanged.
- [ ] Click chart's expand chevron → restore.
- [ ] Drag chart header onto rx header → boxes swap (blue ends up on right, amber on left).
- [ ] Reload → order is preserved.
- [ ] Collapse all three → three 40px strips on the left, empty space on the right (the spacer).
- [ ] Resize browser below 1024px → boxes stack vertically; no resize handles.

---

## Out of scope

- **Any medical content.** ppr-04..07 wire it.
- **Hotkey wiring.** ppr-10.
- **Preset apply path.** ppr-09.
- **One-time localStorage seed reader.** ppr-08.
- **The `<PatientProfileHeader>` strip above the shell.** ppr-07 mounts it as a sibling above; the shell itself does NOT own header chrome.
- **Recursive PaneDefinition rendering** (DL-5 — children field). Field is on the type (ppr-02); rendering is a separate task post-batch.

---

## Files expected to touch

**New:**
- `frontend/components/patient-profile/Shell.tsx` (~250 LOC target — hard cap at 350).
- `frontend/components/patient-profile/__tests__/Shell.test.tsx` (~200 LOC).

**Modified:**
- `frontend/components/patient-profile/PatientProfilePage.tsx` (replaces ppr-01's placeholder with the three-synthetic-panes mount).

**Tests:** none removed.

---

## Pre-load list (for the Opus chat)

When you open the chat for ppr-03, read these files in this order:

1. This task file.
2. `frontend/lib/patient-profile/types.ts` (ppr-02 output).
3. `frontend/lib/patient-profile/useShellLayout.ts` (ppr-02 output).
4. `frontend/components/consultation/ConsultationCockpit.tsx` — read in full. **Look for:** the `SPACER_PANEL_ID` declaration, `buildPanelLayoutMap`, the `handleChartResize` / `handleRxResize` middle-slot guards, the `useChartPrefetch` integration (we DON'T port this — it's a content concern). **Anti-patterns to NOT copy:** anything that says `isMiddleSlot`, `middleCollapseSide`, `refForColumnType`, or branches on `ColumnType`.
5. `frontend/components/ui/resizable.tsx` (shadcn wrapper).
6. `frontend/components/consultation/cockpit/RailCollapsedStub.tsx`.
7. `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx`.
8. `frontend/components/consultation/cockpit/CockpitColumnDragHandle.tsx`.
9. `frontend/components/consultation/cockpit/CockpitColumnDropZone.tsx`.
10. [Product plans/plan-patient-profile-shell-rebuild.md § DL-6](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md) — the absorber rule one more time.

Expected token budget: ~80k input on pre-load. Output ~10–15k.

---

## Notes / open decisions

1. **Why is the column header rendered inside the panel (not above it)?** The header has to live inside the `<ResizablePanel>` because react-resizable-panels manages the panel as the resize unit. The header IS the column's top edge.
2. **Why a `Fragment` per pane in the JSX instead of mapping to siblings?** `<ResizablePanelGroup>` requires a flat list of `<ResizablePanel>` / `<ResizableHandle>` children. Fragments collapse to a flat list while keeping the `key={pane.id}` semantic.
3. **Why is the spacer an opaque `<ResizablePanel>` and not a `<div>` after the group?** The panels in a group MUST sum to 100% (the library enforces this). A trailing `<div>` outside the group has no width relationship to the panels; the spacer must be inside the group to absorb the leftover.
4. **Why does `findAbsorber` scan left-first?** The user's mental model (verified in chat): "I'm collapsing the left thing — let the right thing grow." Left-first means in a 3-pane layout with `chart-body-rx`, collapsing `rx` gives space to `body` (left of rx), which feels right. Same rule symmetrically: collapsing `chart` gives space to `body` (which is also left-of-rx if we scanned right, but the algorithm scans left first and finds no left neighbour, then scans right and finds body). Both cases land at "body absorbs", which matches expectation.
5. **Why is mobile a separate render branch instead of "shell does nothing on mobile"?** Mobile needs the panes to STILL RENDER, just without resize/reorder/collapse. The cleanest way is a top-level branch in the shell. Alternative: a mobile-aware `usePaneOrder` that always returns `defaultPaneOrder` — but then the shell still mounts `<ResizablePanelGroup>`, which adds ~3KB of dead code on every mobile page. The branch is clearer.

---

## References

- **Affected files:**
  - new `frontend/components/patient-profile/Shell.tsx`
  - new `frontend/components/patient-profile/__tests__/Shell.test.tsx`
  - mod `frontend/components/patient-profile/PatientProfilePage.tsx` (placeholder → three synthetic panes)
- **Source decisions:** [Product plans/plan-patient-profile-shell-rebuild.md § DL-2, DL-6, DL-11](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md), items R1.3 + R1.5.
- **Anti-pattern reference (do NOT copy):** `frontend/components/consultation/ConsultationCockpit.tsx`'s slot-vs-column-type branches.
- **Next task:** [`task-ppr-04-extract-consultation-body-pane.md`](./task-ppr-04-extract-consultation-body-pane.md) — fresh chat, Sonnet.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
