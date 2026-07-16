# Task inv-lib-04: Catalog resolve suggestions (local v1)

> **Program:** [`../README.md`](../README.md)

## Scope (W3a — FE only)

When free-text does not exact-match the catalog, show **catalog-constrained suggestions** (fuzzy / alias / substring). Doctor must confirm; never auto-commit. "Keep as typed" remains for true customs.

## Out of scope (W3b — switch to Opus)

- New OpenAI `/investigations/parse` (or similar) endpoint
- Suggest-from-Assessment
- PHI logging / gated model tier wiring

## Acceptance

- [x] Custom commit with near-miss opens suggestion panel
- [x] Accept applies canonical catalog label (panel opens checklist)
- [x] Keep as typed adds free-text chip
- [x] No backend / migration
