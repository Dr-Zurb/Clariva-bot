# Task ppr-15d: Preset model B + hotkey rewiring

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 4.5, Lane α step 3 — **S, ~1h**

---

## Task overview

After ppr-15c the shell renders only **visible** panes and the toggle bar drives visibility. Two pieces of behaviour still encode the old "collapsed strip" mental model and need to come along:

1. **Presets (Q6 / Model B).** Built-in presets (Triage / Consult / Document) currently encode `collapsed: true/false` per pane. They become **full pane snapshots** (`paneOrder` + `paneState[id].hidden` + `paneState[id].sizePct`). Applying a preset auto-toggles every pane to match the preset's hidden bits. The presets list itself does not change based on which toggles are active — all three built-ins are always offered, every preset is a full snapshot, and applying it overwrites the current visible set.

2. **Hotkeys (Q7).** `[` / `]` are reinterpreted as **hide leftmost / hide rightmost**. New `Cmd/Ctrl+1/2/3` hotkeys toggle the visibility of pane index 1 / 2 / 3 in `paneOrder`. The old `Cmd/Ctrl+Shift+1..3` shortcuts (apply preset 1 / 2 / 3) stay the same — preset application is a separate concept.

**Estimated time:** ~1h.

**Status:** Pending.

**Hard deps:** ppr-15a (rename), ppr-15b (toggle bar exists), ppr-15c (`setPaneHidden` is the canonical mutator).

**Source:** Mid-batch amendment in [plan-patient-profile-shell-rebuild-batch.md § Mid-batch amendment](../plan-patient-profile-shell-rebuild-batch.md#mid-batch-amendment-toggle-bar-redesign-ppr-15), Decisions Q6 + Q7.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- [`frontend/lib/patient-profile/built-in-presets.ts`](../../../../../../frontend/lib/patient-profile/built-in-presets.ts) — the 3 preset definitions.
- [`frontend/lib/patient-profile/preset-translation.ts`](../../../../../../frontend/lib/patient-profile/preset-translation.ts) — translator (already updated to v3 in ppr-15a).
- [`frontend/hooks/useShellHotkeys.ts`](../../../../../../frontend/hooks/useShellHotkeys.ts) — hotkey hook.
- [`frontend/lib/patient-profile/__tests__/built-in-presets.test.ts`](../../../../../../frontend/lib/patient-profile/__tests__/built-in-presets.test.ts) (if exists).
- [`frontend/hooks/__tests__/useShellHotkeys.test.ts`](../../../../../../frontend/hooks/__tests__/useShellHotkeys.test.ts) (if exists).

**Estimated turns:** 3-4 turns.

---

## Acceptance criteria

### Built-in presets — full snapshots (Q6 / Model B)

- [ ] In [`frontend/lib/patient-profile/built-in-presets.ts`](../../../../../../frontend/lib/patient-profile/built-in-presets.ts), each preset is a **full** `PatientProfileLayout`:

  ```ts
  export const TRIAGE_PRESET: PatientProfileLayout = {
    version: 3,
    paneOrder: ["chart", "body", "rx"],
    paneState: {
      chart: { sizePct: 60, hidden: false },
      body: { sizePct: 40, hidden: false },
      rx: { sizePct: 0, hidden: true },
    },
  };

  export const CONSULT_PRESET: PatientProfileLayout = {
    version: 3,
    paneOrder: ["chart", "body", "rx"],
    paneState: {
      chart: { sizePct: 25, hidden: false },
      body: { sizePct: 50, hidden: false },
      rx: { sizePct: 25, hidden: false },
    },
  };

  export const DOCUMENT_PRESET: PatientProfileLayout = {
    version: 3,
    paneOrder: ["chart", "body", "rx"],
    paneState: {
      chart: { sizePct: 0, hidden: true },
      body: { sizePct: 30, hidden: false },
      rx: { sizePct: 70, hidden: false },
    },
  };
  ```

  Tweaks:
  - **Triage** = focus on chart + body, Rx hidden (the doctor is reviewing history before prescribing).
  - **Consult** = balanced 25 / 50 / 25, all visible (the default workhorse).
  - **Document** = chart hidden, body + Rx focus (the doctor is finalising the prescription, doesn't need to re-look at history).

  These tweaks are starting points; the doctor can override any of them and save a custom preset.

- [ ] If the preset definitions change shape, update the existing built-in-preset tests (or add them if missing) to cover:
  - Each preset round-trips through `validateLayout` cleanly.
  - Hidden panes have `sizePct: 0` (irrelevant when hidden, but a stable canonical value).
  - `paneOrder.length === 3` for all built-ins.

### `usePatientProfilePresets` apply behaviour

- [ ] In `frontend/hooks/usePatientProfilePresets.ts` (or wherever the apply call lives), the `applyPreset(presetId)` flow:
  1. Look up the preset's `PatientProfileLayout` (built-in or custom — both are now full snapshots).
  2. Call `shellRef.current?.applyLayout(presetLayout)` — replaces the entire layout, including `hidden` bits.
  3. The shell's `applyLayout` already cascades to `<PaneToggleBar>` via the same `paneState` prop — no extra wiring needed.

- [ ] **Custom presets that auto-toggle** (Q6 nuance — "if user select a custom toggle it autotoggles"). When the doctor saves a custom preset, capture the CURRENT `paneOrder` + `paneState` (including `hidden` bits + `sizePct`). Applying it later restores both the visibility set and the sizes. Already handled by Model B (full snapshot) — just make sure the save path captures `hidden`, not just `sizePct`.

- [ ] If a v2-shape custom preset (with `collapsed`) is read from `doctor_settings.cockpit_layout_presets`, the v2→v3 migration in `validateLayout` (ppr-15a) does the rename. The hook just calls `applyLayout` and trusts the validator.

### Hotkey rewiring (Q7)

In [`frontend/hooks/useShellHotkeys.ts`](../../../../../../frontend/hooks/useShellHotkeys.ts):

- [ ] **Reinterpret `[` / `]`:**
  - `[` → `setPaneHidden(visiblePaneOrder[0], true)` — hides the leftmost visible pane.
  - `]` → `setPaneHidden(visiblePaneOrder[visiblePaneOrder.length - 1], true)` — hides the rightmost visible pane.
  - If only one pane is visible, `[` and `]` both act on that one (hides it; the empty-state takes over).
  - If zero visible, no-op.
  - Update the JSDoc on the hotkey hook to reflect the new semantics.

- [ ] **Add `Cmd/Ctrl+1/2/3`:**
  - `Cmd/Ctrl+1` → toggle visibility of `paneOrder[0]` (regardless of currently hidden state).
  - `Cmd/Ctrl+2` → toggle visibility of `paneOrder[1]`.
  - `Cmd/Ctrl+3` → toggle visibility of `paneOrder[2]`.
  - Implementation: read `paneOrder` (NOT `visiblePaneOrder`) so the index is stable. Then `setPaneHidden(id, !paneState[id]?.hidden)`.

- [ ] **Keep `Cmd/Ctrl+Shift+1/2/3`** (apply built-in preset 1/2/3) unchanged — they apply Triage / Consult / Document. These are independent of the new toggle hotkeys.

- [ ] **Keep `Cmd/Ctrl+Enter`** (send Rx) and `Cmd/Ctrl+Shift+Enter` (open wrap-up) unchanged.

- [ ] Update or add unit tests in `frontend/hooks/__tests__/useShellHotkeys.test.ts`:
  1. `[` hides the leftmost visible pane.
  2. `]` hides the rightmost visible pane.
  3. `[` is a no-op when no panes are visible.
  4. `Cmd+1` toggles `paneOrder[0]`'s hidden bit.
  5. `Cmd+2` toggles `paneOrder[1]`'s hidden bit.
  6. `Cmd+3` toggles `paneOrder[2]`'s hidden bit.
  7. `Cmd+Shift+1` applies the Triage preset (calls `applyPreset("triage")`).
  8. `Cmd+1` does NOT apply a preset (separates the concerns).

### Help/cheatsheet update

- [ ] If there's a hotkey cheatsheet anywhere in the UI (search `frontend/` for "Hotkeys" or "Shortcuts" or "Cmd+"), update it to reflect the new keys.
- [ ] If there's no cheatsheet, skip — out of scope for ppr-15d.

### Tests + lint

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend vitest run lib/patient-profile/ hooks/` — all green.

### Manual smoke

- [ ] Open `/dashboard/appointments/[id]/v2`. All three pills visible.
- [ ] Press `Cmd+Shift+2` (Consult preset). All three panes visible at 25 / 50 / 25.
- [ ] Press `Cmd+Shift+1` (Triage preset). Rx pane hides. Toggle bar's Rx pill greys out. Chart + Body fill at 60 / 40.
- [ ] Press `Cmd+Shift+3` (Document preset). Chart hides. Body + Rx fill at 30 / 70.
- [ ] Press `]`. The rightmost visible pane (Rx) hides. Body fills the viewport.
- [ ] Press `Cmd+1`. Chart toggles back on. Toggle bar's Chart pill becomes active.
- [ ] Open the Layout dropdown. All three built-in presets are listed regardless of current visibility set.
- [ ] Save a custom preset (e.g. "Just chart"). Toggle Body + Rx off, save preset. Reload. Apply the custom preset → only Chart visible.

---

## Out of scope

- **Live-consult guard on hotkey-initiated hides.** Per ppr-15e: only the toggle-bar click path runs `onBeforeHide`. Hotkey path is a power-user shortcut and bypasses the warning (and hotkey users are typically aware of what they're hitting).
  > **Open question:** if user-test feedback says even hotkey hides should warn during a live call, fold the gate into `setPaneHidden` itself in a follow-up. For now, simpler is safer.
- **Adapt the built-in preset list based on currently-visible panes** (Q6's earlier interpretation A). Per the user's clarified Q6: Model B — all built-ins always shown, applying overrides the visible set.
- **Walk-in mode preset variants.** Walk-in is out of scope for the whole batch.
- **Rebinding hotkeys (let doctor customise).** Defer to a future settings task.

---

## Files expected to touch

**Modified:**
- `frontend/lib/patient-profile/built-in-presets.ts` (~30 LOC — full preset re-author)
- `frontend/hooks/useShellHotkeys.ts` (~+20 LOC for new bindings, ~10 LOC re-interpret)
- `frontend/hooks/__tests__/useShellHotkeys.test.ts` (~+8 cases)
- `frontend/lib/patient-profile/__tests__/built-in-presets.test.ts` (if exists; assertion updates only)
- (optional) the help/cheatsheet UI surface if it exists.

**New:** none.

**Tests:** ~8 new cases.

---

## Notes / open decisions

1. **Why does `Cmd+1` toggle and not "show only pane 1"?** Toggling is a user-mental-model match: same key turns it on AND off, like the Cursor sidebar shortcut. "Show only pane 1" would be a different feature (focus mode) — out of scope.
2. **Why does `[` HIDE rather than SHOW the leftmost?** In v1, `[` collapsed the left column — same direction (less left). The new behaviour (hide vs collapse) is a semantic upgrade, not a directional flip. Less surprise.
3. **What if `]` is pressed when only 1 pane is visible — does it hide?** Yes. Empty-state then renders. Doctor presses `Cmd+1/2/3` to bring something back.
4. **What if a preset's `paneOrder` doesn't match the current `paneOrder`?** `applyPreset` overwrites `paneOrder`. The toggle bar re-renders with the preset's order. (This matches the existing v1 behaviour where a preset overwrote the slot order too.)
5. **Why not clear `sizePct` on hidden panes (set to 0)?** We could — and the built-in presets do, for cleanliness. But preserving the doctor's last-used `sizePct` lets re-show land at the previous size. Default we set `sizePct: 0` only for the seed; the runtime `setPaneHidden` flow keeps the previous size intact.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** Mid-batch amendment Q6 (preset model B), Q7 (hotkey rewiring).
- **Hotkey precedent:** [`frontend/hooks/useShellHotkeys.ts`](../../../../../../frontend/hooks/useShellHotkeys.ts) (existing bindings).
- **Preset precedent:** v1's `useCockpitPresets` (the same backend endpoint, same write semantics, just v3 payload now).
- **Next task:** [`task-ppr-15e-live-consult-guard.md`](./task-ppr-15e-live-consult-guard.md) — fresh chat after ppr-15d is green.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Pending
