# Cockpit tab Snap layouts + companion — Phase 5 batch plan (18 Jul 2026)

> **Hand-off doc.** Evolves the p1–p3 named-intent menu into a **visual layout picker** (Windows Snap–style diagrams) + optional **companion swap**, and adds the missing **⅓** ratio.
>
> **Gate to start:** p1–p3 ✅ · product locked recommendations (visual picker + auto companion + inline swap).
>
> **One-line intent:** One leaf control → pick **Full / ⅔ / ½ / ⅓** via diagrams; neighbour auto-resolves (CTF-D9b) with an inline **Beside** swap while a split is active — still no free fraction picker.
>
> **Program index:** [`../README.md`](../README.md) (`CTF-D14`…`D17`).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p5-cockpit-tab-snap-layouts.md`](./Tasks/EXECUTION-ORDER-p5-cockpit-tab-snap-layouts.md).

---

## Why this phase

p1–p3 shipped Focus / Primary / Peek as a text menu. Dogfood asked for:

1. A **⅓** ratio (inverse of Primary).
2. Clearer naming (diagrams > "Primary/Peek" jargon).
3. A way to **choose the companion** when the auto-neighbour is wrong — without a blocking Windows Snap Assist prompt every time.

This phase keeps the temporary-session + exact-Restore model; it upgrades chrome + adds one ratio + companion swap.

---

## Decision lock (additive — freeze before coding)

Inherits CTF-D1…D13. Phase-local locks:

- **CTF-D14 — Narrow ≈ 33 / 67.** Focused branch ~33%, one neighbour ~67% at the LCA; same hide / neighbour semantics as Primary/Peek. Implemented via existing `splitLeafInTree` helper.
- **CTF-D15 — Visual layout picker.** Idle chrome is a diagram grid: **Full · ⅔ · ½ · ⅓** (not wordy intent names). Active: same grid + **Restore**. Still exactly 4 discrete stops — CTF-D1 holds (no free slider / chip picker). Manual drag remains the fine-tune.
- **CTF-D16 — Auto companion + inline swap.** Default neighbour from `resolvePrimaryNeighbour` (CTF-D9b). While a split session is active **and ≥2 candidates exist**, the menu shows a **Beside: {title}** list of other visible panes to re-pick in one click. Sole-leaf → Full fallback. No blocking prompt on enter.
- **CTF-D17 — Internal rename.** Session ratio enum: `'full' | 'wide' | 'even' | 'narrow'` (was focus / primary / peek). UI labels are diagrams + dynamic tooltips (`"{title} ⅔ · {companion} ⅓"`). Legacy `enterFocus` / `enterPrimary` / `enterPeek` collapse into `enterSplit(leafId, ratio, neighbourId?)`.

### Locked product picks (18 Jul)

1. **Full cell stays** in the picker (one control owns the whole expand story).
2. **Beside list** shows whenever a split is active and there are **2+ companion candidates** (always available as a swap, not only when the clinical pair is missing).

---

## Current state (grounded) — shipped

- `narrowLeafInTree` + `splitLeafByRatio` + `listCompanionCandidates` + `SPLIT_RATIO_PCTS`.
- Session tracks `{ prior, focusedLeafId, ratio, neighbourId }` with `enterSplit` / `setCompanion`.
- `PaneFocusButton` is a visual Full/⅔/½/⅓ picker + Beside + Restore.

---

## ⚠️ Scope guard

- **DO NOT** start p4 polish pieces here — p4 stays optional / independent.
- **DO NOT** add free fractions, ¼ chips, or a size slider.
- **DO NOT** force a companion picker on every enter (CTF-D16).
- Frontend-only; zero migration. Stay inside the focus slice (~6 files + tests).
- If blast radius grows past the focus slice or becomes a 5+ file structural refactor outside it, **STOP**.

---

## Cross-cutting acceptance gate

- [x] Visual picker offers Full · ⅔ · ½ · ⅓; Restore when session-active.
- [x] Narrow ≈ ⅓ / ⅔ with neighbour visible; others hidden.
- [x] Auto-neighbour still matches CTF-D9b by default.
- [x] Beside swap re-picks companion; recomputes from original prior (CTF-D10).
- [x] Ratio switches keep companion; Full clears neighbour.
- [x] Esc / drag-exit / preset-exit still correct (p1 CTF-D6).
- [x] No "Primary" / "Peek" jargon in UI chrome.
- [x] `tsc` / lint / Focus-slice tests green.

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `ctf-15` | Narrow ratio + `listCompanionCandidates` (pure) | S | Sonnet / Auto |
| `ctf-16` | Session `ratio` / `neighbourId` + `enterSplit` / `setCompanion` | M | Sonnet |
| `ctf-17` | Visual picker chrome + Beside list + CTF-D17 rename | M | Sonnet |
| `ctf-18` | Close gate | S | Sonnet / Composer |

---

## Cost estimate

| Wave | Tasks | Wall-clock |
|---|---|---|
| Wave 1 — engine | `ctf-15` | ~1–2h |
| Wave 2 — session | `ctf-16` | ~2–3h |
| Wave 3 — chrome | `ctf-17` | ~2–4h |
| Wave 4 — close | `ctf-18` | ~1h |
| **Total** | **4** | **~6–10h** |

**Caps:** 0 Opus. No migration.

---

## References

- p1–p3 batches under [`../`](../)
- Code: `focus-leaf.ts`, `usePaneFocusSession.ts`, `PaneFocusButton.tsx`, `CockpitLeafView.tsx`

---

**Created:** 2026-07-18. **Status:** ✅ Complete 2026-07-18 (`ctf-15`…`18`).
