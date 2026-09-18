# DEMO-01 — Constants + Cal.com React embed dep

> **Status:** ✅ Complete.
> **Plan:** [`../plan-halo-aid-demo-cta-batch.md`](../plan-halo-aid-demo-cta-batch.md)

## Goal

Add `@calcom/embed-react` and replace the mailto `DEMO_HREF` with `/demo` + Cal link/origin constants.

## Changes

- `npm install @calcom/embed-react` in `frontend/`
- `frontend/components/marketing/constants.ts`:
  - `DEMO_HREF = "/demo"`
  - `DEMO_CAL_LINK` from `NEXT_PUBLIC_DEMO_CAL_LINK` (default `halo.aid/demo`)
  - `DEMO_CAL_ORIGIN` from `NEXT_PUBLIC_DEMO_CAL_ORIGIN` (default `https://app.cal.eu`)
- Document both vars in `frontend/.env.example`

## Done when

- [x] Mailto TODO removed; `DEMO_HREF` is `/demo`
- [x] Package present in `frontend/package.json`
