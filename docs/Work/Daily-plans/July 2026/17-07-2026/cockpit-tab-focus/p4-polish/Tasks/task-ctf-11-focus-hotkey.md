# Task ctf-11: Optional Focus hotkey

> **Optional.** Skip unless dogfood asks.  
> **Links:** [`../plan-p4-cockpit-tab-focus-polish-batch.md`](../plan-p4-cockpit-tab-focus-polish-batch.md)

---

## Goal

Add a keyboard shortcut to Focus / Restore the active (or hovered) leaf without colliding with layout presets (`mod+shift+1..4`) or Rx shortcuts.

**Size:** S · **Model:** Sonnet · **Status:** Not started (optional).

---

## Breakdown

- [ ] 0.1 Lock combo + scope (document here): e.g. `F` when focus is inside a cockpit leaf and not in a text field — **or** `mod+shift+f`. Write the pick before coding.
- [ ] 1.1 Register listener (mirror `useCockpitLayoutHotkeys` mid-text guard).
- [ ] 1.2 Toggle Focus for the leaf that contains `document.activeElement` (or last-interacted leaf — lock in 0.1).
- [ ] 1.3 Tests for combo + mid-text skip.
- [ ] 1.4 Help / keyboard cheat-sheet update only if one already lists layout shortcuts.

**DO NOT** invent Primary/Peek hotkeys unless product asks in the same pick.

---

**Created:** 2026-07-17.
