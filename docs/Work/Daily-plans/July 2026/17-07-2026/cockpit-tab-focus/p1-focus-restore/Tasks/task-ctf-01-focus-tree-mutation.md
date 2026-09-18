# Task ctf-01: Pure Focus tree mutation + restore helpers

> **Filename:** `task-ctf-01-focus-tree-mutation.md`  
> **Links:** batch [`../plan-p1-cockpit-tab-focus-batch.md`](../plan-p1-cockpit-tab-focus-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p1-cockpit-tab-focus.md`](./EXECUTION-ORDER-p1-cockpit-tab-focus.md)

---

## 📋 Task Overview

Land the **pure** `PaneTreeNode` transform that Focus needs — no React, no chrome.

1. Clone a tree (reuse `serialiseTree` / `deserialiseTree` or equivalent).
2. `focusLeafInTree(tree, leafId)` → new tree where the target leaf owns the canvas along its ancestor path (siblings hidden + sizes rebalanced so the focused branch is ~100% at each level).
3. Unit-test Restore as identity: `apply(prior)` equals the clone taken before focus.

**Program / Batch:** cockpit-tab-focus · p1-focus-restore · Wave 1  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ Complete (2026-07-17). **Model: Sonnet / Auto**  
**Change Type:** ✅ Add pure helpers + tests (follow `CODE_CHANGE_RULES.md`).

**Current State:**
- ✅ `PaneTreeNode` + `serialiseTree` / `deserialiseTree` in layout-tree modules.
- ✅ Sibling rebalance patterns in `v3/prune-layout-leaves.ts` (`rebalanceSiblings` — mirror, don't fork carelessly).
- ❌ No Focus mutation.

**Scope Guard:**
- Expected: one new helper module (suggested: `frontend/lib/patient-profile/v3/focus-leaf.ts`) + `__tests__/focus-leaf.test.ts`.
- **DO NOT** touch React components, `PaneHeader`, presets, ribbon, or backend.
- **DO NOT** implement Primary / fraction targets (p2).

---

## ✅ Task Breakdown

### 1. API shape
- [x] ✅ 1.1 Export `clonePaneTree(tree)` (or re-export existing clone). - **Completed: 2026-07-17**
- [x] ✅ 1.2 Export `focusLeafInTree(tree, leafId): { ok: true; tree } | { ok: false; reason }` with reasons like `not-found` / `already-focused-enough` (only if useful — keep lean). - **Completed: 2026-07-17**
- [x] ✅ 1.3 Document: target may be a structural node id **or** a pane id inside a tabs leaf (`paneIds`); resolve to the hosting leaf node (CTF-D7). - **Completed: 2026-07-17**

### 2. Transform rules
- [x] ✅ 2.1 Walk from root to the host leaf; at each split, set the ancestor child's `sizePct` so the focused branch takes the visible share (~100% among non-hidden siblings). - **Completed: 2026-07-17**
- [x] ✅ 2.2 Mark non-focused siblings `hidden: true` (p1 recommendation from batch open question #1 — lock it here). - **Completed: 2026-07-17**
- [x] ✅ 2.3 Preserve `paneIds` / `activeTabId` on tabs leaves; do not flatten tabs. - **Completed: 2026-07-17**
- [x] ✅ 2.4 Idempotent-ish: focusing an already-focused tree should be a no-op or stable (pick one; test it). - **Completed: 2026-07-17** (stable serialisation)

### 3. Tests
- [x] ✅ 3.1 Consult-like multi-column tree → focus `plan` → only plan's branch visible; sizes sum correctly. - **Completed: 2026-07-17**
- [x] ✅ 3.2 Focus a pane inside a tabs leaf → group focused; `activeTabId` unchanged unless needed for visibility. - **Completed: 2026-07-17**
- [x] ✅ 3.3 `not-found` for unknown id. - **Completed: 2026-07-17**
- [x] ✅ 3.4 Clone → focus → "restore" by returning clone === original serialisation. - **Completed: 2026-07-17**

### 4. Verification
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit` — no new errors. - **Completed: 2026-07-17** (no errors in focus-leaf; pre-existing failures elsewhere)
- [x] ✅ 4.2 `cd frontend && npm test -- focus-leaf` (or path) green. - **Completed: 2026-07-17** (9 passed)

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/patient-profile/v3/focus-leaf.ts
CREATE: frontend/lib/patient-profile/v3/__tests__/focus-leaf.test.ts
READ:   frontend/lib/patient-profile/layout-tree.ts
READ:   frontend/lib/patient-profile/v3/prune-layout-leaves.ts  (rebalance patterns)
READ:   frontend/lib/patient-profile/v3/default-layouts.ts      (fixture trees)
DO NOT TOUCH: React chrome, presets UI, ribbon, backend
```

---

## 🧠 Design Constraints

- Pure functions only — no `localStorage`, no hooks.
- Prefer mirroring existing rebalance math over inventing a second size system.
- Hidden leaves keep identity in the tree (easier Restore) rather than `hideLeaf`-style structural delete.

---

## ✅ Acceptance Criteria

- [x] `focusLeafInTree` + clone helpers exported and covered by unit tests.
- [x] Focused tree gives the target leaf (near) full canvas among visible nodes.
- [x] Tabs metadata preserved.
- [x] No UI changes in this task.

---

**Created:** 2026-07-17.
