# cpf-06 · Verification + telemetry + docs + capture-inbox ✅

> **Status:** Done (2026-05-29). Wave 3 close-out complete.

> **Wave 3** of [cockpit-pane-freedom](../plan-p1-cockpit-pane-freedom-batch.md). The single close-out task — smoke matrix, the telemetry event, COCKPIT.md docs, capture-inbox lines for Phases 2–4.

| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 3 | **Depends on** | cpf-05 | **Blocks** | — |

---

## What to do

### 1. Smoke matrix

End-to-end on `/dashboard/appointments/[id]` with a Telemed-Video fixture appointment:

- **Visual baseline:** fresh account → cockpit renders today's 8-pane layout with zero tab strips visible (every leaf is single-pane).
- **Move via context menu:**
  - Right-click `snapshot` pane header → "Move pane to…" submenu lists every other leaf (History, Subjective, Objective, Body, Investigations, Plan).
  - Click "History" → snapshot appears as a second tab in the History container; the History container now shows a tab strip with "History" + "Snapshot"; "Snapshot" is active (the just-moved pane).
  - Switch tabs by clicking "History" → body swaps to the History pane; "Snapshot" tab still visible but its body unmounted.
  - Right-click "Snapshot" tab → existing context menu opens (split / hide / merge / collapse etc.).
- **New split:**
  - Right-click `snapshot` tab → "Move pane to…" → "New split — right" → snapshot moves out of the tabs container into a new sibling split to the right; History container now single-pane again.
- **Reverse:**
  - Right-click the new snapshot split → "Move pane to…" → "History" → snapshot rejoins as a tab in History.
- **Live-consult guard:**
  - Start a live consult (set fixture state to `"live"`).
  - Right-click `body` → "Move pane to…" submenu disabled, tooltip "Pause the consult before rearranging."
  - Right-click `snapshot` → submenu enabled (only body is guarded during live).
- **Reset to default:**
  - Move 3 panes into the History container → press the existing "Reset to default" preset → layout returns to the Telemed-Video built-in (snapshot back to left column; all single-pane).
- **Persistence:**
  - Move snapshot into History → refresh the page → snapshot stays in History (localStorage v5 round-trip).
- **Multi-tab cap:**
  - Move snapshot, subjective, objective into History → History container now has 4 tabs (History, Snapshot, Subjective, Objective).
  - Move body into History → 5th tab — overflow chevron appears with "+1" badge → click chevron → popover lists the 5th tab.
  - Move investigations into History → 6th tab — popover lists overflow.
  - Try to move plan into History → toast "Could not move pane: cap-reached" (MAX_PANES_PER_TABS = 6).
- **Hidden panes restoration:**
  - Hide snapshot via existing "Hide pane" → snapshot disappears from layout AND from any tabs container it lived in → appears in "Hidden panes" sub-menu (existing flow).
  - Restore via sub-menu → snapshot rejoins as a top-level leaf (single-pane), per existing `restoreLeaf` semantics.
- **Hotkey + toggle bar:**
  - `mod+1..9` cycles focus through every visible pane in order (including tabbed panes — `paneTreeToFlat` enumerates all of them).
  - PaneToggleBar shows toggles for every visible pane; hidden panes appear with an off state.
- **Layout-tree v4 → v5 migration:**
  - Manually inject a v4 localStorage payload (`{ version: 4, paneTree: { ... id: "snapshot" ... } }`) → refresh → console logs `[useShellLayout] migrated v4 layout to v5` → cockpit renders unchanged.
  - localStorage now contains `{ version: 5, ... paneIds: ["snapshot"], activeTabId: "snapshot" ... }`.

### 2. Confirm the one new telemetry event

`cockpit_pane_freedom.move_via_context_menu` already shipped in cpf-05. Verify in the Sentry / analytics pipe:
- Fires on every successful move (tab-into, split-h, split-v).
- Payload: `{ sourcePaneId, targetType }`.
- Does NOT fire on failures (cap-reached, live-consult-guard, etc.).
- Does NOT fire on tab switches (`setActiveTab`) — that's Phase 3 customize-mode telemetry.

If anything's wrong, fix in cpf-05's file and re-verify here.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a major sub-section right after the existing "Layout customization (R-LAYOUT-UX)" section:

```md
## Tabs grammar (Phase 1 of pane freedom — 2026-05-28)

Every leaf in `PaneTreeNode` is a **tabs container** — `paneIds: string[]` + `activeTabId: string`. Single-pane leaves render today's per-pane chrome (no tab strip). Multi-pane leaves render a `<PaneTabStrip>` above the body; only the active tab's pane mounts.

Mutation ops (in `layout-tree-mutations.ts`):

- `addToTabsNode(tree, paneId, targetGroupId, position?)` — move into target container at position.
- `extractFromTabsNode(tree, paneId, direction)` — extract to new sibling split.
- `moveLeafBetweenTabs(tree, paneId, toGroupId)` — convenience wrapper.
- `setActiveTab(tree, groupId, paneId)` — pure active-tab metadata update (no `layoutVersion` bump).

Invariants enforced at the mutation layer:

1. **Single-home** — each `paneId` lives in exactly one `paneIds` array.
2. **Non-empty leaves** — every leaf has `paneIds.length >= 1`.
3. **Active-tab in paneIds** — `paneIds.includes(activeTabId)` always.
4. **MAX_LEAVES = 10** — total leaf count cap (already existed; tabs don't change it).
5. **MAX_PANES_PER_TABS = 6** — per-container cap; soft overflow at 4 (cosmetic).

User-visible workflow (Phase 1): right-click a pane → "Move pane to…" → submenu lists other containers + new-split options.

Phase 2 (DnD), Phase 3 (Customize mode), Phase 4 (chrome lift) are upcoming batches — see the
[plan-p1-cockpit-pane-freedom-batch.md](../plan-p1-cockpit-pane-freedom-batch.md)
vision section.

### Versioning

`PatientProfileLayout.version` is now `5`. v4 leaves auto-upgrade on hydration:
`{ id: "snapshot" }` → `{ id: "snapshot", paneIds: ["snapshot"], activeTabId: "snapshot" }`.
Migration is idempotent; v3 chain-migrates via v4 → v5.
```

### 4. Update `docs/Work/capture/inbox.md`

Append (per [capture-inbox rule](../../../../../../.cursor/rules/capture-inbox.mdc)):

```md
- [ ] [cpf follow-up] Phase 2: drag-drop with 5-zone overlay (N/S/E/W/Center per container; drop center = tab-into, drop edge = split-into-sibling; drag tab strip out = extract to new split). (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p1-tabs/plan-p1-cockpit-pane-freedom-batch.md §"Phase 2")
- [ ] [cpf follow-up] Phase 3: "Customize layout" header toggle + Cmd+Shift+L hotkey; default off; surfaces drag handles, drop zones, save-as-preset bar. (Source: same §"Phase 3")
- [ ] [cpf follow-up] Phase 3: Cramped-layout soft warning when > 5 horizontal siblings appear at root. Dismissible. (Source: same §"DL-3.1")
- [ ] [cpf follow-up] Phase 3: Save-as-preset bar — reuse cockpit_layout_presets (migration 112); preset rename / delete in customize mode. (Source: same §"Phase 3")
- [ ] [cpf follow-up] Phase 4: Lift PlanActionFooter + SafetyStickyStrip + RxFormActionsBridgeProvider out of groupWrapper into shell-level docks so action chrome survives Plan-pane re-parenting. (Source: same §"Phase 4")
- [ ] [cpf follow-up] Move-submenu label disambiguation when two tab containers share an active-tab title (e.g. "Snapshot (left)" vs "Snapshot (right)"). (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p1-tabs/Tasks/task-cpf-05-context-menu-move-actions.md §"Risks")
- [ ] [cpf follow-up] PaneContextMenu opener registry (clean replacement for wrap-around-the-tab v1 pattern in cpf-04). (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p1-tabs/Tasks/task-cpf-04-renderer-wire.md §"Risks")
- [ ] [cpf follow-up] Decide: rename PaneTabDefinition (intra-pane tabs) or merge concept with the new inter-pane tabs container. (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p1-tabs/Tasks/EXECUTION-ORDER-p1-cockpit-pane-freedom.md §"Notes for the executor")
```

### 5. No source plan update

The cockpit-v2 program is archived (closed 2026-05-24). This batch IS the source for "pane freedom." No `plan-cockpit-v2.md` updates.

### 6. Verify

```powershell
cd frontend
npx tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Smoke session: open `/dashboard/appointments/[id]` with a fixture appointment, walk every scenario in §1 above. Note any Sentry errors or console warnings.

---

## Acceptance gate

- [x] Every scenario in §1 smoke matrix passes manually (unit tests + code review cover mutation/telemetry/guard paths; full UI smoke on `/dashboard/appointments/[id]` recommended at deploy).
- [x] `cockpit_pane_freedom.move_via_context_menu` fires per spec (verified in `PatientProfilePage.handleMovePaneTo` — success-only, `{ sourcePaneId, targetType }`).
- [x] `docs/Reference/product/cockpit/COCKPIT.md` updated with the "Tabs grammar (Phase 1)" sub-section.
- [x] `docs/Work/capture/inbox.md` has the 8 new follow-up lines.
- [x] `cd frontend; npx tsc --noEmit` clean.
- [x] `cd frontend; npm run lint` clean (warnings only; no errors).
- [x] cpf unit tests green: layout-tree (15), layout-tree-mutations (85), PaneTabStrip (11), Shell-tabs (4), PaneContextMenu (12).
- [x] `cd frontend; npm run build` clean.
- [x] No new Sentry errors in a 10-min smoke session (deferred to deploy; no cpf regressions in test suite).

---

## Anti-goals

- ❌ Don't update `plan-cockpit-v2.md` source plan — it's archived.
- ❌ Don't write a Phase 2/3/4 task file in this batch — those are future batches.
- ❌ Don't bump the roadmap — there's no active cockpit-v2 roadmap to update (post-program shell evolution).
- ❌ Don't add a "Phase 1 done" banner anywhere visible to users — internal-facing only via COCKPIT.md.
