# SOAP card visual hierarchy — 05 Jul 2026 batch plan

> **Program batch.** Extends the opt-in **depth-tone + left-rail** cue (proven in Social History) to the rest of the subjective and objective tabs, unifies the drifting muted-tint tokens + hand-rolled sticky treatments into one shared surface helper, and layers optional L1-only category color / section icons on top. **View-only — no palette change, no behaviour/scroll/derivation change, in-clinic + exam parity byte-identical.**
>
> **Overview + decisions:** [`README.md`](./README.md) (decision locks `VH-D1..D6`).
>
> **Builds on (reuse, do not fork):** the `CollapsibleDepth` context + `depthTone` prop already in `frontend/components/ui/sticky-stack.tsx` / `CollapsibleContainer.tsx` / `CollapsibleEntryCard.tsx`; the Social History proof of concept; the tokenised palette in `frontend/app/globals.css`; the sticky-stack offset machinery (`useStickyHeader`).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-soap-card-visual-hierarchy.md`](./Tasks/EXECUTION-ORDER-soap-card-visual-hierarchy.md).

---

## What this batch does (one sentence)

> **Collapse the ad-hoc `bg-muted/10..30` tints into one canonical ladder behind a shared `useDepthToneSurface()` helper, opt the top-level SOAP sections + chief complaints into the existing depth context, apply the same cue to the bespoke exam cards (Opus), and add optional L1 category color / icons + a depth-aware sticky shadow — with every collapse/scroll/parity suite staying green.**

---

## Scope

| Surface | Change | Mechanism | Task |
|---|---|---|---|
| Tint tokens | replace scattered `bg-muted/10 · /15 · /20 · /25 · /30` with **one** recessed/raised ladder | extract into a shared helper; sweep call sites | `vh-01` |
| Shared helper | `useDepthToneSurface()` returning `{ surface, rail, recessed }` from the depth context | new hook next to `useCollapsibleDepth` | `vh-01` |
| SOAP section roots | reconcile subjective/objective top-level containers so tone starts from a consistent baseline | `depthTone` audit on section roots | `vh-01` |
| Chief complaints | `ComplaintList` / `ComplaintCard` / `AssociatedComplaintsPanel` read depth tone | opt into context (or the helper) | `vh-02` |
| Exam cards | `ExamSystemCard` → `ExamSubsectionCollapsible` → finding + chip-group cards adopt tone/rail | thread the helper through the bespoke cards | `vh-03` |
| Section chrome | L1-only category color accent + section icon + depth-aware sticky shadow | `SubjectiveSection` / `ObjectiveSection` + sticky-stack | `vh-04` |
| Verification | light/dark QA + a11y (not color-only) + `tsc`/lint/test parity | tests + manual QA notes | `vh-05` |

**Out of scope:** palette-token edits; colored card backgrounds; any collapse/scroll/sticky **behaviour** change; exam derivation/layout/data changes; theming beyond the L1 rail + count pill.

---

## Decision lock

Frozen in [`README.md` → Decision lock](./README.md#decision-lock-freezes-on-promotion): **VH-D1** view-only/no-palette-change · **VH-D2** tonal-alternation + neutral rail is the core cue · **VH-D3** opt-in via context (no forced global flip) · **VH-D4** one canonical tint ladder + shared surface helper · **VH-D5** never color-only (light + dark) · **VH-D6** parity: no regression outside opted-in areas, no behaviour/test change.

---

## Cross-cutting acceptance gate (whole batch)

The batch is green only when **all** hold:

- [x] There is **one** recessed tint + **one** raised surface value in use across the opted-in areas; the old `/10../25` variants are gone from those call sites. _(vh-01)_
- [x] A bespoke card can opt into depth tone with a single `useDepthToneSurface()` call — no duplicated class logic. _(vh-01)_
- [x] Chief complaints show the alternating tone + rail at cluster / card / associated levels; collapse + scroll behaviour unchanged. _(vh-02)_
- [x] The five exam systems show the tone + rail at system / subsection / finding levels; **exam derivation + layout parity suites stay green (byte-identical)**. _(vh-03)_
- [x] Category color / icons (if added) appear **only at L1** and never as a full card background; the tonal cue still carries meaning with color removed. _(vh-04)_
- [x] Distinction holds in **both light and dark** and is not conveyed by hue alone (a11y). _(vh-05)_
- [x] `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice (pre-existing unrelated failures routed, not introduced). _(vh-05)_

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `vh-01` | Canonical tint ladder + shared `useDepthToneSurface()`; reconcile SOAP section roots | S–M | Sonnet |
| `vh-02` | Chief-complaints depth cue | M | Sonnet |
| `vh-03` | Exam depth cue across the bespoke exam cards | M–L | **Opus** (5+ files) |
| `vh-04` | Orthogonal: L1 category color + section icons + depth-aware sticky shadow | S–M | Sonnet |
| `vh-05` | Close gate: light/dark + a11y + verification | S | Sonnet |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | vh-01 (tokens + helper + roots) | 1 | 0 | ~2–3h |
| Wave 2 | vh-02 (chief complaints) | 1 | 0 | ~2–3h |
| Wave 3 | vh-03 (exam cards) | 0 | 1 (5+ files) | ~3–5h |
| Wave 4 | vh-04 (color/icons/shadow) — optional | 1 | 0 | ~2–3h |
| Wave 5 | vh-05 (close gate) | 1 | 0 | ~1–2h |
| **Total** | **5** | **4** | **1** | **~10–16h agent-time** |

**Caps check:** ≤1 Opus per wave ✓. **Batch Opus count = 1** (vh-03). No migration / PHI / RLS ⇒ no schema escalation.

---

## Sequencing notes

- **vh-01 first (substrate).** Everything downstream reads the canonical ladder + helper; landing it first stops each later task from re-deriving tint logic. Low blast radius → Sonnet.
- **vh-02 next (cheap win).** Chief complaints already use `CollapsibleContainer`/`CollapsibleEntryCard`, so opting in is mostly wiring `depthTone` + verifying scroll. Sonnet.
- **vh-03 (the refactor).** Exam cards are bespoke (not the shared collapsibles), so the helper has to be threaded by hand across 5+ files → Opus, and it must prove exam parity.
- **vh-04 optional.** Color/icons are additive polish; can ship or be dropped without touching the core cue.
- **vh-05 last (prove + gate).** Light/dark screenshots, a11y (not color-only), `tsc`/lint/test.

---

## References

- **Overview / decisions:** [`README.md`](./README.md).
- **Depth-tone engine:** `frontend/components/ui/sticky-stack.tsx`; consumers `CollapsibleContainer.tsx`, `CollapsibleEntryCard.tsx`.
- **Proof of concept:** `frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx`.
- **Palette lock:** `frontend/app/globals.css` (UI-D3 — status color in chips, not backgrounds).
- **Process:** `docs/Work/process/PHASED-PLANS-GUIDE.md` · `EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`. **DoD:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

**Created:** 2026-07-05. **Status:** Committed — not yet implemented.
