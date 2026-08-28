# Cockpit tab share focus — Phase 7 batch plan (19 Jul 2026)

> **One-line intent:** Wide / Even / Narrow = **local share** — focused leaf takes f% of its parent group; other visible siblings share the remainder proportionally. **No default neighbour. No hiding** (except Full).
>
> **Status:** ✅ Complete 2026-07-19.

---

## Decision lock

- **CTF-D22 — Share-based local ratios.**
  - Full → unchanged path-hide Focus.
  - ⅔ / ½ / ⅓ → reweight only the focused leaf’s parent split; other columns untouched.
  - Remainder distributed **proportionally** to prior sibling `sizePct` (equal fallback if sum is 0).
  - Sole visible sibling → Full fallback.
  - Drop `resolvePrimaryNeighbour`, `listCompanionCandidates`, `neighbourId`, `setCompanion`.
  - Show here always durable (no session companion branch).

---

## Shipped

- `focus-leaf.ts` — `shareRatioInTree` / simplified `splitLeafByRatio`
- `usePaneFocusSession.ts` — `enterSplit(leafId, ratio)` only
- `useCockpitV3Layout.ts` / `CockpitLeafView` / `PaneFocusButton` — companion chrome removed
- Tests rewritten for share semantics

---

**Created:** 2026-07-19. **Closed:** 2026-07-19.
