# DEMO-02 — `/demo` page + DemoScheduler

> **Status:** ✅ Complete.
> **Plan:** [`../plan-halo-aid-demo-cta-batch.md`](../plan-halo-aid-demo-cta-batch.md)

## Goal

Ship a branded demo landing page with an inline Cal.com EU embed.

## Changes

- `frontend/app/demo/page.tsx` — server page: metadata, `.halo`, MarketingNav/Footer, value recap, embed
- `frontend/components/marketing/DemoScheduler.tsx` — client: `@calcom/embed-react` with `calOrigin`, Halo brand color

## Done when

- [x] `/demo` renders with Halo chrome
- [x] Embed loads slots from `halo.aid/demo` on `app.cal.eu`
