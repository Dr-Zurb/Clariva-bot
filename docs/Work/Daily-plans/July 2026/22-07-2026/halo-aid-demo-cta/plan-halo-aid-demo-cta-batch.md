# Halo Aid — Book a demo CTA (Cal.com)

> **Status:** ✅ Complete (2026-07-22).
> **One-line intent:** Replace the placeholder `mailto:` “Book a demo” CTAs with a branded `/demo` page that embeds the live Cal.com EU event (`halo.aid/demo`).

---

## Decision lock

| ID | Decision |
|---|---|
| **DEMO-D1** | Dedicated `/demo` route (not a modal). Shareable + SEO-able. |
| **DEMO-D2** | Cal.com EU embed via `@calcom/embed-react` with `calOrigin=https://app.cal.eu`. |
| **DEMO-D3** | `calLink` = `halo.aid/demo` (overridable via `NEXT_PUBLIC_DEMO_CAL_LINK`). |
| **DEMO-D4** | Pure frontend — no backend, no migration, no lead table. |
| **DEMO-D5** | Reuse `MarketingNav` + `MarketingFooter` + `.halo` tokens. |

## External (you-action, done)

- Cal.com EU account: `halo.aid`
- Event: **Halo Aid Demo** · 20 min · `https://cal.eu/halo.aid/demo`
- Calendar: personal Gmail · Availability: Asia/Kolkata

## Shipped

- `@calcom/embed-react` + `DEMO_HREF=/demo` + Cal link/origin constants
- `frontend/app/demo/page.tsx` + `DemoScheduler.tsx`
- Hero / FinalCta / Nav CTAs → `/demo`

## Acceptance

- [x] `/demo` HTTP 200 with Halo chrome + Cal embed.
- [x] Hero, Final CTA, and Nav “Book a demo” land on `/demo` (no mailto).
- [x] Embed uses EU origin (`app.cal.eu`).
- [x] Slice eslint / typecheck clean for touched files.

**Created:** 2026-07-22. **Shipped:** 2026-07-22.
