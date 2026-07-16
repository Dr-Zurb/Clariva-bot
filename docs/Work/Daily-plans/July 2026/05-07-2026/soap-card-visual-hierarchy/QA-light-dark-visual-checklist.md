# SOAP card visual hierarchy — light/dark QA checklist (vh-05)

Manual visual pass for **VH-D5** (both themes; hierarchy not colour-only). Automated gate: `frontend/components/cockpit/rx/__tests__/soapCardVisualHierarchyCloseGate.test.tsx`.

## Light theme

| Area | Depth stack | Pass criteria |
|---|---|---|
| Social History | L0 section → L1 cluster (Diet, Caffeine, …) → L2 entry card | Alternating recessed `bg-muted/30` / raised `bg-card`; left rail on nested cards; pinned headers opaque |
| Chief complaints | L0 section → L1 complaint → L2 associated | Same alternation; main card sticky header pins under section chrome |
| Exam (e.g. CVS) | L1 system card → L2 subsection → L3 finding/chip row | Subsection recessed well + rail; finding rows show rail spine; teleconsult de-emphasis unchanged |
| Tab chrome | Subjective / Objective headings | Family accent rail only (amber / teal left border); icons decorative |

## Dark theme

Repeat the same four areas. Confirm:

- Recessed wells remain visible (not same as page background).
- Rails read at ~30% opacity primary/accent — not invisible.
- Pinned-header shadow ramps with depth (sm → md → lg) over tinted bodies.
- No text illegibility on de-emphasised teleconsult subsections.

## Grayscale sanity check

In devtools → Rendering → Emulate forced colours / grayscale (or desaturate screenshot):

- Depth still readable via **tone alternation + left rail + shadow**, not hue alone.
- Removing L1 family accent (amber/teal rail) still leaves full hierarchy legible.

## Behaviour (unchanged)

- Expand/collapse on every opted-in area.
- Scroll-on-expand glides under sticky stack (no jump on load).
- Exam derivation + objective layout payloads byte-identical (parity suites green).

**Signed off:** 2026-07-05 (automated gate green; manual light/dark pass recommended before promotion).
