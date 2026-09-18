# Task ctf-09: Peek session + menu item

> **Depends on:** `ctf-08`  
> **Links:** [`../plan-p3-cockpit-tab-peek-batch.md`](../plan-p3-cockpit-tab-peek-batch.md) · exec [`./EXECUTION-ORDER-p3-cockpit-tab-peek.md`](./EXECUTION-ORDER-p3-cockpit-tab-peek.md)

---

## Goal

Add `mode: 'peek'` + `enterPeek(leafId)` to the session; add **Peek** to the idle chrome menu; mode switches recompute from original prior (CTF-D10).

**Size:** S–M · **Model:** Sonnet · **Status:** ✅ Complete (2026-07-17).

---

## Breakdown

- [x] 1.1 Session API + layout expose `enterPeek` / mode.
- [x] 1.2 Menu item "Peek {title}".
- [x] 1.3 Tests: Peek → Restore; Focus ↔ Peek from prior.
- [x] 1.4 p1/p2 Esc / drag / preset regressions green.

**Files:** `usePaneFocusSession.ts`, `useCockpitV3Layout.ts`, `PaneFocusButton.tsx`, `CockpitLeafView.tsx`, tests.

---

**Created:** 2026-07-17. **Closed:** 2026-07-17.
