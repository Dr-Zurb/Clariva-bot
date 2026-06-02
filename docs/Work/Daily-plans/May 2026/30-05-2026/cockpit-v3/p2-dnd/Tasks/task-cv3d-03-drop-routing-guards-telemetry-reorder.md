# cv3d-03 — Drop routing + guards + caps toast + within-strip reorder + telemetry

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 2 — interaction](../plan-p2-cockpit-v3-dnd-batch.md) |
| **Wave** | 2 (Lane A — after cv3d-02, same lane) |
| **Depends on** | cv3d-01 (context + sources), cv3d-02 (overlay + resolved zone) |
| **Blocks** | cv3d-04 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | v3-DL-1, v3-DL-6, v3-DL-7, P0-DL-4, P2-DL-1, P2-DL-5, P2-DL-6, P2-DL-7 |

---

## Objective

Turn "a preview that resolves a zone" into "a drop that rearranges the cockpit," all through kept code:

1. **Commit cross-group drops.** `handleDragEnd` reads the active `{ paneId }` (cv3d-01) + the resolved `{ groupId, zone }` (cv3d-02) and calls `layout.movePane(sourcePaneId, targetGroupId, zone)` — already wired to `dropPaneIntoZone` (P2-DL-1). `west/east` → column, `north/south` → row, `center` (tab bar) → add as tab.
2. **Caps + no-op.** Wrap the result in `toastOnCapRejection` (`cap-reached` / `last-pane-in-tree` / etc.); self-drops / no-ops mutate nothing and toast nothing (v3-DL-7).
3. **Guard.** A drop of `body` during a live consult is refused (reuse the page guard); no mutation, no telemetry. (cv3d-01 already disables the *source*, so this is defense-in-depth at the drop.)
4. **Within-strip reorder (V3-Q2 / P2-DL-6).** Dragging a tab over another tab in the **same** group reorders it via the kept `moveLeafBetweenTabs` — not a cross-group move.
5. **Telemetry (P2-DL-7).** Fire one event per **successful** drop with `{ sourcePaneId, targetGroupId, zone }`; never on no-op / guarded / capped / failed.

## Why this task

Everything structural already exists — the engine (`dropPaneIntoZone`), the commit method (`movePane`), the caps toast (`toastOnCapRejection`), and the guard (`canDropSource`). This task is the thin, careful wiring that connects cv3d-02's resolved zone to those pieces, plus the one genuinely new interaction (within-strip reorder) and the single telemetry event. Keeping it separate from the overlay keeps the geometry reviewable on its own and the commit/guard logic in one auditable place.

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/CockpitDndContext.tsx` | **Edit** — fill the `onDragEnd` stub from cv3d-01 with the real router: resolve `{ sourcePaneId, targetGroupId, zone }`, branch same-group-reorder vs cross-group move, call the injected `onDrop` / `onReorder` callbacks. Keep `activeDragPaneId` reset. |
| `frontend/lib/patient-profile/v3/routeCockpitDrop.ts` | **New (pure)** — `routeCockpitDrop(active, over, resolvedZone)` → `{ kind: "move"; sourcePaneId; targetGroupId; zone } | { kind: "reorder"; groupId; sourcePaneId; beforePaneId } | null`. The kept `routePaneDropFromDragEnd` (Shell.tsx) is the shape reference; re-author for v3's `{ groupId }` + geometry-zone channel. |
| `frontend/lib/patient-profile/v3/useCockpitV3Layout.ts` | **Edit** — add `reorderWithinGroup(groupId, sourcePaneId, beforePaneId)` that dispatches the kept `moveLeafBetweenTabs` + `applyLayout`; returns `{ ok, reason }`. (`movePane` already exists — reuse it for the cross-group case.) |
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit** — pass `onDrop` (→ `toastOnCapRejection(layout.movePane(...))` + telemetry) and `onReorder` (→ `layout.reorderWithinGroup(...)`) into `CockpitDndContext`; apply the `body`/`live` guard before committing. |
| `frontend/components/patient-profile/v3/PaneTabStripV3.tsx` | **Edit** — make tabs sortable within the strip (register each tab as a within-group reorder target). Prefer `@dnd-kit/sortable` (`SortableContext` + `useSortable` over `paneIds`) scoped to the strip; an index-swap on drop over a sibling tab is an acceptable lighter alternative. Keep the cross-group drag source from cv3d-01. |
| `frontend/lib/patient-profile/telemetry.ts` | **Edit (additive)** — add `trackCockpitV3DragDrop({ sourcePaneId, targetGroupId, zone })` → `cockpit_v3.drag_drop` (mirror `trackCockpitPaneFreedomDragDrop`). |
| `frontend/components/patient-profile/v3/__tests__/routeCockpitDrop.test.ts` | **New** — move vs reorder vs null routing. |
| `frontend/components/patient-profile/v3/__tests__/CockpitDnd.routing.test.tsx` | **New** — drop → `movePane` called with the right zone; cap toast; guard refusal; reorder; telemetry fire/no-fire. |

> **Engine reuse (no edits):** `dropPaneIntoZone` (via `movePane`) + `moveLeafBetweenTabs` already exist and are re-exported by `foundation.ts`. **Do not** edit `layout-tree-mutations.ts` (v3-DL-1). Telemetry is a kept, non-engine module — import it directly from `@/lib/patient-profile/telemetry` (not via `foundation.ts`, which is model/engine-only).

## Implementation sketch

### `routeCockpitDrop` (pure)

```typescript
// frontend/lib/patient-profile/v3/routeCockpitDrop.ts
import type { DropZone } from "@/lib/patient-profile/v3/foundation";

type Active = { paneId: string; groupId: string };          // active.data.current (cv3d-01)
type Over =
  | { groupId: string; overTabBar?: boolean; sortableTabId?: string }  // over.data.current
  | null;

export type CockpitDropRoute =
  | { kind: "move"; sourcePaneId: string; targetGroupId: string; zone: DropZone }
  | { kind: "reorder"; groupId: string; sourcePaneId: string; beforePaneId: string | null }
  | null;

export function routeCockpitDrop(
  active: Active | null,
  over: Over,
  resolvedZone: DropZone | null,
): CockpitDropRoute {
  if (!active || !over) return null;
  // Same-group drop onto a sibling tab → reorder (V3-Q2).
  if (over.groupId === active.groupId && over.sortableTabId) {
    if (over.sortableTabId === active.paneId) return null; // no-op
    return { kind: "reorder", groupId: active.groupId, sourcePaneId: active.paneId, beforePaneId: over.sortableTabId };
  }
  // Otherwise a zone move (tab-bar → center; body → resolved half).
  const zone: DropZone = over.overTabBar ? "center" : (resolvedZone ?? "center");
  return { kind: "move", sourcePaneId: active.paneId, targetGroupId: over.groupId, zone };
}
```

> The exact `over.data` channel for `resolvedZone` is whatever cv3d-02 chose (a ref/context the end-handler reads, since dnd-kit `over.data` is static). Document the channel and read it here. Self-drops that don't change anything (drop on own single-pane home with the same zone) fall through to the engine's `no-op` (toasted as nothing).

### `onDragEnd` in `CockpitDndContext`

```tsx
onDragEnd={(e) => {
  setActiveDragPaneId(null);
  const route = routeCockpitDrop(
    e.active.data.current as Active,
    (e.over?.data.current ?? null) as Over,
    readResolvedZone(),     // from cv3d-02's channel
  );
  if (!route) return;
  if (route.kind === "reorder") { onReorder?.(route); return; }
  onDrop?.(route);          // shell applies guard + movePane + toast + telemetry
}}
```

### Shell wiring (guard + commit + telemetry)

```tsx
// CockpitV3Shell.tsx
const handleDrop = (r: { sourcePaneId: string; targetGroupId: string; zone: DropZone }) => {
  if (!canDragPane(r.sourcePaneId)) {           // body + live (cv3d-01 guard)
    layoutUxToast.error("Pause the consult before rearranging.");
    return;                                     // no mutation, no telemetry
  }
  const res = layout.movePane(r.sourcePaneId, r.targetGroupId, r.zone);
  toastOnCapRejection(res);
  if (res.ok) trackCockpitV3DragDrop(r);        // success only (P2-DL-7)
};
const handleReorder = (r) => toastOnCapRejection(layout.reorderWithinGroup(r.groupId, r.sourcePaneId, r.beforePaneId));
```

> Reuse the **same** guard signal cv3d-01 threaded (`canDragPane` / `consultActive`). The toast string matches the page's existing "Pause the consult before rearranging." Do not invent a new guard.

### `reorderWithinGroup` (in `useCockpitV3Layout`)

```typescript
const reorderWithinGroup = useCallback(
  (groupId: string, sourcePaneId: string, beforePaneId: string | null): CockpitMutationResult =>
    dispatchEngine((tree) => moveLeafBetweenTabs(tree, groupId, sourcePaneId, beforePaneId /* or index */)),
  [dispatchEngine],
);
```

> Confirm `moveLeafBetweenTabs`' exact signature (group id + pane id + target position/index) against the engine via `foundation.ts`; match the kept shell's call site. If reorder-within-strip proves awkward to integrate with the cross-group overlay, ship cross-group now and **capture** within-strip reorder as a fast-follow (P2-DL-6 allows the split) — but attempt in-phase.

## Tests

**`routeCockpitDrop.test.ts`**
- [x] Cross-group body drop → `{ kind: "move", zone: <resolved> }`.
- [x] Tab-bar drop (`overTabBar`) → `{ kind: "move", zone: "center" }`.
- [x] Same-group drop on a sibling tab → `{ kind: "reorder", beforePaneId }`.
- [x] Same-group drop on itself / missing active|over → `null` (no-op).

**`CockpitDnd.routing.test.tsx`**
- [x] **Move commits** → dropping pane A on pane B's right half calls `layout.movePane("A", "<B-group>", "east")`.
- [x] **Tab-into** → dropping on a tab bar calls `movePane(…, "center")`.
- [x] **Cap toast** → a drop the engine rejects (`cap-reached`) → `toastOnCapRejection` fires; tree unchanged.
- [x] **Guard** → dropping `body` while `consultActive` → refused toast; `movePane` NOT called; no telemetry.
- [x] **Reorder** → same-group sibling drop calls `reorderWithinGroup`.
- [x] **Telemetry** → fires once on a successful move with `{ sourcePaneId, targetGroupId, zone }`; does **not** fire on no-op / guarded / capped (spy assertions).

## Acceptance criteria

- [x] Drop commits via `layout.movePane` → `dropPaneIntoZone`: `west/east` → column, `north/south` → row, `center` → tab (P2-DL-1).
- [x] Caps toast + no-op behave per `toastOnCapRejection`; self-drops mutate nothing (v3-DL-7).
- [x] `body`-during-`live` drop refused (reused guard); no mutation, no telemetry (v3-DL-6).
- [x] Within-strip tab reorder works via `reorderWithinGroup` (paneIds reorder in layout hook; `moveLeafBetweenTabs` is cross-group-only) (V3-Q2 / P2-DL-6).
- [x] One telemetry event per successful drop; never on no-op / guarded / capped / failed (P2-DL-7).
- [x] **No engine edits**; `movePane` via `foundation.ts`; telemetry imported directly (v3-DL-1 / P0-DL-4).
- [x] Context menu (`CockpitLeafMenu`) still works unchanged as the no-pointer path (P2-DL-5).
- [x] `npx tsc --noEmit` + `npm run lint` clean; routing + reorder + telemetry suites green.
- [x] Flag off → unchanged.

## Out of scope (explicit)

- The preview visual / geometry resolver → cv3d-02 (consumed here).
- Mobile behaviour / accidental-drag integration test / persistence-across-reload → cv3d-04.
- Deleting `PaneDropOverlay` / old telemetry → Phase 4.

## Decision log

- **Reuse `movePane`, don't re-route through a new method:** the commit surface shipped in Phase 1 (cv3c-03) and already returns `{ ok, reason }` for the toast. The drop is one call; this keeps v3-DL-1 (engine untouched) and avoids a second mutation path.
- **`routeCockpitDrop` as a pure function:** isolating move-vs-reorder-vs-null routing from React makes the branching unit-testable and keeps `onDragEnd` a two-liner. Mirrors the kept `routePaneDropFromDragEnd`.
- **Guard at both source and drop:** cv3d-01 disables the `body` source during `live`; re-checking at the drop is cheap defense-in-depth against any path that bypasses the disabled source (mirrors the old shell, which guards in the page handler too).
- **Reorder may split if costly:** V3-Q2 is "fold if cheap, else fast-follow." Attempt in-phase via `@dnd-kit/sortable`; if it fights the single cross-group droppable, ship cross-group and capture reorder (P2-DL-6).
- **New v3 telemetry event, not the old one:** `cockpit_v3.drag_drop` keeps v3 analytics separable from the pane-freedom `cockpit_pane_freedom.drag_drop` (different shell, different funnel); both can coexist until Phase 4.

## References

- [`frontend/lib/patient-profile/v3/useCockpitV3Layout.ts`](../../../../../../frontend/lib/patient-profile/v3/useCockpitV3Layout.ts) — `movePane` (L128), `dispatchEngine` (L52); add `reorderWithinGroup` here.
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — `dropPaneIntoZone`, `moveLeafBetweenTabs` (reuse via `foundation.ts`; do not edit).
- [`frontend/lib/patient-profile/v3/cockpit-cap-toast.ts`](../../../../../../frontend/lib/patient-profile/v3/cockpit-cap-toast.ts) — `toastOnCapRejection` / `CockpitMutationResult`.
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../frontend/components/patient-profile/Shell.tsx) — `routePaneDropFromDragEnd` (L217) + `handleDragEnd` (L617) shape reference.
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — `handleDropPaneOnZone` / `canDropSource` (the guard + toast string to match).
- [`frontend/lib/patient-profile/telemetry.ts`](../../../../../../frontend/lib/patient-profile/telemetry.ts) — `trackCockpitPaneFreedomDragDrop` (L376) pattern to mirror.
- [`frontend/components/patient-profile/v3/CockpitLeafMenu.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitLeafMenu.tsx) — the context-menu move path that stays (P2-DL-5).
- cv3d-01 / cv3d-02 task files (same folder).
- Batch: [`plan-p2-cockpit-v3-dnd-batch.md`](../plan-p2-cockpit-v3-dnd-batch.md) · Order: [`EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](./EXECUTION-ORDER-p2-cockpit-v3-dnd.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
