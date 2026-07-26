# Cockpit tab Primary (~⅔) — Phase 2 batch plan (17 Jul 2026)

> **Hand-off doc.** Extends p1 Focus with a second named intent: **Primary**.
>
> **Gate to start:** p1 complete ✅ · **product go-ahead after dogfood** (Focus alone feels too aggressive, or you explicitly want Primary now).
>
> **One-line intent:** Menu on the Focus control offers **Focus** · **Primary** (~⅔ + one neighbour) · **Restore** — still no fraction picker.
>
> **Program index:** [`../README.md`](../README.md) (`CTF-D1`…`D13`).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-cockpit-tab-primary.md`](./Tasks/EXECUTION-ORDER-p2-cockpit-tab-primary.md).

---

## Why this phase

Full Focus hides every neighbour. Mid-consult, doctors often want Plan (or Objective) **wide** while Assessment (or Subjective) stays glanceable. That is **Primary (~⅔ / ~⅓)**, not a size slider.

If dogfood shows Focus + drag is enough, **cancel this phase** in the program README and skip p3/p4 size intents.

---

## Decision lock (additive — freeze before coding)

Inherits CTF-D1…D8. Phase-local locks:

- **CTF-D9 — Primary ≈ 67 / 33.** Among the focused host and its chosen neighbour’s ancestor branches, assign ~67% to the focused branch and ~33% to the neighbour branch at the **lowest common split** that separates them; hide every other off-path sibling (same hide semantics as Focus). Leaf-level sizes inside a column that only contains the focused leaf stay at 100% of that column.
- **CTF-D9b — Neighbour selection (LOCKED).** Resolve neighbour id in this order (first hit wins):
  1. **Clinical pair defaults** when the focus target’s pane id is one of: `plan`↔`assessment`, `subjective`↔`objective` (prefer the pair partner if it exists as a visible leaf in the **prior** tree).
  2. Else **adjacent sibling** under the same parent split in the prior tree (prefer the neighbour with larger prior `sizePct`; if tied, the one that appears first in `children`).
  3. Else **first other visible leaf** in prior-tree walk order (depth-first) that is not the focus host.
  4. If no neighbour exists (sole visible leaf) → Primary is a no-op / falls back to Focus behaviour (document in `ctf-05` tests).
- **CTF-D10 — Recompute from original prior.** Entering Primary, switching Primary→Focus or Focus→Primary, always runs the transform on `session.prior`, never on the live focused/primary tree.
- **CTF-D11 — Chrome menu.** Idle control is a small menu: **Focus** · **Primary**. While session active on this leaf: **Restore** (+ optional switch to the other intent). `aria-haspopup="menu"`. No Peek item in p2.

---

## Current state (grounded) — shipped

- `primaryLeafInTree` + `resolvePrimaryNeighbour` (CTF-D9 / D9b) in `focus-leaf.ts`.
- `usePaneFocusSession` tracks `{ prior, focusedLeafId, mode }` with `enterPrimary` (CTF-D10).
- `PaneFocusButton` is a DropdownMenu: idle Focus · Primary; active Restore (+ switch intents).

---

## ⚠️ Scope guard

- **DO NOT** start without product go-ahead (even though p1 code is done).
- **DO NOT** implement Peek (½) here — that is [`../p3-peek/`](../p3-peek/).
- **DO NOT** add free fraction chips or stub-sibling chrome (p4).
- Frontend-only; zero migration.

---

## Cross-cutting acceptance gate

- [x] Menu offers Focus + Primary when idle; Restore when this leaf is session-active.
- [x] Primary ≈ ⅔ / ⅓ with neighbour visible and usable; other leaves hidden.
- [x] Neighbour rule matches CTF-D9b (unit-tested pair + adjacent + fallback).
- [x] Restore / Esc returns exact pre-session tree.
- [x] Focus ↔ Primary switches recompute from original prior.
- [x] Drag-exit / preset-exit still discard session (p1 CTF-D6).
- [x] Sole-leaf Primary falls back safely (no crash).
- [x] `tsc` / lint / Focus+Primary tests green for the slice.

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `ctf-05` | `primaryLeafInTree` + neighbour resolver + unit tests | S–M | Sonnet |
| `ctf-06` | Session `mode` + menu chrome on `PaneFocusButton` | M | Sonnet |
| `ctf-07` | Close gate | S | Sonnet / Composer |

---

## Cost estimate

| Wave | Tasks | Wall-clock |
|---|---|---|
| Wave 1 — mutation | `ctf-05` | ~2–3h |
| Wave 2 — session + chrome | `ctf-06` | ~2–4h |
| Wave 3 — close | `ctf-07` | ~1–2h |
| **Total** | **3** | **~5–9h** after go-ahead |

**Caps:** 0 Opus. No migration.

---

## Open questions (resolve only if CTF-D9b fails dogfood)

1. Should Primary keep **two** neighbours in rare 3-column layouts? **No for p2** — one neighbour only.
2. Exact percents 67/33 vs 70/30? **67/33** unless visual QA wants 70/30 (document deviation in ctf-07).

---

## References

- p1 batch: [`../p1-focus-restore/plan-p1-cockpit-tab-focus-batch.md`](../p1-focus-restore/plan-p1-cockpit-tab-focus-batch.md)
- Code: `focus-leaf.ts`, `usePaneFocusSession.ts`, `PaneFocusButton.tsx`, `CockpitLeafView.tsx`

---

**Created:** 2026-07-17. **Updated:** 2026-07-17 (expanded to 3 tasks + locked neighbour rule). **Status:** ✅ Complete 2026-07-17 (`ctf-05`…`07`).
