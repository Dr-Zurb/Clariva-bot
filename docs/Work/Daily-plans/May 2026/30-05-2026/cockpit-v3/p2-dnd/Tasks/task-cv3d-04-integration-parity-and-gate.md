# cv3d-04 — Integration + truth-table parity + mobile + Phase 2 gate

| Field | Value |
|---|---|
| **Batch** | [Cockpit v3 Phase 2 — interaction](../plan-p2-cockpit-v3-dnd-batch.md) |
| **Wave** | 3 (Lane A — last) |
| **Depends on** | cv3d-01, cv3d-02, cv3d-03 |
| **Blocks** | — (closes Phase 2) |
| **Size** | **M** |
| **Model** | **Auto** (optional light review — accidental-drag + guard parity) |
| **Decision locks** | v3-DL-1, v3-DL-4, v3-DL-6, v3-DL-8, P0-DL-1, P1-DL-1, P2-DL-2 |

---

## Objective

Wire the Phase 2 pieces into one coherent interaction, prove the **Phase 2 gate**, and lock parity:

1. **End-to-end drag build-up persists across reload** — grab a tab → drop on a half (split) / a tab bar (tab) / a sibling tab (reorder) → reload → the exact arrangement returns (rides `useShellLayout`; P1-DL-1). **This is the gate.**
2. **Truth-table parity** — half→column, half→row, bar→tab match the kept `dropPaneIntoZone` outcomes (the engine v3 reuses), exercised through the v3 drop path.
3. **Accidental-drag safety** — a sub-8px pointer move never reparents a pane; a click still activates the tab; the context menu still works (the no-pointer path; P2-DL-5).
4. **Flag-off parity re-verified** — with `NEXT_PUBLIC_COCKPIT_V3` unset/`0`, the page is byte-identical to today; no v3 module executes (P0-DL-1).
5. **Docks + mobile** — docks anchored in every arrangement and the footer sends (v3-DL-6); mobile (`<lg`) renders the flat fallback with **no** overlay / drag sources (v3-DL-8).
6. **Phase 2 test sweep** — the cross-cutting suites green; inbox note added.

## Why this task

Waves 1–2 build the parts; this proves they form one Cursor-like interaction that the kept persistence carries for free, and that always-on dragging didn't break the two things that must not break: the safety guard and flag-off parity. The "one translucent preview, drop to split/tab, survives reload" story is the whole point of Phase 2 — and the accidental-drag check is the difference between "feels like Cursor" and "panes jump when I click."

## Files

| File | Change |
|---|---|
| `frontend/components/patient-profile/v3/CockpitV3Shell.tsx` | **Edit** — final assembly review: one `<DndContext>` wrapping the canvas, docks `shrink-0` **outside** it, overlay mounted per leaf, guard threaded. No new logic — verification + any glue. |
| `frontend/components/patient-profile/v3/__tests__/CockpitDnd.integration.test.tsx` | **New** — drag-build-up + reload persistence; truth-table parity through the v3 path; accidental micro-drag; flag on/off mount; dock anchoring; mobile no-DnD. |
| `frontend/components/patient-profile/v3/__tests__/CockpitDnd.parity.test.ts` | **New** — for a representative tree, assert the v3 drop route → `movePane` → tree matches calling `dropPaneIntoZone` directly for each zone (the engine is the oracle). |
| `docs/Work/capture/inbox.md` | **Edit** — one line: Phase 2 shipped behind the flag + any rough edges (e.g. geometry threshold tuning, reorder-vs-cross-group ambiguity at the strip edge). |

> No edits to model/engine/types/panes/migrations. No new persistence layer. No edit to the old `Shell.tsx` / `PaneDropOverlay`. All model/engine imports via `foundation.ts`.

## Implementation sketch

### Final assembly check (no new logic)

```tsx
// CockpitV3Shell (desktop) — verify the shape:
{safetyDock /* shrink-0, OUTSIDE the context */}
<CockpitPalette … className="shrink-0" />
<CockpitDndContext paneById={…} onDrop={handleDrop} onReorder={handleReorder}>
  <div className="min-h-0 flex-1">
    <CockpitCanvas panes={panes} layout={layout} canDragPane={canDragPane} />
  </div>
</CockpitDndContext>
{actionDock /* shrink-0, OUTSIDE the context */}
```

- **Dock discipline (v3-DL-6 / P1-DL-6):** `safetyDock` / `actionDock` are `shrink-0` and **not** inside `<CockpitDndContext>` — they can never become drag sources or droppables. Verify the footer ("Send Rx & finish") fires its handler after a multi-split + tab-merge arrangement.
- **Mobile (v3-DL-8):** `<lg` still returns `CockpitMobileFallback` with no context — assert no overlay / no draggable tabs render.

### Truth-table parity (the engine is the oracle)

```typescript
// CockpitDnd.parity.test.ts — for each zone, the v3 path must equal the engine.
for (const zone of ["west","east","north","south","center"] as const) {
  const viaEngine = dropPaneIntoZone(tree, "subjective", "<snapshot-group>", zone);
  const viaV3 = applyV3Drop(tree, { sourcePaneId: "subjective", targetGroupId: "<snapshot-group>", zone });
  expect(serialiseTree(viaV3)).toEqual(serialiseTree(viaEngine.tree));
}
```

> The point: v3 adds **no** layout logic — it routes to the same engine. This test guards against the routing (cv3d-03) drifting from the engine (e.g. swapping an axis).

### Accidental-drag + persistence

- **Micro-drag:** simulate pointer-down + a 5px move + pointer-up on a tab → assert `movePane` was **not** called and `onActivateTab` fired (8px threshold honoured).
- **Persistence:** drive a build-up via the v3 drop path, let the `useShellLayout` debounce flush, re-mount with the same `storageKey`, assert the tree hydrates identically. (Hook-remount after hydration may hit the pre-existing cpf-04 hang — if so, assert via the persisted payload read like cv3c-04 did, and note it in the stamp.)

## Tests

**`CockpitDnd.integration.test.tsx`**
- [x] **Flag on** → renders palette + canvas inside one `<DndContext>`; tabs draggable. **Flag off** → renders the kept `PatientProfileShell` (v3 components absent).
- [x] **Drag build-up + reload** → blank → add panes → drag-split (half) → drag-tab (bar) → reorder (sibling) → remount (same `storageKey`) → identical tree (the **gate**). *(If the hook remount hangs per cpf-04, assert via the persisted payload + note it.)*
- [x] **Accidental micro-drag** → 5px move on a tab → no reparent; click activates.
- [x] **Guard** → `consultActive` + drop `body` → refused; no mutation.
- [x] **Dock anchoring** → 3-column + nested-row arrangement → `safetyDock` + `actionDock` present, outside the context; footer handler fires.
- [x] **Mobile** → `<lg` → flat fallback; no overlay, no draggable tabs, no `<DndContext>`.

**`CockpitDnd.parity.test.ts`**
- [x] For each `DropZone`, the v3 drop path yields the same tree as the kept `dropPaneIntoZone` (engine-as-oracle).
- [x] A drop + a move-back round-trips to a structurally equal tree (no drift).

> Targeted suites only — full `npm test` may hang on the pre-existing `useShellLayout` / `Shell.test.tsx` issue (inbox `[cpf-04 follow-up]`). Note which suites you ran in the status stamp. Re-run cv3d-01..03 suites to confirm still-green.

## Acceptance criteria (Phase 2 gate)

- [x] Drag a tab → one translucent preview → drop on a half (split) / tab bar (tab) / sibling (reorder) → **persists across reload** (P1-DL-1).
- [x] v3 drop path matches the kept `dropPaneIntoZone` truth table for every zone (v3-DL-1 / v3-DL-4).
- [x] Sub-8px moves never reparent; click activates; context menu still works (P2-DL-4 / P2-DL-5).
- [x] Flag off → byte-identical to today; no v3 module runs (P0-DL-1 re-verified).
- [x] Docks anchored in every arrangement; footer sends (v3-DL-6 / P1-DL-6).
- [x] Mobile → flat fallback, no overlay / drag sources / context (v3-DL-8).
- [x] Exactly one preview ever on screen; no five-box dashed overlay; old `PaneDropOverlay` not imported (P2-DL-2).
- [x] No edits to `layout-tree*.ts` / `types.ts` / `panes/*` / migrations / old `Shell.tsx`; no new persistence layer (v3-DL-1 / P1-DL-1).
- [x] `npx tsc --noEmit` + `npm run lint` clean; integration + parity suites green; cv3d-01..03 suites still green.
- [x] **No `COCKPIT.md` change** (still flag-gated — updates at Phase 4 cutover); `docs/Work/capture/inbox.md` line added.

## Out of scope (explicit)

- Persistence hardening / per-doctor remember / reset / migration polish → Phase 3 (R-PERSIST3).
- Anchored-chrome refinements beyond "docks stay put + footer sends" → Phase 3 (R-CHROME3).
- Mobile editor-group / touch DnD → stays flat (v3-DL-8).
- Cutover / delete-old / `COCKPIT.md` → Phase 4 (R-CUTOVER).
- Geometry threshold tuning beyond "feels right at dogfood resolutions" → capture for post-launch (V3-R6).

## Decision log

- **Engine-as-oracle parity test:** the cheapest guard that v3 added no layout logic — assert the v3 drop path equals a direct `dropPaneIntoZone` call for every zone. If they diverge, the routing (cv3d-03) drifted, not the engine.
- **Accidental-drag is a first-class gate, not a nicety:** always-on dragging's biggest risk (V3-R3) is a click that becomes a move. The 8px-threshold assertion is the line between "Cursor-like" and "panes jump."
- **Re-verify flag-off here, not only in cv3d-01:** three build tasks touched shared v3 files + one page branch; an explicit flag-off mount assertion at the close is the cheapest insurance against a leaked v3 import in the live path.
- **Persistence asserted, not built:** Phase 2 rides `useShellLayout` (P1-DL-1). If the round-trip reveals a gap, capture it for Phase 3 (R-PERSIST3) — do not start a persistence layer here.

## References

- [`frontend/components/patient-profile/v3/CockpitV3Shell.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitV3Shell.tsx) — final assembly (context + docks + overlay + guard).
- [`frontend/lib/patient-profile/useShellLayout.ts`](../../../../../../frontend/lib/patient-profile/useShellLayout.ts) — persistence (debounce write, hydration) reused as the parity target.
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — `dropPaneIntoZone` (the parity oracle, via `foundation.ts`).
- [`frontend/components/patient-profile/v3/CockpitMobileFallback.tsx`](../../../../../../frontend/components/patient-profile/v3/CockpitMobileFallback.tsx) — the flat mobile path (no DnD).
- [`frontend/components/patient-profile/PatientProfilePage.tsx`](../../../../../../frontend/components/patient-profile/PatientProfilePage.tsx) — the flag branch (re-verify flag-off).
- cv3d-01..03 task files (same folder) + the Phase 1 close-gate ([`task-cv3c-04`](../../p1-shell/Tasks/task-cv3c-04-integration-persistence-and-gate.md)) whose persistence-assertion pattern this mirrors.
- Batch: [`plan-p2-cockpit-v3-dnd-batch.md`](../plan-p2-cockpit-v3-dnd-batch.md) · Order: [`EXECUTION-ORDER-p2-cockpit-v3-dnd.md`](./EXECUTION-ORDER-p2-cockpit-v3-dnd.md).

---

**Status:** `Done` (2026-05-31). Ran: `CockpitDnd.integration`, `CockpitDnd.parity`, `CockpitDnd.routing`, `PaneTabStripV3.dnd`, `CockpitDropOverlay`, `routeCockpitDrop`, `dropZoneGeometry`, `persistence` (60 tests). Persistence gate via `readPersistedLayout` (cpf-04 remount hang avoided).  
**Done when:** the Phase 2 gate + the batch's cross-cutting gate pass; status stamped here; Phase 3 (R-CHROME3 / R-PERSIST3 / R-MOBILE3) promoted to its own batch.
