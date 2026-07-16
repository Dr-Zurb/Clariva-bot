# med-lib-01 — Remove starter packs + favorites from Medications

**Wave:** W1 · **Size:** S · **Migration:** No

## Goal

Clear the Medications L1 body of `PlanStarterPacksStrip` and `FavoritesChipStrip` so the zone is capture bar + rows only (templates land in W3).

## Done when

- [x] `PlanSection` no longer renders starter packs or favorites strip
- [x] Related handlers / imports removed from `PlanSection`
- [x] PlanSection + plan-tab-chrome close-gate tests updated (no favorites/starter assertions)
- [x] Capture bar + `MedicineRow` + Previous Rx + Add medicine still work

## Scope Guard

Do not delete `plan-starter-packs.ts`, favorites components, or the favorites API — only unwire from Plan Medications (MED-D1 / MED-D6).
