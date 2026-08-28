# Phase 4 — Cockpit tab Focus polish — execution order

> Sibling of [`../plan-p4-cockpit-tab-focus-polish-batch.md`](../plan-p4-cockpit-tab-focus-polish-batch.md).
>
> **Gate:** Product picks which of `ctf-11` / `12` / `13` to run. Skip the rest. Always finish with `ctf-14` if any piece shipped.

---

## Wave plan (à la carte)

```
[optional] ctf-11  F hotkey          ──┐
[optional] ctf-12  stub siblings     ──┼──► ctf-14 close gate
[optional] ctf-13  mobile Focus      ──┘
```

`ctf-11` / `12` / `13` are **independent** (no cross-deps) — parallelisable if multiple picked. `ctf-14` waits on the chosen set.

| Task | Size | Model | Notes |
|---|---|---|---|
| ctf-11 | S | Sonnet | Lock collision matrix first |
| ctf-12 | M | Sonnet | Session-only stubs; Restore exact |
| ctf-13 | M–L | Sonnet / Opus if 5+ | Mobile fallback path |
| ctf-14 | S | Composer | Gate + README |

---

## Task files

- [`task-ctf-11-focus-hotkey.md`](./task-ctf-11-focus-hotkey.md)
- [`task-ctf-12-stub-siblings.md`](./task-ctf-12-stub-siblings.md)
- [`task-ctf-13-mobile-focus.md`](./task-ctf-13-mobile-focus.md)
- [`task-ctf-14-polish-close-gate.md`](./task-ctf-14-polish-close-gate.md)

---

**Created:** 2026-07-17. **Status:** À la carte — gated on product picks.
