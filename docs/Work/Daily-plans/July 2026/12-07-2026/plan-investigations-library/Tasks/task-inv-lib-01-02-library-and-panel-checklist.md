# Task inv-lib-01 + inv-lib-02: Library growth + panel checklist

> **Program:** [`../README.md`](../README.md)

## Scope (W0 + W1)

1. Grow `LAB_ANALYTES` / `LAB_PANELS` + shared imaging orders list (curated OPD).
2. Order catalog helpers: search panels + analytes + imaging; panel commit labels (full → panel name, partial → members).
3. Investigations UI: picking a panel opens a checklist (select all / clear / toggle); imaging + analytes + custom add directly.
4. Quick chips stay common panels + imaging; panel chip opens checklist.

## DO NOT

- Migration / `investigations_orders_json`
- AI endpoint
- Rewrite Objective Reports UI

## Acceptance

- [x] Library tests green (panels reference valid analyte ids)
- [x] Full panel → one chip with panel name
- [x] Partial panel → member name chips
- [x] Custom + imaging still work
- [x] PlanSection / InvestigationsPane tests green
