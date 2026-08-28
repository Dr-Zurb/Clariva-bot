# Task ctf-05: Primary tree mutation + neighbour resolver

> **Filename:** `task-ctf-05-primary-tree-mutation.md`  
> **Links:** batch [`../plan-p2-cockpit-tab-primary-batch.md`](../plan-p2-cockpit-tab-primary-batch.md) · program [`../../README.md`](../../README.md) · exec [`./EXECUTION-ORDER-p2-cockpit-tab-primary.md`](./EXECUTION-ORDER-p2-cockpit-tab-primary.md)  
> **Depends on:** p1 (`ctf-01`…`04`) ✅ · product go-ahead

---

## 📋 Task Overview

Pure functions only (no React / chrome):

1. `resolvePrimaryNeighbour(priorTree, leafId): string | null` implementing **CTF-D9b**.
2. `primaryLeafInTree(tree, leafId, neighbourId?): FocusLeafResult`-shaped result — ~67% focused branch / ~33% neighbour at the separating split; hide other off-path siblings like Focus.
3. Unit tests for pair defaults, adjacent fallback, sole-leaf, and size sums.

**Program / Batch:** cockpit-tab-focus · p2-primary · Wave 1  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ Complete (2026-07-17). **Model: Sonnet**  
**Change Type:** ✅ Extend `focus-leaf.ts` (+ tests).

**Scope Guard:**
- Expected: `frontend/lib/patient-profile/v3/focus-leaf.ts` + `__tests__/focus-leaf.test.ts` (or `primary-leaf.test.ts`).
- **DO NOT** touch session hook or `PaneFocusButton` (ctf-06).
- **DO NOT** implement Peek sizes (50/50) — p3.

---

## Locked neighbour rule (CTF-D9b) — implement exactly

1. Clinical pairs if partner visible in **prior** tree: `plan`↔`assessment`, `subjective`↔`objective`.
2. Else adjacent sibling on same parent split (larger prior `sizePct`; tie → earlier child).
3. Else first other visible leaf in DFS walk order.
4. Else `null` → caller treats Primary as Focus fallback.

---

## ✅ Task Breakdown

### 1. Neighbour resolver
- [x] ✅ 1.1 Export `resolvePrimaryNeighbour(tree, leafId)`. - **Completed: 2026-07-17**
- [x] ✅ 1.2 Unit: Plan → Assessment on consult tree; Subjective → Objective. - **Completed: 2026-07-17**
- [x] ✅ 1.3 Unit: adjacent sibling when pair partner hidden/absent. - **Completed: 2026-07-17**
- [x] ✅ 1.4 Unit: returns null for sole visible leaf. - **Completed: 2026-07-17**

### 2. Primary transform
- [x] ✅ 2.1 Export `primaryLeafInTree(tree, leafId, neighbourId?)` — if `neighbourId` omitted, resolve via 1.1; if still null, delegate to `focusLeafInTree` (or equivalent 100% path) and document. - **Completed: 2026-07-17**
- [x] ✅ 2.2 At lowest common split separating host vs neighbour: sizes ≈ 67 / 33 (focused branch / neighbour branch); hide other siblings. - **Completed: 2026-07-17**
- [x] ✅ 2.3 Preserve tabs `paneIds` / `activeTabId` (same as Focus). - **Completed: 2026-07-17**
- [x] ✅ 2.4 Idempotent / stable when applied twice on same inputs. - **Completed: 2026-07-17**

### 3. Verification
- [x] ✅ 3.1 `tsc` + `npm test -- focus-leaf` (or primary-leaf path) green. - **Completed: 2026-07-17** (18 passed)

---

## 📁 Files

```
UPDATE: frontend/lib/patient-profile/v3/focus-leaf.ts
UPDATE: frontend/lib/patient-profile/v3/__tests__/focus-leaf.test.ts  (extend)
DO NOT TOUCH: usePaneFocusSession, PaneFocusButton, backend
```

---

## ✅ Acceptance Criteria

- [x] CTF-D9b covered by tests.
- [x] Primary sizes ≈ 67/33 with neighbour visible; others hidden.
- [x] No UI changes in this task.

---

**Created:** 2026-07-17. **Closed:** 2026-07-17.
