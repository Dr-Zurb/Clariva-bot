# rx-polish-favorites — execution order

> Wave matrix for the [rx-polish-favorites batch plan](../plan-rx-polish-favorites-batch.md). 7 tasks across 4 waves. Wave 1 + Wave 2 have parallel-safe tasks; Wave 3 + 4 sequential.

---

## Visual sequence

```
Wave 1 ─── parallel ────────────────────┐
  α  rxf-01 (108 migration: doctor_drug_usage)
  β  rxf-02 (109 migration: doctor_drug_favorites)
  γ  rxf-03 (send-handler usage-increment)
                                        │
Wave 2 ─── parallel ────────────────────┴───►
  α  rxf-04 (favorites service + side-sheet)
  β  rxf-05 (autocomplete personal ranking)
                                        │
Wave 3 ─── sequential ──────────────────┴───►
  └── rxf-06 (chip-strip wire-up in PlanSection)
                                        │
Wave 4 ─── sequential ──────────────────┴───►
  └── rxf-07 (verify + close-out)
```

---

## Task table

| # | Task | Size | Model | Wave | Depends on | Files touched |
|---|---|---|---|---|---|---|
| 1 | [rxf-01: 108_doctor_drug_usage migration](./task-rxf-01-doctor-drug-usage-migration.md) | XS | Auto | 1 | — | `backend/migrations/108_doctor_drug_usage.sql` (new); `backend/tests/unit/migrations/108-doctor-drug-usage-migration.test.ts` (new) |
| 2 | [rxf-02: 109_doctor_drug_favorites migration](./task-rxf-02-doctor-drug-favorites-migration.md) | XS | Auto | 1 | — | `backend/migrations/109_doctor_drug_favorites.sql` (new); `backend/tests/unit/migrations/109-doctor-drug-favorites-migration.test.ts` (new) |
| 3 | [rxf-03: Usage-increment on Send Rx](./task-rxf-03-usage-increment-on-send.md) | S | Auto | 1 | rxf-01 (table exists) — but file disjoint so can start on a branch | `backend/src/services/prescriptions-service.ts` (mod); `backend/tests/unit/services/prescriptions-send-usage.test.ts` (new) |
| 4 | [rxf-04: Favorites service + side-sheet](./task-rxf-04-favorites-service-and-side-sheet.md) | M | Auto | 2 | rxf-02 (table exists) | `backend/src/services/doctor-drug-favorites-service.ts` (new); `backend/src/api/routes/doctor-drug-favorites.ts` (new); `frontend/lib/api/doctor-drug-favorites.ts` (new); `frontend/components/cockpit/rx/favorites/FavoritesSideSheet.tsx` (new); `frontend/components/cockpit/rx/favorites/FavoritesChipStrip.tsx` (new) |
| 5 | [rxf-05: Autocomplete personal ranking](./task-rxf-05-autocomplete-personal-ranking.md) | S | Auto | 2 | rxf-01 (data source) | `backend/src/services/doctor-drug-usage-service.ts` (new); `backend/src/api/routes/doctor-drug-usage.ts` (new); `frontend/lib/api/doctor-drug-usage.ts` (new); `frontend/hooks/useDoctorDrugUsage.ts` (new); `frontend/components/ehr/DrugAutocomplete.tsx` (mod) |
| 6 | [rxf-06: Wire chip strip + apply](./task-rxf-06-wire-chip-strip-and-apply.md) | S | Auto | 3 | rxf-04, rxd-03 (active-row tracking) | `frontend/components/cockpit/rx/sections/PlanSection.tsx` (mod) |
| 7 | [rxf-07: Verification + close-out](./task-rxf-07-verification-and-close-out.md) | XS | Composer 2 Fast | 4 | rxf-06 | `frontend/lib/patient-profile/telemetry.ts` (mod, +~60 LOC for 3 events); `docs/Reference/product/cockpit/COCKPIT.md` (mod); roadmap (mod); capture-inbox (mod) |
| **Totals** | **7** | — | **6 Auto · 1 Composer · 0 Opus** | — | — | — |

---

## Critical path

`rxf-01 → rxf-04 → rxf-06 → rxf-07` (longest chain).

`rxf-02`, `rxf-03`, `rxf-05` run alongside without extending the critical path.

Single-engineer wall-clock: ~12-16h. Two-engineer parallel: ~8-10h.

---

## Wave gates

### After Wave 1

- [x] Both migrations apply cleanly; RLS works (B can't see A's rows).
- [x] Sending an Rx increments `doctor_drug_usage` per drug-master medicine.
- [x] Service-layer tests pass.

### After Wave 2

- [x] Favorites CRUD works end-to-end (curl test or unit test).
- [x] Side-sheet renders + lists existing favorites.
- [x] DrugAutocomplete sorts by personal score first.

### After Wave 3

- [x] Chip strip renders above medicine list.
- [x] Tapping a chip inserts a pre-filled active editor row.
- [x] `[+ Save current row]` writes a new favorite.

### After Wave 4

- [x] Cross-cutting gate green; 3 telemetry events firing.

---

## Anti-goals

- ❌ Don't increment usage on draft save.
- ❌ Don't count free-text drugs in usage.
- ❌ Don't add time-decay to ranking in v1.
- ❌ Don't add cross-doctor favorite sharing — capture-inbox.
- ❌ Don't over-engineer the cold-start (just show the hint per DL-5).
