# Task ctf-15: Narrow ratio + companion candidates (pure)

> **Filename:** `task-ctf-15-narrow-and-companions.md`  
> **Links:** batch [`../plan-p5-cockpit-tab-snap-layouts-batch.md`](../plan-p5-cockpit-tab-snap-layouts-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p5-cockpit-tab-snap-layouts.md`](./EXECUTION-ORDER-p5-cockpit-tab-snap-layouts.md)  
> **Depends on:** p1–p3 (`splitLeafInTree`, `resolvePrimaryNeighbour`) ✅ · product go-ahead for p5

---

## 📋 Task Overview

Pure functions only (no React / chrome):

1. Export Narrow (⅓) via shared split helper — **33 / 67** (CTF-D14).
2. Export `listCompanionCandidates(priorTree, leafId): string[]` — other visible host/pane ids the Beside picker can offer (excludes the focused host; CTF-D9b order preferred-first is fine).
3. Optional thin helpers: ratio → pct map (`full` n/a, `wide` 67/33, `even` 50/50, `narrow` 33/67).

**Program / Batch:** cockpit-tab-focus · p5-snap-layouts · Wave 1  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ Complete (2026-07-18). **Model: Sonnet / Auto**  
**Change Type:** ✅ Extend `focus-leaf.ts` (+ tests).

**Shipped:** `narrowLeafInTree`, `splitLeafByRatio`, `listCompanionCandidates`, `PaneSplitRatio`, `SPLIT_RATIO_PCTS`, `NARROW_*_PCT`.

---

## ✅ Task Breakdown

### 1. Narrow transform
- [x] 1.1 `NARROW_FOCUS_PCT = 33`, `NARROW_NEIGHBOUR_PCT = 67`.
- [x] 1.2 `narrowLeafInTree(tree, leafId, neighbourId?)` — wrapper on `splitLeafInTree`.
- [x] 1.3 Ratio→pct map + `splitLeafByRatio`.

### 2. Companion candidates
- [x] 2.1 `listCompanionCandidates(tree, leafId): string[]`.
- [x] 2.2 CTF-D9b default neighbour first when present.
- [x] 2.3 Empty array when sole visible leaf.

### 3. Tests
- [x] 3.1–3.5 covered in `focus-leaf.test.ts` (30 tests green).

### 4. Verification
- [x] 4.1 Focus-slice tests + eslint green.

---

**Created:** 2026-07-18. **Closed:** 2026-07-18.
