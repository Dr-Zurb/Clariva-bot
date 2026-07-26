# DEMO-03 — Repoint Book a demo CTAs

> **Status:** ✅ Complete.
> **Plan:** [`../plan-halo-aid-demo-cta-batch.md`](../plan-halo-aid-demo-cta-batch.md)

## Goal

All marketing “Book a demo” entry points go to `/demo` via Next `Link`.

## Changes

- `Hero.tsx` / `FinalCtaBand.tsx`: `<a href={DEMO_HREF}>` → `<Link href={DEMO_HREF}>`
- `MarketingNav.tsx`: add Book a demo (desktop + mobile)

## Done when

- [x] Hero, Final CTA, Nav all navigate to `/demo`
