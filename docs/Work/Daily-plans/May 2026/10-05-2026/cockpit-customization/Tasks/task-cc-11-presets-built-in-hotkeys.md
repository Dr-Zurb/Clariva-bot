# Task cc-11: Built-in preset hotkeys (`Cmd/Ctrl+Shift+1/2/3`)

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase D, Lane β step 1 — **XS, ~30min**

---

## Task overview

The cc-06 dropdown menu already shows a `<kbd>⌘⇧1</kbd>` hint next to each built-in preset. cc-11 makes those hotkeys actually fire.

Three new bindings on `useCockpitHotkeys`:

- `Cmd/Ctrl+Shift+1` → apply `BUILT_IN_PRESETS.triage.layout`
- `Cmd/Ctrl+Shift+2` → apply `BUILT_IN_PRESETS.consult.layout`
- `Cmd/Ctrl+Shift+3` → apply `BUILT_IN_PRESETS.document.layout`

CC-D5 lock: hotkeys are for built-ins ONLY. Custom presets do not get hotkeys (avoids the "doctor changes preset and forgets which key was bound" failure mode).

The existing rail-toggle bindings (`[` / `]`) are untouched. The existing `Cmd/Ctrl+Enter` and `Cmd/Ctrl+Shift+Enter` bindings are untouched.

**Estimated time:** ~30 min (15 min code, 15 min hotkey conflict check + manual verification across browsers).

**Status:** Pending.

**Hard deps:** cc-06 (`BUILT_IN_PRESETS` defined), cc-04 (`handleApplyPreset` exists on `<ConsultationCockpit>`).

**Source:** [plan-cockpit-customization-batch.md § CC-D5](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/hooks/useCockpitHotkeys.ts` (the existing hook — extend it).
- `frontend/components/consultation/ConsultationCockpit.tsx` (where the hook is invoked).
- `frontend/lib/consultation/cockpit-layout.ts` (the `BUILT_IN_PRESETS` from cc-06).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Extend `useCockpitHotkeys`

- [ ] Add three new optional callbacks to `UseCockpitHotkeysOpts`:

  ```ts
  /**
   * cc-11: Fires when Cmd/Ctrl+Shift+1 is pressed — applies the
   * built-in "Triage" preset. Custom presets do NOT get hotkeys (CC-D5
   * decision: avoids the "doctor changes preset and forgets the key
   * binding" failure mode).
   */
  onApplyBuiltInTriage?: () => void;
  /** cc-11: Cmd/Ctrl+Shift+2 → built-in "Consult" preset. */
  onApplyBuiltInConsult?: () => void;
  /** cc-11: Cmd/Ctrl+Shift+3 → built-in "Document" preset. */
  onApplyBuiltInDocument?: () => void;
  ```

- [ ] Add the matcher inside the existing `handleKeyDown`:

  ```ts
  // cc-11: Cmd/Ctrl+Shift+1/2/3 → built-in preset apply.
  // Place AFTER the rail-toggle block and BEFORE the `Cmd+Enter` block
  // so the modifier-key handling is colocated.
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
    if (e.key === '1' && onApplyBuiltInTriage) {
      e.preventDefault();
      onApplyBuiltInTriage();
      return;
    }
    if (e.key === '2' && onApplyBuiltInConsult) {
      e.preventDefault();
      onApplyBuiltInConsult();
      return;
    }
    if (e.key === '3' && onApplyBuiltInDocument) {
      e.preventDefault();
      onApplyBuiltInDocument();
      return;
    }
  }
  ```

- [ ] Update the JSDoc at the top of `useCockpitHotkeys.ts` to document the new bindings.

- [ ] Add the three new options to the `useEffect` dependency array.

### Wire callbacks in `<ConsultationCockpit>`

- [ ] In `<ConsultationCockpit>`'s `useCockpitHotkeys({...})` call:

  ```ts
  useCockpitHotkeys({
    onSendRx: …,
    onOpenWrapUp: …,
    onToggleLeftRail: …,   // renamed in cc-04
    onToggleRightRail: …,  // renamed in cc-04
    onApplyBuiltInTriage: () => handleApplyPreset(BUILT_IN_PRESETS.triage.layout),
    onApplyBuiltInConsult: () => handleApplyPreset(BUILT_IN_PRESETS.consult.layout),
    onApplyBuiltInDocument: () => handleApplyPreset(BUILT_IN_PRESETS.document.layout),
    enabled: …,
  });
  ```

### Browser hotkey conflict check

- [ ] `Cmd+Shift+1/2/3` and `Ctrl+Shift+1/2/3` are NOT reserved by any major browser (Chrome / Firefox / Safari / Edge) — confirm by pressing each in a non-cockpit page and verifying nothing happens. They're safe.
- [ ] On macOS, `Cmd+Shift+1/2/3` doesn't trigger system shortcuts either (those are `Cmd+Shift+3/4/5` for screenshots — confirm 3 in particular doesn't conflict with screenshot capture). On macOS, `Cmd+Shift+3` IS the full-screen screenshot shortcut. **This conflict is unavoidable** — flag it in the PR description and suggest the doctor uses the dropdown menu on macOS for the "Document" preset, OR remap `Cmd+Shift+3` in System Settings → Keyboard → Shortcuts → Screenshots if they want the cockpit binding to win.

  - **Alternative:** rebind to `Cmd/Ctrl+Shift+0` for "Document" (zero is unused; consistent with "0 = clear" mental model — ish). Decision: keep `1/2/3` for the menu-display consistency; document the macOS screenshot conflict in the cc-11 PR.

  - _If the macOS conflict turns out to be a bigger UX issue than expected, escalate via a follow-up: change cc-06's hint label and the cc-11 binding from `⌘⇧3` to `⌘⇧0`._

### Tests

- [ ] In `frontend/hooks/__tests__/useCockpitHotkeys.test.ts` (extend if exists, create if not):
  - "Cmd+Shift+1 fires onApplyBuiltInTriage and preventDefaults the event."
  - "Cmd+Shift+2 fires onApplyBuiltInConsult."
  - "Cmd+Shift+3 fires onApplyBuiltInDocument."
  - "skips when an input has focus" (regression — confirm the existing editable guard applies to the new bindings too).
  - "skips when `enabled === false`."
- [ ] `pnpm --filter frontend tsc --noEmit` clean.

### Manual verification

- [ ] Open the cockpit. Press `Cmd+Shift+1` (mac) or `Ctrl+Shift+1` (windows). Layout snaps to Triage.
- [ ] Press `Cmd+Shift+2` → Consult.
- [ ] Press `Cmd+Shift+3` → Document. (On macOS, expect the screenshot to fire too unless remapped.)
- [ ] Focus the Rx textarea (or any input). Press `Cmd+Shift+1` — input takes focus, no layout change. The editable-focus guard works.

---

## Out of scope

- **Custom preset hotkeys** — explicitly NOT shipping per CC-D5.
- **User-configurable hotkey bindings** — out of scope; hotkeys are static.
- **Resolving the macOS `Cmd+Shift+3` screenshot conflict** — flagged in the PR description; user-side remap or future migration to `Cmd+Shift+0`.

---

## Files expected to touch

**Modified:**
- `frontend/hooks/useCockpitHotkeys.ts` (~30 LOC delta — three new opts + matcher block + JSDoc).
- `frontend/components/consultation/ConsultationCockpit.tsx` (~10 LOC delta — three new callbacks in the hook invocation).
- `frontend/hooks/__tests__/useCockpitHotkeys.test.ts` (~50 LOC delta — five new it-blocks).

**New:** none.

---

## Notes / open decisions

1. **Why `Cmd/Ctrl+Shift+N` and not `Alt+N`?** Discoverability: `Cmd+Shift` is the convention for "switch view" hotkeys (mirrors the browser's "switch tab" Cmd+Shift+arrows pattern). `Alt+N` is reserved for OS-level menu access on Windows.
2. **Why no `Cmd/Ctrl+Shift+4/5/6/7` for custom presets?** CC-D5 lock. Custom presets vary per-doctor; binding hotkeys to user-named items leads to the "I don't remember which key does what" problem after a few weeks.
3. **What if the doctor mashes the hotkey while a save dialog is open?** The dialog gets keyboard focus when open (shadcn `<Dialog>` traps focus). The window-level hotkey listener still fires, but the layout-change call is harmless mid-dialog (the dialog's `currentLayout` snapshot is captured on open). Edge case; not a real bug.
4. **Why no visual flash / toast on hotkey apply?** Layout snaps instantly — the change IS the feedback. A toast would be noise. If doctors find the snap jarring, animation can land in a future polish task.

---

## References

- **Affected files:**
  - `frontend/hooks/useCockpitHotkeys.ts`
  - `frontend/components/consultation/ConsultationCockpit.tsx`
- **Predecessor:** [`task-cc-06-layout-dropdown-menu.md`](./task-cc-06-layout-dropdown-menu.md) (the `BUILT_IN_PRESETS` definitions and the `<kbd>` hints in the menu).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
