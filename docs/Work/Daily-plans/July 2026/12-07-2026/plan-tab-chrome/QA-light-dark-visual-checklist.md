# Plan tab chrome — light/dark visual QA checklist

> Companion to [`Tasks/task-plan-c-04-close-gate.md`](./Tasks/task-plan-c-04-close-gate.md). Surfaces are tokenised (`bg-muted/30`, `bg-card`, plan family accent rail) — same ladder as VH.

## Automated (close-gate suite)

- [x] Zone DOM order matches PDF authoring order
- [x] L1 recessed + `SOAP_TAB_FAMILY_ACCENT.plan`; L2 raised without L1 accent
- [x] Tab root (`plan-scroll-top`) has no depthTone surface
- [x] Collapse toggle on Medications L1
- [x] Hierarchy survives grayscale (tone + shadow, not hue backgrounds)

## Manual spot-check (optional)

- [ ] Light: expand Investigations → Meds → Advice L2; depths readable
- [ ] Dark: same; no washed-out borders
- [ ] Sticky headers pin while scrolling a long meds list

**Date:** 2026-07-12
