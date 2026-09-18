# Task ctf-08: Peek tree mutation

> **Depends on:** p2 `ctf-05` neighbour resolver · product go-ahead for Peek  
> **Links:** [`../plan-p3-cockpit-tab-peek-batch.md`](../plan-p3-cockpit-tab-peek-batch.md) · exec [`./EXECUTION-ORDER-p3-cockpit-tab-peek.md`](./EXECUTION-ORDER-p3-cockpit-tab-peek.md)

---

## Goal

Export `peekLeafInTree(tree, leafId, neighbourId?)` — same structure as Primary but **50 / 50** at the separating split (CTF-D12). Reuse `resolvePrimaryNeighbour` (do not fork the rule).

**Size:** S · **Model:** Sonnet / Auto · **Status:** ✅ Complete (2026-07-17).

---

## Breakdown

- [x] 1.1 Implement `peekLeafInTree` (prefer sharing internal helper with Primary that takes `focusPct`).
- [x] 1.2 Tests: 50/50 sizes; neighbour visible; sole-leaf fallback.
- [x] 1.3 `tsc` + tests green.

**Files:** `focus-leaf.ts` + tests. **DO NOT** touch chrome (ctf-09).

**Shipped:** `splitLeafInTree` / `splitWalk` shared by Primary + Peek; `PEEK_FOCUS_PCT` / `PEEK_NEIGHBOUR_PCT` = 50.

---

**Created:** 2026-07-17. **Closed:** 2026-07-17.
