# Objective tab — Phase 2: Vitals 2.0 — execution order

> Sibling of [`plan-p2-objective-tab-vitals-2-batch.md`](../plan-p2-objective-tab-vitals-2-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `obj-05` is the keystone (migration 151 + backend type/Zod/service + the new vitals form-state on `RxFormFields`) and must land first — the grid and calculators read that state. `obj-06` (the pure `vitals-schema.ts` registry + `vitals-derive.ts` calculators) depends only on the field set obj-05 freezes and can run alongside obj-07's scaffolding. `obj-07` wires the Vitals 2.0 grid using obj-05's state + obj-06's registry/derivations. `obj-08` proves unit round-trip parity, range-flag/derived correctness, ghost-value hydration, runs the a11y sweep, and closes the verification gate. Strictly linear at the keystone; obj-06/07 overlap; obj-08 last.

---

## Wave plan (3 waves)

```
Wave 1 (keystone — ~3–4h):
  obj-05 (migration 151 extended vitals_* + BE type/Zod/service
          + RxFormFields vitals additions + setField wiring)
          [Opus — new migration on a PHI table]
        │
        ▼
Wave 2 (registry + UI — ~4–6h):
  obj-06 (vitals-schema.ts registry + vitals-derive.ts: units, MAP/BSA, range flags) [Lane α]
  obj-07 (Vitals 2.0 grid: extended fields, unit toggles, flags, badges, ghost)        [Lane β, consumes obj-06]
        │
        ▼
Wave 3 (prove + gate — ~2–3h):
  obj-08 (unit round-trip parity, range-flag/derived determinism, ghost hydration,
          existing-7-vitals regression, a11y sweep, verification gate)
          [Opus — correctness + parity fixtures]
```

**Total wall-clock:** ~9–13h agent-time (Wave 2 lanes overlap after obj-05).

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **obj-05** | M | **Opus** | `103_prescription_soap_fields_expansion.sql` (nullable-numeric + CHECK-range + PHI-comment pattern); `150_prescriptions_examination_json.sql` (latest migration; next = 151); `RxFormContext.tsx` (existing `vitalsBp*`/`vitalsHr`… fields + `setField` + `buildRxPayload` mapping); `prescription-service.ts`, `types/prescription.ts`, `utils/validation.ts` (vitals Zod precedent) | Migration `151_prescriptions_vitals_2.sql` (additive `vitals_rr`, `vitals_pain_score`, `vitals_glucose_mg_dl`, `vitals_gcs_total`, `vitals_bp_posture`, `vitals_bp_limb`, `vitals_head_circumference_cm`, `vitals_muac_cm`, `vitals_waist_cm`; CHECK ranges; PHI comments). BE prescription type + Zod range validation + service select/insert/update mapping. New `RxFormFields` keys + defaults + hydration + `buildRxPayload` mapping. FE type mirror. |
| W2.α | obj-06 | S–M | Auto | obj-05 field set; `bmi.ts` (derived-badge precedent); P1 `exam-schema.ts` (registry shape precedent) | `frontend/lib/cockpit/vitals-schema.ts`: per-vital `{ key, label, canonicalUnit, displayUnits + conversions, step, range bands by age/sex }`. `frontend/lib/cockpit/vitals-derive.ts`: MAP (`dia + (sys−dia)/3`), BSA (Mosteller), unit converters (°C↔°F, kg↔lb, cm↔in, mg/dL↔mmol/L), range-flag evaluator. Pure data + functions; unit-tested. |
| W2.β | obj-07 | M | Auto | obj-05 state; obj-06 registry/derivations; `VitalsGrid.tsx` (current grid, `NumericField`, `BmiBadge`); `getLastPrescriptionInEpisode` (ghost source) | Extend `VitalsGrid` (or add `VitalsExtended` subcomponent) to render new fields grouped (core + extended; peds group, possibly collapsible), unit toggles per applicable field, out-of-range flags, MAP/BSA derived badges, last-visit ghost placeholders. Shipped 7 vitals + BMI badge unchanged. |
| W3.0 | **obj-08** | S–M | **Opus** | obj-05 storage + obj-06 conversions/flags; P1 `examDerivationParity.test.tsx` (close-gate fixture pattern); `VitalsGrid` test patterns | Fixtures: unit round-trip (enter °F/lb/in/mmol/L ⇒ canonical stored ⇒ re-display no drift); range-flag boundary correctness across age/sex bands; MAP/BSA determinism; ghost-value hydration read-only; existing-7-vitals value parity (no regression); a11y sweep (labels, unit-toggle keyboard/aria, flag `aria-label`); run verification gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| obj-05 | M | **Opus** | New migration file (hard rule) on a PHI table; multiple typed columns + CHECK ranges + Zod + service mapping + shared form state. Highest-risk slice — Opus. |
| obj-06 | S–M | Auto | Pure, bounded registry + deterministic calculators, cloning `bmi.ts`/`exam-schema.ts`. No data/clinical write path. |
| obj-07 | M | Auto | Grid UI cloned from the proven `VitalsGrid`/`NumericField` pattern over obj-05 state; bounded to the vitals grid + one subcomponent. |
| obj-08 | S–M | **Opus** | Conversion/range correctness + existing-vitals regression-parity fixtures — the same fixture-risk profile that made P1's close-gate Opus. |

**Caps check:** 2 Opus in Phase 2 (obj-05 migration keystone; obj-08 parity gate); ≤1 Opus per wave. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p2-objective-tab-vitals-2-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p2-objective-tab-vitals-2-batch.md`](../plan-p2-objective-tab-vitals-2-batch.md).
- Product plan: [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P2, Zone A, `OBJ-D1..D7`.
- Catalog detail: [`capture/features/objective-tab/exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §B.
- Tasks: [`task-obj-05-…`](./task-obj-05-vitals-data-model-and-form-state.md) · [`task-obj-06-…`](./task-obj-06-vitals-schema-and-derived-calculators.md) · [`task-obj-07-…`](./task-obj-07-vitals-grid-2-ui.md) · [`task-obj-08-…`](./task-obj-08-vitals-close-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ⏳ `Drafted`.
