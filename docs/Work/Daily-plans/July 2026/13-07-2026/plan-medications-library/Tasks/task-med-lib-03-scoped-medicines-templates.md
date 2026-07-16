# med-lib-03 — Scoped medicines templates

**Wave:** W3 · **Size:** M · **Migration:** Yes (170) — **Opus**

## Goal

Save / apply the current Plan medicine list as `doctor_rx_templates` with `scope = medicines`, payload in existing `medicines_json`.

## Done when

- [x] Migration 170 widens scope CHECK with `medicines` (mirror 168)
- [x] FE: `MedicinesSectionTemplateButton` + `apply-medicines-template.ts` (may land ahead of SQL)
- [x] Apply surgically replaces `fields.medicines` + regenerates instance ids
- [x] Unit tests for apply/save helpers + migration content-sanity

## Scope Guard

No new column. Do not drop `doctor_drug_favorites`. Do not change full-Rx TemplatePicker behaviour.
