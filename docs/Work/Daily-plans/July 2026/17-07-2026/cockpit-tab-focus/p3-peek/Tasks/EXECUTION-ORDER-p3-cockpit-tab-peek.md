# Phase 3 — Cockpit tab Peek — execution order

> Sibling of [`../plan-p3-cockpit-tab-peek-batch.md`](../plan-p3-cockpit-tab-peek-batch.md).
>
> **Gate:** p2 Primary shipped (or explicit product skip-to-Peek) · go-ahead for Peek.

---

## Wave plan

```
Wave 1: ctf-08 (peekLeafInTree — reuse resolvePrimaryNeighbour; 50/50)
    │
    ▼
Wave 2: ctf-09 (session mode 'peek' + menu item on PaneFocusButton)
    │
    ▼
Wave 3: ctf-10 (close gate)
```

| Step | Task | Size | Model |
|---|---|---|---|
| W1.0 | ctf-08 | S | Sonnet / Auto |
| W2.0 | ctf-09 | S–M | Sonnet |
| W3.0 | ctf-10 | S | Sonnet / Composer |

---

## Task files

- [`task-ctf-08-peek-tree-mutation.md`](./task-ctf-08-peek-tree-mutation.md)
- [`task-ctf-09-peek-session-and-chrome.md`](./task-ctf-09-peek-session-and-chrome.md)
- [`task-ctf-10-peek-close-gate.md`](./task-ctf-10-peek-close-gate.md)

---

**Created:** 2026-07-17. **Status:** ✅ Complete 2026-07-17 (`ctf-08`…`10`).
