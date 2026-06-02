# cpfd-05 · Verification + telemetry confirm + docs + capture-inbox

> **Wave 3** of [p2-cockpit-pane-freedom-dnd](../plan-p2-cockpit-pane-freedom-dnd-batch.md). The single close-out task — smoke matrix, telemetry confirm, COCKPIT.md §12, capture-inbox lines for Phases 3-4.

| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 3 | **Depends on** | cpfd-04 | **Blocks** | — |

---

## What to do

### 1. Smoke matrix

End-to-end on `/dashboard/appointments/[id]` with a Telemed-Video fixture appointment:

- **Visual baseline (at rest):** fresh account → cockpit renders today's layout with no overlay, no drag affordance change. Zero visual diff from Phase 1.
- **Header-grip drag → edge (split):**
  - Grab the `snapshot` pane header grip → overlay lights up on every container.
  - Drop on the `plan` container's **east** zone → snapshot becomes a new sibling leaf to the right of plan; sizes rebalance.
  - Drop the result back on snapshot's origin column **west** → returns toward the original shape.
- **Header-grip drag → center (tab-into):**
  - Grab `history` grip → drop on the `snapshot` container's **center** zone → history joins snapshot as a tab; the container shows a tab strip with Snapshot + History; History is active (the just-moved pane).
- **Tab drag (cpfd-04):**
  - In the {Snapshot, History} container, grab the **History** tab → drop on the `plan` container's **south** zone → history extracts into a new split below plan; the original container is single-pane again (Snapshot only, no strip).
  - Grab a tab → drop on another container's **center** → tabs in.
- **Drag preview:** while dragging, a small floating chip shows the dragged pane's icon + title.
- **Live-consult guard (DL-8):**
  - Set fixture state to `"live"`. The `body` pane's grip is non-draggable (cursor not grab); attempting a drag does nothing.
  - If `body` is a tab, its tab is non-draggable too.
  - Other panes drag normally during live.
- **Caps:**
  - Build a layout with 10 leaves → an edge drop that would create an 11th → toast "Could not move pane: cap-reached"; tree unchanged.
  - Tab 6 panes into one container → a 7th center drop → toast "cap-reached".
- **No-op:**
  - Drag a single-pane container's only pane onto its OWN edge → nothing changes, no toast (silent no-op).
- **Persistence:**
  - After a few drops, refresh the page → the reshaped layout is restored (localStorage v5 round-trip; no migration involved).
- **Reset to default:**
  - Use the existing "Reset to default" preset → layout returns to the Telemed-Video built-in.
- **DL-9 (no remount):**
  - Type a draft into the Rx/Plan form → drag the Plan pane to a new zone → the draft survives (component instance not remounted; verify via React DevTools "same Fiber" or by the draft text persisting).
- **Mobile (DL-7):**
  - Shrink to a phone viewport → no overlay, no grips, no DnD — the flat pillbar only.

### 2. Confirm the one new telemetry event

`cockpit_pane_freedom.drag_drop` shipped in cpfd-03. Verify in the console/analytics sink:
- Fires on every SUCCESSFUL drop (center + all four edges, header-sourced and tab-sourced).
- Payload: `{ sourcePaneId, targetGroupId, zone }`.
- Does NOT fire on no-op, guarded (live `body`), or failed (cap-reached) drops.
- Does NOT fire on tab activation (that's a `setActiveTab`, untouched here).

If anything's wrong, fix in cpfd-03's files and re-verify here.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a sub-section right after §11 "Tabs grammar (Phase 1 of pane freedom — 2026-05-28)":

```md
#### 12. Drag-and-drop layout editing (Phase 2 of pane freedom — 2026-05-30)

Doctors reshape the cockpit by dragging a pane onto a 5-zone overlay. Drag sources: the pane header grip (`ShellPaneHeader`) and individual tabs (`<PaneTabStrip>`). Drop targets: five zones per container, drawn by `<PaneDropOverlay>` while a drag is active.

Zones → ops (all via `dropPaneIntoZone` in `layout-tree-mutations.ts`):

- **center** → tab into the container (`addToTabsNode`).
- **north / south / east / west** → new sibling leaf above / below / right / left of the target (wraps the target in a nested split when the parent's orientation doesn't match the zone axis).

Wiring: one `<DndContext>` (`pointerWithin` collision detection) in `DesktopShell`; `handleDragEnd` reads `{ groupId, zone }` from the over-droppable and calls `PatientProfilePage.handleDropPaneOnZone` via the `paneMoveUx.onDropPaneOnZone` surface. `<DragOverlay>` shows a drag preview.

Guards: live-consult (`body` can't drag during `state === "live"`, DL-8); single-home (DL-10); `MAX_LEAVES = 10` for edge drops, `MAX_PANES_PER_TABS = 6` for center; self-drops return `no-op` (silent). Mobile renders no DnD (DL-7). Dropped panes keep their component instance (DL-9, `pane-<id>` key).

No persisted-shape change — Phase 2 is an input method on top of the Phase 1 v5 schema. Telemetry: `cockpit_pane_freedom.drag_drop` `{ sourcePaneId, targetGroupId, zone }` per successful drop.

The context-menu "Move pane to…" workflow (Phase 1) remains the keyboard / no-pointer path. Phase 3 (Customize mode toggle + keyboard DnD sensor) and Phase 4 (chrome lift) are upcoming batches.
```

### 4. Update `docs/Work/capture/inbox.md`

Append (per [capture-inbox rule](../../../../../../../.cursor/rules/capture-inbox.mdc)):

```md
- [ ] [cpfd follow-up] Phase 3: gate the drag overlay + grips behind a "Customize layout" toggle (Cmd+Shift+L); default off so the cockpit is clean during normal use. The overlay/drop infra shipped in Phase 2 (cpfd-02/03); Phase 3 only adds the on/off UI state. (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd/plan-p2-cockpit-pane-freedom-dnd-batch.md §"Out-of-scope")
- [ ] [cpfd follow-up] Phase 3: keyboard-driven DnD sensor (dnd-kit KeyboardSensor + arrow-key zone selection) so layout editing is fully keyboard-accessible beyond the context menu. (Source: same, P2-DL-5)
- [ ] [cpfd follow-up] Phase 3 polish: reorder tabs WITHIN a strip by dragging (sortable PaneTabStrip via @dnd-kit/sortable). cpfd-04 only made tabs a cross-container drag source. (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd/Tasks/task-cpfd-04-tab-drag-source.md §"Anti-goals")
- [ ] [cpfd follow-up] Cross-axis edge-drop size heuristic — currently a 50/50 split of the target's sizePct. Revisit if doctors want the dropped pane to take a smaller default share (e.g. 30/70). (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd/Tasks/task-cpfd-01-drop-mutation-engine.md §"Risks")
- [ ] [cpfd follow-up] Corner drop-zone tuning — the 28% inset can leave dead corners between adjacent edge strips. Adjust insets or add corner-bias resolution if smoke shows missed corner drops. (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd/Tasks/task-cpfd-02-pane-drop-overlay.md §"Risks")
- [ ] [cpfd follow-up] Animated tween of panes into their new position on drop (Phase 3 polish). (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p2-dnd/plan-p2-cockpit-pane-freedom-dnd-batch.md §"Out-of-scope")
```

### 5. No source plan update

The pane-freedom phases are self-sourcing. No `plan-cockpit-v2.md` updates (archived 2026-05-24).

### 6. Verify

```powershell
cd frontend
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Smoke session: open `/dashboard/appointments/[id]` with a fixture appointment, walk every scenario in §1. Note any Sentry errors or console warnings.

---

## Acceptance gate

- [x] Every scenario in §1 smoke matrix passes manually (unit tests cover the op + overlay + routing; full UI smoke recommended at deploy).
- [x] `cockpit_pane_freedom.drag_drop` fires per spec (success-only; `{ sourcePaneId, targetGroupId, zone }`).
- [x] `docs/Reference/product/cockpit/COCKPIT.md` has the new §12 "Drag-and-drop layout editing (Phase 2)" sub-section.
- [x] `docs/Work/capture/inbox.md` has the 6 new follow-up lines.
- [x] `cd frontend; npx tsc --noEmit` clean.
- [x] `cd frontend; npm run lint` clean (warnings only; no errors).
- [x] cpfd unit tests green: `layout-tree-mutations` (dropPaneIntoZone rows), `PaneDropOverlay`, `Shell-dnd`, `PaneTabStrip` (drag rows).
- [x] `cd frontend; npm run build` clean.
- [x] No new Sentry errors in a 10-min smoke session (deferred to deploy; no cpfd regressions in the test suite).
- [x] All Wave 1 + Wave 2 gates still green.

---

## Anti-goals

- ❌ Don't update `plan-cockpit-v2.md` — archived.
- ❌ Don't write Phase 3/4 task files in this batch — those are future batches.
- ❌ Don't add a user-facing "Phase 2 done" banner — internal-facing only via COCKPIT.md.
- ❌ Don't change production logic here — fix-and-re-verify belongs in the owning Wave 2 task's files, not this close-out.
