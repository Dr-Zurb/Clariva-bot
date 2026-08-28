# Halo Aid home — execution order

> Sibling of [`../plan-halo-aid-home-batch.md`](../plan-halo-aid-home-batch.md). Plan = what + why + decision lock; this = who-runs-what-when + model.
>
> **Decision lock:** see batch plan (`HAH-D1`…`D6`).
>
> **Frontend-only batch.** No migration, no PHI write, no RLS → all tasks run on **Sonnet/Composer** (no Opus escalation trigger per `.cursor/rules/00-agent-contract.mdc`).

> **Shape.** Four tasks. `hah-01` lands brand assets + the marketing-scoped blue tokens (the visual foundation everything else consumes). `hah-02` builds the nav + hero + footer shell. `hah-03` fills the body sections (how-it-works, features, trust, final CTA). `hah-04` adds SEO/OG, does the responsive + a11y pass, and closes the verification gate.

---

## Pre-flight checklist (before Wave 1)

- [ ] `HAH-D1`…`D6` reviewed (executed under the lock through close gate).
- [ ] **OQ-2** — vector logo supplied, or trace SVG in `hah-01`? Default: trace.
- [ ] **OQ-1** — "Book a demo" destination. Can start `hah-01`/`hah-02` with the placeholder; **must be resolved before `hah-04` close gate.**

---

## Wave plan

```
Wave 1 (~30–45m):
  hah-01  brand assets (halo-logo/logomark SVG) + .halo blue token scope   [Sonnet/Composer]
        │
        ▼
Wave 2 (~1.5–2h):
  hah-02  marketing nav + hero + footer (components/marketing/*)           [Sonnet]
        │
        ▼
Wave 3 (~1.5–2h):
  hah-03  how-it-works + features + trust + final CTA sections             [Sonnet]
        │
        ▼
Wave 4 (~45m–1h):
  hah-04  SEO metadata + OG + responsive/a11y polish + close gate          [Sonnet/Composer]
```

Serial by design — each wave consumes the previous (tokens → shell → sections → polish).

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **hah-01** | S | Sonnet/Composer | `public/brand/logomark.svg` (structure ref); brand `.jpg` sources | New `halo-logo.svg` + `halo-logomark.svg`; `.halo` CSS var block. **No global token edits.** |
| W2.0 | **hah-02** | M | Sonnet | `components/ui/button.tsx`; `app/page.tsx`; hah-01 assets/tokens | `MarketingNav`, `Hero`, `MarketingFooter`; wire CTAs (`/signup`, `/login`, OQ-1). |
| W3.0 | **hah-03** | M | Sonnet | hah-02 section scaffolding; `components/ui/card.tsx`; `lucide-react` | `HowItWorks` (4 steps), `FeatureGrid`, `TrustBand`, `FinalCtaBand`, testimonial stub. |
| W4.0 | **hah-04** | S | Sonnet/Composer | hah-02/03 output; `app/layout.tsx` metadata pattern | Landing metadata + OG image; mobile→desktop pass; a11y; lint/test/build. Resolve OQ-1. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| hah-01 | S | Sonnet/Composer | Static assets + scoped CSS vars; mechanical. |
| hah-02 | M | Sonnet | Component composition + responsive layout judgement. |
| hah-03 | M | Sonnet | Multiple sections + copy + layout. |
| hah-04 | S | Sonnet/Composer | Metadata + QA + verification gate. |

**Caps check:** frontend-only; no Opus needed. No PHI, no migration, no RLS. Global teal tokens untouched (HAH-D1).

---

## Acceptance gate

See the [batch plan's acceptance gate](../plan-halo-aid-home-batch.md#acceptance-gate).

---

## Task files

- [`task-hah-01-brand-assets-and-tokens.md`](./task-hah-01-brand-assets-and-tokens.md)
- [`task-hah-02-nav-hero-footer.md`](./task-hah-02-nav-hero-footer.md)
- [`task-hah-03-sections.md`](./task-hah-03-sections.md)
- [`task-hah-04-seo-a11y-close-gate.md`](./task-hah-04-seo-a11y-close-gate.md)

---

**Created:** 2026-07-21. **Status:** ✅ Complete (2026-07-21) — `hah-01`…`hah-04` shipped; `/` live (blue, `.halo`-scoped); slice lint/typecheck clean.
