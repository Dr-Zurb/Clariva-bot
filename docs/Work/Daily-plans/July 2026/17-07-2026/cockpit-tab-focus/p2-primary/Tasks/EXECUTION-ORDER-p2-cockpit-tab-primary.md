# Phase 2 — Cockpit tab Primary — execution order

> Sibling of [`../plan-p2-cockpit-tab-primary-batch.md`](../plan-p2-cockpit-tab-primary-batch.md).
>
> **Gate:** p1 ✅ complete · **explicit product go-ahead** after Focus dogfood (or explicit “ship Primary now”).
>
> **Program decisions:** [`../../README.md`](../../README.md) + CTF-D9 / D9b / D10 / D11 in the p2 plan.

---

## Wave plan (3 waves)

```
Wave 1 (~2–3h):
  ctf-05 (primaryLeafInTree + resolvePrimaryNeighbour; unit tests;
         sole-leaf fallback)
        │
        ▼
Wave 2 (~2–4h):
  ctf-06 (session.mode 'focus' | 'primary'; enterPrimary; PaneFocusButton menu;
         CockpitLeafView wiring; p1 Esc/drag/preset still green)
        │
        ▼
Wave 3 (~1–2h):
  ctf-07 (smoke + verification close gate; update program README)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **ctf-05** | S–M | Sonnet | `focus-leaf.ts`, consult default tree, CTF-D9b | Pure functions only. Lock neighbour rule is already in the batch plan — implement exactly. |
| W2.0 | **ctf-06** | M | Sonnet | ctf-05; `usePaneFocusSession`; `PaneFocusButton`; `CockpitLeafView` | Menu chrome; mode on session; CTF-D10 switches. |
| W3.0 | **ctf-07** | S | Sonnet / Composer | ctf-05…06; batch gate | Dogfood matrix + docs. |

**Caps:** 0 Opus. No migration.

---

## Acceptance gate

See the [batch plan gate](../plan-p2-cockpit-tab-primary-batch.md#cross-cutting-acceptance-gate).

---

## Task files

- [`task-ctf-05-primary-tree-mutation.md`](./task-ctf-05-primary-tree-mutation.md)
- [`task-ctf-06-primary-session-and-chrome.md`](./task-ctf-06-primary-session-and-chrome.md)
- [`task-ctf-07-primary-close-gate.md`](./task-ctf-07-primary-close-gate.md)

---

**Created:** 2026-07-17. **Updated:** 2026-07-17 (3-wave shape). **Status:** ✅ Complete 2026-07-17 (`ctf-05`…`07`).
