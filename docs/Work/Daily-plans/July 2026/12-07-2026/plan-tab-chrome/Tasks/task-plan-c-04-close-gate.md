# Task plan-c-04: Close gate

> **Program:** [`../README.md`](../README.md) · exec [`./EXECUTION-ORDER-plan-tab-chrome.md`](./EXECUTION-ORDER-plan-tab-chrome.md)

## Scope (Wave 3 — prove, don’t re-implement)

1. **Order** — Investigations → Medications → Follow-up → Advice → Referral → Notes (PLAN-C2).
2. **Depth / accent** — L1 recessed + plan family accent; L2 Advice/Education raised, no L1 accent rail (PLAN-C3/C4/C5).
3. **a11y** — hierarchy via tone + elevation (not hue-only); no PHI in new labels/testids.
4. **Behaviour** — L1 collapse still works; Rx densify / favorites / packs unchanged (PLAN-C7).
5. **Verification** — PlanSection + close-gate suites green; lint clean on touched files.

## DO NOT

- New product behaviour
- Medicine-row depth (deferred)
- Drag-reorder / layout persistence
- Weaken existing assertions to pass

## Acceptance

- [x] Close-gate test file green
- [x] PlanSection suite green
- [x] QA checklist noted (light/dark tokenised)
- [x] README marked complete
