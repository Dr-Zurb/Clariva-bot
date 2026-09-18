# Phase 5 — Cockpit tab Snap layouts — execution order

> Sibling of [`../plan-p5-cockpit-tab-snap-layouts-batch.md`](../plan-p5-cockpit-tab-snap-layouts-batch.md).
>
> **Gate:** p1–p3 ✅ · product locked visual picker + auto companion + inline Beside swap (CTF-D14…D17).
>
> **Program decisions:** [`../../README.md`](../../README.md) + locks in the p5 plan.

---

## Wave plan (4 waves)

```
Wave 1 (~1–2h):
  ctf-15 (narrowLeafInTree + listCompanionCandidates; unit tests)
        │
        ▼
Wave 2 (~2–3h):
  ctf-16 (session ratio + neighbourId; enterSplit / setCompanion;
         surface via useCockpitV3Layout; CTF-D10 tests)
        │
        ▼
Wave 3 (~2–4h):
  ctf-17 (LayoutRatioIcon + PaneFocusButton visual picker + Beside list;
         CockpitLeafView wiring; drop Primary/Peek UI labels)
        │
        ▼
Wave 4 (~1h):
  ctf-18 (smoke + verification close gate; update program README)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **ctf-15** | S | Sonnet / Auto | `focus-leaf.ts`, CTF-D14 | Pure functions only. Reuse `splitLeafInTree`. |
| W2.0 | **ctf-16** | M | Sonnet | ctf-15; `usePaneFocusSession` | Rename modes → ratios; keep Esc/discard. |
| W3.0 | **ctf-17** | M | Sonnet | ctf-15…16; `PaneFocusButton` | Visual diagrams; Beside list when ≥2 candidates. |
| W4.0 | **ctf-18** | S | Sonnet / Composer | ctf-15…17; batch gate | Docs + capture; do not start p4 unasked. |

**Caps:** 0 Opus. No migration. Stay inside the focus slice.

---

## Acceptance gate

See the [batch plan gate](../plan-p5-cockpit-tab-snap-layouts-batch.md#cross-cutting-acceptance-gate).

---

## Task files

- [`task-ctf-15-narrow-and-companions.md`](./task-ctf-15-narrow-and-companions.md)
- [`task-ctf-16-split-session-api.md`](./task-ctf-16-split-session-api.md)
- [`task-ctf-17-visual-picker-chrome.md`](./task-ctf-17-visual-picker-chrome.md)
- [`task-ctf-18-snap-layouts-close-gate.md`](./task-ctf-18-snap-layouts-close-gate.md)

---

**Created:** 2026-07-18. **Status:** ✅ Complete 2026-07-18 (`ctf-15`…`18`).
