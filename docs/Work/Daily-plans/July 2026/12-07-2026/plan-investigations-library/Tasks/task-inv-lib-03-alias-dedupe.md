# Task inv-lib-03: Alias / identity dedupe

> **Program:** [`../README.md`](../README.md) · exec [`./EXECUTION-ORDER-plan-investigations-library.md`](./EXECUTION-ORDER-plan-investigations-library.md)

## Scope (W2)

1. Resolve order labels via catalog **aliases** (Hb ≈ Haemoglobin, CXR ≈ Chest X-ray).
2. Canonicalize new chips to the catalog preferred label when matched.
3. Treat panel chips as occupying their member analytes (can't add Haemoglobin if CBC is already ordered).
4. When adding a full panel, drop redundant member chips already on the list.
5. No migration / AI.

## Acceptance

- [x] Alias duplicate does not add a second chip
- [x] Panel occupies members for dedupe
- [x] Adding panel removes overlapping analyte chips
- [x] Unit + PlanSection tests green
