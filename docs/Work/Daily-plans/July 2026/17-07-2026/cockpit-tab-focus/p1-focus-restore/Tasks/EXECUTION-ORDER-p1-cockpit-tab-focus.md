# Phase 1 — Cockpit tab Focus + Restore — execution order

> Sibling of [`../plan-p1-cockpit-tab-focus-batch.md`](../plan-p1-cockpit-tab-focus-batch.md). Plan = what + why; this = who-runs-what-when + model.
>
> **Program decisions:** [`../../README.md`](../../README.md) (`CTF-D1`…`D8`).
>
> **Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **Shape.** Linear four-wave batch. `ctf-01` lands the pure tree primitive. `ctf-02` owns the session + shell wiring. `ctf-03` is thin chrome. `ctf-04` closes the gate. No parallel lanes — each wave depends on the previous artifact.

---

## Wave plan (4 waves)

```
Wave 1 (~2–3h):
  ctf-01 (focusLeafInTree + clone/restore helpers; unit tests on PaneTreeNode)
        │
        ▼
Wave 2 (~2–4h):
  ctf-02 (usePaneFocusSession / equivalent; applyLayout; Esc; drag + preset exit;
         persist policy per CTF-D3)
        │
        ▼
Wave 3 (~2–3h):
  ctf-03 (Focus control in PaneHeader actions and/or PaneTabStripV3; a11y)
        │
        ▼
Wave 4 (~1–2h):
  ctf-04 (smoke matrix + tsc/lint/test close gate; capture follow-ups)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **ctf-01** | S–M | Sonnet / Auto | `layout-tree.ts` (`PaneTreeNode`); `prune-layout-leaves.ts` rebalance helpers; `layout-tree-mutations.ts` patterns; consult default tree in `default-layouts.ts` | Pure functions only. Focus = ancestor-path expand + sibling hide/rebalance. Restore = apply cloned prior (identity). |
| W2.0 | **ctf-02** | M | Sonnet | ctf-01 helpers; `useShellLayout.applyLayout`; `useCockpitV3Layout`; resize handlers in `CockpitGroupView` | Session state + Esc. Resolve open questions (sibling treatment already locked in ctf-01; preset/refresh picks documented in task). |
| W3.0 | **ctf-03** | S–M | Sonnet / Auto | ctf-02 hook; `PaneHeader.tsx`; `PaneTabStripV3.tsx`; leaf/group mount sites | One control, toggle semantics. Keep ≤4 files if possible. |
| W4.0 | **ctf-04** | S | Sonnet / Composer | ctf-01…03 output; batch acceptance gate | Manual light/dark + verification commands. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| ctf-01 | S–M | Sonnet / Auto | Pure tree math + tests; existing rebalance patterns to mirror |
| ctf-02 | M | Sonnet | Lifecycle + persist edge cases; shell integration |
| ctf-03 | S–M | Sonnet / Auto | Thin chrome over hook |
| ctf-04 | S | Sonnet / Composer | QA + gate |

**Caps check:** ≤1 Opus per wave ✓ (0 Opus). No migration / PHI / RLS.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p1-cockpit-tab-focus-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## Task files

- [`task-ctf-01-focus-tree-mutation.md`](./task-ctf-01-focus-tree-mutation.md)
- [`task-ctf-02-focus-session-hook.md`](./task-ctf-02-focus-session-hook.md)
- [`task-ctf-03-chrome-and-hotkeys.md`](./task-ctf-03-chrome-and-hotkeys.md)
- [`task-ctf-04-close-gate.md`](./task-ctf-04-close-gate.md)

---

**Created:** 2026-07-17. **Status:** ✅ Complete (2026-07-17) — all four waves shipped.
