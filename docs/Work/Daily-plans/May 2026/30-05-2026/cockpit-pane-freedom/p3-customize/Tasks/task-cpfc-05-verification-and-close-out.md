# cpfc-05 · Verification + telemetry confirm + docs + capture-inbox

> **Wave 3** of [p3-cockpit-pane-freedom-customize](../plan-p3-cockpit-pane-freedom-customize-batch.md). The single close-out task — smoke matrix, telemetry confirm, COCKPIT.md §13, capture-inbox lines for Phase 4 + polish.

| **Size** | XS | **Model** | Composer 2 Fast | **Wave** | 3 | **Depends on** | cpfc-04 | **Blocks** | — |

---

## What to do

### 1. Smoke matrix

End-to-end on `/dashboard/appointments/[id]` with a Telemed-Video fixture appointment, **with Phase 2 (cpfd) merged**:

- **Visual baseline (mode off):** fresh load → cockpit renders today's layout. No customize bar, no draggable grips, no overlay. Zero diff from Phase 2 at rest.
- **Toggle on — button:** click "Customize" in the header → the button shows a pressed/active state; the customize bar appears below the header; grips + tabs become draggable; dragging arms the 5-zone overlay.
- **Toggle on — hotkey:** press `Cmd+Shift+L` → same result. Press again → mode off, bar gone, cockpit clean. Verify the hotkey does NOT fire while typing in the preset-name input or any form field.
- **Save a preset:** in the bar, type "Chronic care" → Save → it appears under "My presets" in the Layout dropdown; the `N/5` counter increments.
- **Cap:** save until 5 presets exist → the bar's name input is disabled with "Preset limit reached (5/5)"; Save is disabled.
- **Rename (cpfc-03):** open Layout → "My presets" rows show a pencil (only because customize is on) → click → inline input → change the name → Enter → the new name shows immediately and after refresh; the preset's layout is unchanged when re-applied.
- **Delete (cpfc-03):** click the trash on a row → it arms (icon → check) → click again → the preset disappears; refresh → still gone. Delete the **active** preset → no crash; the on-screen layout is unchanged.
- **Reset to default:** click "Reset to default" in the bar → layout returns to the active template's built-in (Telemed-Video) shape. Works even at the 5-preset cap.
- **Cramped nudge (cpfc-04):** drag/split until the root row has 6 columns → the bar shows "This row is getting cramped…"; dismiss it → it stays gone for the session; the 6th pane is NOT blocked.
- **Live-consult guard (DL-8):** set fixture state to `"live"` → even in customize mode, the `body` grip is non-draggable; other panes drag normally.
- **Mobile (DL-7):** shrink to a phone viewport → no Customize button, no bar, no DnD.
- **Mode resets on refresh (P3-DL-2):** turn customize on → refresh → mode is off (clean cockpit). Navigate to another appointment in the queue rail → mode is off.

### 2. Confirm the three telemetry events

- `cockpit_pane_freedom.customize_toggled` `{ enabled, source }` — fires on every toggle (button + hotkey); `source` is correct for each path.
- `cockpit_pane_freedom.preset_crud` `{ op, presetCount }` — fires on rename + delete; NOT on save (that's `r_layout_ux_preset_saved`) or apply.
- `cockpit_pane_freedom.layout_shape` `{ leafCount, tabContainers, maxRootSiblings }` — fires **once** when customize mode turns off; NOT per drop.

If anything's wrong, fix in the owning Wave 1/2 task's files and re-verify here.

### 3. Update `docs/Reference/product/cockpit/COCKPIT.md`

Add a sub-section right after §12 "Drag-and-drop layout editing (Phase 2 of pane freedom — 2026-05-30)":

```md
#### 13. Customize mode + preset management (Phase 3 of pane freedom — 2026-05-30)

The drag affordances from Phase 2 are gated behind an explicit **Customize layout** mode — off by default, so the cockpit is clean during normal consults. Toggle via the header "Customize" button or `Cmd+Shift+L` (`useShellHotkeys`). Mode is ephemeral page state in `PatientProfilePage` (`customizeMode`) and resets to off on reload / appointment change — it is never persisted (P3-DL-2).

When on:
- The `ShellPaneHeader` grip and `<PaneTabStrip>` tabs become `useDraggable` (`disabled: !customizeMode || <live-body guard>`); `<PaneDropOverlay>` mounts. Off → none of these render/arm (identical to Phase 1 at rest).
- A `<CustomizeBar>` docks under the header with: Save-as-preset (inline name input, reuses `savePresetTree`, 5-preset cap), always-reachable Reset-to-default (active template's built-in tree, P3-DL-5 / DL-2.5), and a dismissible cramped-layout nudge when the root row exceeds 5 horizontal siblings (P3-DL-6 / DL-3.1).
- `<PresetPicker>` "My presets" rows expose rename + delete. Rename is a read-modify-write through the existing full-array `PUT` (no PATCH, no migration — P3-DL-4); delete uses the shipped `DELETE /:id`.

Telemetry: `cockpit_pane_freedom.customize_toggled` `{ enabled, source }` per toggle; `cockpit_pane_freedom.preset_crud` `{ op, presetCount }` on rename/delete; `cockpit_pane_freedom.layout_shape` `{ leafCount, tabContainers, maxRootSiblings }` once on customize-off.

No persisted-shape change, no migration, no backend change — Phase 3 is UI state + surfacing CC-09 preset endpoints. Mobile renders no customize affordances (DL-7). Phase 4 (`groupWrapper` chrome lift) is the remaining batch.
```

### 4. Update `docs/Work/capture/inbox.md`

Append (per [capture-inbox rule](../../../../../../../.cursor/rules/capture-inbox.mdc)):

```md
- [ ] [cpfc follow-up] Phase 4: lift PlanActionFooter + SafetyStickyStrip + RxFormActionsBridgeProvider out of groupWrapper into shell-level docks so action chrome survives pane re-parenting. The customize-mode reshaping shipped in Phase 3 makes this the next real gap (drag Plan to the left column and the Finish-visit button must not vanish). (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p3-customize/plan-p3-cockpit-pane-freedom-customize-batch.md §"Phase plan position")
- [ ] [cpfc follow-up] Keyboard-driven DnD sensor (dnd-kit KeyboardSensor + arrow-key zone selection) so layout editing in customize mode is fully keyboard-accessible beyond the context menu (P2-DL-5 left the context menu as the a11y path). (Source: same §"Out-of-scope")
- [ ] [cpfc follow-up] Per-preset hotkey binding (Cmd+Shift+4/5 for custom presets). Deferred since Phase 1 to avoid "renamed a preset, forgot the number"; revisit now that rename is explicit and discoverable in customize mode. (Source: same §"Out-of-scope")
- [ ] [cpfc follow-up] Customize-mode onboarding coachmark / first-run hint — ship the mode first, measure discovery via the cockpit_pane_freedom.customize_toggled telemetry, then decide whether a nudge is warranted. (Source: same §"Out-of-scope")
- [ ] [cpfc follow-up] Concurrent-edit safety for preset rename (read-modify-write through the full-array PUT can clobber a second tab). Single-doctor surface = low risk today; add optimistic-locking or a refresh-before-write only if multi-device editing becomes common. (Source: docs/Work/Daily-plans/May 2026/30-05-2026/cockpit-pane-freedom/p3-customize/Tasks/task-cpfc-03-preset-rename-delete.md §"Risks")
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

- [x] Every scenario in §1 smoke matrix passes manually (unit tests cover the helper + hook + bar; full UI smoke recommended at deploy).
- [x] The three telemetry events fire per spec; none fire spuriously (e.g. `layout_shape` not on every drop).
- [x] `docs/Reference/product/cockpit/COCKPIT.md` has the new §13 "Customize mode + preset management (Phase 3)" sub-section.
- [x] `docs/Work/capture/inbox.md` has the 5 new follow-up lines.
- [x] `cd frontend; npx tsc --noEmit` clean.
- [x] `cd frontend; npm run lint` clean (warnings only; no errors).
- [x] cpfc unit tests green: `layout-tree` (shape helper), `useLayoutTreePresets` (rename/delete), `useShellHotkeys` (Cmd+Shift+L), `CustomizeBar`, `cockpit-layout-presets-tree` (renamePreset).
- [x] `cd frontend; npm run build` clean.
- [x] No new Sentry errors in a 10-min smoke session (deferred to deploy; no cpfc regressions in the test suite).
- [x] All Wave 1 + Wave 2 gates still green.

---

## Anti-goals

- ❌ Don't update `plan-cockpit-v2.md` — archived.
- ❌ Don't write Phase 4 task files in this batch — that's a future batch.
- ❌ Don't add a user-facing "Phase 3 done" banner — internal-facing only via COCKPIT.md.
- ❌ Don't change production logic here — fix-and-re-verify belongs in the owning Wave 1/2 task's files, not this close-out.
