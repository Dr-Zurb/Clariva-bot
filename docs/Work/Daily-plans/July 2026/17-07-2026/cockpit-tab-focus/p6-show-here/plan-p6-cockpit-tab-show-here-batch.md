# Cockpit tab Show here — Phase 6 batch plan (19 Jul 2026)

> **One-line intent:** Always-on **Show here** on every leaf — pick any other pane for this slot. Focus chrome stays **size only** (Full / ⅔ / ½ / ⅓). Remove session-exclusive Beside.
>
> **Status:** ✅ Complete 2026-07-19.

---

## Decision lock

- **CTF-D18 — Show here is always-on.**
- **CTF-D19 — Idle = durable swap** (`swapPaneTreeNodes` / `setActiveTab`).
- **CTF-D20 — Session companion = setCompanion.**
- **CTF-D21 — Focus menu is size-only.**

---

## Shipped

- `listShowHereCandidates` / `findHostLeafInTree` / `isCompanionTargetForLeaf` in `focus-leaf.ts`
- `showPaneHere` + `focusPrior` on layout/session
- `PaneShowHereButton` on every leaf beside `PaneFocusButton`
- Tests green (focus-leaf + Show here chrome)

---

**Created:** 2026-07-19. **Closed:** 2026-07-19.
