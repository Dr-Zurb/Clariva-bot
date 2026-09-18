# Cockpit tab snap rail — Phase 8 batch plan (20 Jul 2026)

> **One-line intent:** Wide / Even / Narrow = **global snap rail** — the focused leaf is lifted to a root-level column at f% of the **screen width**; every other visible pane is re-parented into a single vertical **companion rail** at 100-f%. The focused fraction is now real even in crowded (5+ column) layouts.
>
> **Status:** ✅ Complete 2026-07-20.

---

## Why (supersedes CTF-D22)

CTF-D22 reweighted only the focused leaf's **parent split**, so "⅔" meant ⅔ *of that local group*, not ⅔ of the screen. In a crowded flat layout (e.g. 5 columns) the other columns' physical min-widths (~220px each) consumed almost the whole viewport, so the focused pane could only expand a little — the ratio was aspirational, not actual. Doctors read this as "⅔ is broken."

Snap rail fixes the geometry problem: the *only* min-width cost of "everything else" is **one** rail column, so the focused pane can actually claim its f% of the screen.

---

## Decision lock

- **CTF-D23 — Global snap rail.** (Supersedes CTF-D22, and the ratio geometry of CTF-D9 / D12 / D14.)
  - `full` → unchanged path-hide Focus.
  - `wide` / `even` / `narrow` → rebuild a fresh root:
    - child 0 = focused host leaf at `focusPct` (67 / 50 / 33) of the screen;
    - child 1 = companion **rail** (`__focus_rail__`, `direction: "vertical"`) at `100-focusPct`, holding every **other visible leaf** as equal-height rows in original DFS order.
  - **One** visible companion → clean two-column split (no rail wrapper).
  - **Zero** visible companions (sole visible leaf) → Full fallback.
  - **Hidden** panes are preserved as hidden root siblings so a drag-commit (`discardFocusSession`) never drops them.
  - Session unchanged: recompute from the original prior (CTF-D10); Restore replays the exact prior tree.

### Accepted trade-offs

- Re-parenting remounts the non-focused panes → transient DOM/UI state is lost for the session. Rx form state lives outside the tree (context), so clinical data survives.
- Dragging the focus↔rail gutter exits the session (CTF-D6) and persists the rail as-is — consistent with existing drag semantics.

---

## Shipped

- `focus-leaf.ts` — `snapRailInTree` replaces `shareRatioInTree`; `FOCUS_RAIL_ID` export; `primary/peek/narrow/splitLeafByRatio` route through the rail. Removed unused `findParent` / `updateNodeById` / `reweightVisibleSiblings`.
- `__tests__/focus-leaf.test.ts` — rewritten for rail structure: root-column + `__focus_rail__` rows, crowded-5-column case, single-companion split, hidden-pane preservation, idempotency.
- No session / chrome / layout API changes (`usePaneFocusSession`, `useCockpitV3Layout`, `PaneFocusButton`, `PaneShowHereButton` untouched — they consume the same transform surface).

---

**Created:** 2026-07-20. **Closed:** 2026-07-20.
