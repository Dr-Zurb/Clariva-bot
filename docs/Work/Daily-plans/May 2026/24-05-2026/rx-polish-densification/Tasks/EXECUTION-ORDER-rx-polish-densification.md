# rx-polish-densification — execution order

> Wave matrix for the [rx-polish-densification batch plan](../plan-rx-polish-densification-batch.md). 4 tasks across 3 waves. Zero parallel lanes (Wave 2's two tasks are sequential within the wave). Zero Opus turns.

---

## Visual sequence

```
Wave 1 ─── sequential ─────►
  └── rxd-01 (validity helper)
                         │
Wave 2 ─── sequential ───┴────►
  └── rxd-02 (MedicineRow two-state)
                         │
  └── rxd-03 (PlanSection active-row tracking)
                         │
Wave 3 ─── sequential ───┴────►
  └── rxd-04 (verify + close-out)
```

---

## Task table

| # | Task | Size | Model | Wave | Depends on | Files touched |
|---|---|---|---|---|---|---|
| 1 | [rxd-01: medicine-row-state helper](./task-rxd-01-medicine-row-state-helper.md) | XS | Auto | 1 | — | `frontend/lib/cockpit/medicine-row-state.ts` (new, ~30 LOC); `frontend/lib/cockpit/__tests__/medicine-row-state.test.ts` (new, ~90 LOC) |
| 2 | [rxd-02: MedicineRow two-state](./task-rxd-02-medicine-row-two-state.md) | M | Auto | 2 | rxd-01 | `frontend/components/consultation/MedicineRow.tsx` (mod, +~120 LOC for summary mode + props); `frontend/components/consultation/__tests__/MedicineRow.test.tsx` (mod or new, ~100 LOC) |
| 3 | [rxd-03: PlanSection active-row tracking](./task-rxd-03-plan-section-active-row.md) | S | Auto | 2 | rxd-02 | `frontend/components/cockpit/rx/sections/PlanSection.tsx` (mod, +~30 LOC); `frontend/components/cockpit/rx/sections/__tests__/PlanSection.test.tsx` (mod or new, ~80 LOC) |
| 4 | [rxd-04: Verification + close-out](./task-rxd-04-verification-and-close-out.md) | XS | Composer 2 Fast | 3 | rxd-03 | `frontend/lib/patient-profile/telemetry.ts` (mod, +~20 LOC); `docs/Reference/product/cockpit/COCKPIT.md` (mod); `docs/Work/Product plans/plan-cockpit-v2-execution-roadmap.md` (mod); `docs/Work/capture/inbox.md` (mod) |
| **Totals** | **4** | — | **3 Auto · 1 Composer · 0 Opus** | — | — | — |

---

## Critical path

`rxd-01 → rxd-02 → rxd-03 → rxd-04`

Single engineer wall-clock: ~6-9h.

---

## Wave gates

### After Wave 1

- [ ] `isMedicineRowComplete` exports correct value across all field permutations.
- [ ] Unit tests pass.

### After Wave 2

- [ ] `<MedicineRow>` accepts the new props; defaults preserve legacy single-state behavior.
- [ ] `<PlanSection>` correctly tracks `activeRowIndex` (one-at-a-time invariant).
- [ ] `/dashboard/appointments/[id]` with 3 complete medicines shows 3 summary rows ~48px tall.

### After Wave 3

- [ ] Cross-cutting smoke matrix passes.
- [ ] Telemetry fires.
- [ ] Docs + roadmap + capture-inbox updated.

---

## Anti-goals

- ❌ Don't add backend changes — UI only.
- ❌ Don't change `MedicineRowValue` shape — only render differently.
- ❌ Don't add new required fields — DL-1 freezes the completeness rule.
- ❌ Don't ship animated transitions in v1 — capture-inbox if dogfooding wants polish.
- ❌ Don't refactor `MedicineRow` beyond the two-state addition — minimize diff.
