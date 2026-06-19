# Task obj-06: `vitals-schema.ts` registry + `vitals-derive.ts` (units, MAP/BSA, range flags)

> **Filename:** `task-obj-06-vitals-schema-and-derived-calculators.md` in `objective-tab/p2-vitals-2/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Create the pure, frontend-only data + math layer Vitals 2.0 needs: a `vitals-schema.ts`
registry describing each vital (canonical unit, display units + conversion, step, age/sex-aware
advisory range bands) and a `vitals-derive.ts` module of deterministic calculators (MAP, BSA
via Mosteller, unit converters, and the range-flag evaluator). No UI (obj-07) and no storage
(obj-05) — this is the registry/calculator slice, the Vitals analog of P1's `exam-schema.ts`
and the existing `bmi.ts` derived badge.

**Program / Phase:** objective-tab · Phase 2 (Vitals 2.0)  
**Batch:** [`plan-p2-objective-tab-vitals-2-batch.md`](../plan-p2-objective-tab-vitals-2-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-objective-tab-vitals-2.md`](./EXECUTION-ORDER-p2-objective-tab-vitals-2.md)  
**Estimated Time:** ~1.5–2.5 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19

**Change Type:**
- [ ] **New feature** — two new pure lib modules + tests; no existing behaviour changes.

**Current State:** (check existing code first!)
- ✅ **What exists:** `bmi.ts` (`computeBmi` + category — the derived-badge precedent); P1 `exam-schema.ts` (registry shape + resolver precedent); migration-103 CHECK ranges (the hard storage bounds) and obj-05's field set.
- ❌ **What's missing:** any vitals registry, unit conversion, MAP/BSA, or range-flag logic.

**Scope Guard:**
- Expected files touched: ≤ 4 (`vitals-schema.ts`, `vitals-derive.ts`, + their unit tests).
- **No** grid wiring (obj-07), **no** storage/migration change (obj-05), **no** persistence of unit preference (P3). Pure functions + data only.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. `vitals-schema.ts` registry
- [x] ✅ 1.1 A `VitalDefinition` per vital: `key` (matches the `RxFormFields` key), `label`, `canonicalUnit`, `displayUnits` (with conversion to/from canonical + `step`/`precision`), and `range` bands. - **Completed: 2026-06-19**
- [x] ✅ 1.2 Covers the shipped 7 + obj-05's extended numeric set; unit toggles on temp °C/°F, weight kg/lb, height/HC/MUAC/waist cm/in, glucose mg/dL↔mmol/L; HC + MUAC flagged `pedsOnly`. (Categorical `vitalsBpPosture`/`vitalsBpLimb` are out of the numeric registry — plain selects in obj-07.) - **Completed: 2026-06-19**
- [x] ✅ 1.3 Range bands are **advisory**, age-aware (HR, RR, BP) and sex-aware (waist), each kept within the migration-103/151 hard CHECK bounds; `NO_BAND` for vitals with no flat flag (weight, height, pain, HC). - **Completed: 2026-06-19**
- [x] ✅ 1.4 `resolveVital(key)` accessor + `VITAL_ORDER`/`listVitals()` stable render order (mirrors `exam-schema.ts`). - **Completed: 2026-06-19**

### 2. `vitals-derive.ts` calculators
- [x] ✅ 2.1 Unit converters: `cToF`/`fToC`, `kgToLb`/`lbToKg`, `cmToIn`/`inToCm`, `mgDlToMmolL`/`mmolLToMgDl` (glucose factor 18.0182) — pure exact-affine inverses, round-trip stable < 1e-9. - **Completed: 2026-06-19**
- [x] ✅ 2.2 `computeMap(sys, dia)` = `dia + (sys − dia) / 3` (null-safe; rejects dia > sys). - **Completed: 2026-06-19**
- [x] ✅ 2.3 `computeBsa(heightCm, weightKg)` = Mosteller `sqrt(ht*wt/3600)` (null-safe). - **Completed: 2026-06-19**
- [x] ✅ 2.4 `evaluateRange(key, canonicalValue, { ageYears?, sex? })` → `'low' | 'normal' | 'high' | null` using the schema bands. - **Completed: 2026-06-19**

### 3. Verification & Testing
- [x] ✅ 3.1 Schema test: every numeric vital key resolves (type-checked against `RxFormFields`); canonical unit first; no advisory band violates the hard CHECK bounds. - **Completed: 2026-06-19**
- [x] ✅ 3.2 Converter round-trip tests within tolerance; MAP/BSA against known references. - **Completed: 2026-06-19**
- [x] ✅ 3.3 Range-flag boundary tests (just-below/at/just-above each edge; age + sex variants). - **Completed: 2026-06-19**
- [x] ✅ 3.4 `tsc` clean on touched files; targeted vitest green (28 pass); eslint clean. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/vitals-schema.ts
CREATE: frontend/lib/cockpit/vitals-derive.ts
CREATE: frontend/lib/cockpit/__tests__/vitals-schema.test.ts
CREATE: frontend/lib/cockpit/__tests__/vitals-derive.test.ts
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Pure + deterministic** — no `Date.now`, no I/O, no React. Same discipline as `exam-schema.ts`/`bmi.ts`.
- Converters must be **round-trip-stable** to the precision obj-08 asserts (define and document it).
- Advisory range bands **never** exceed migration-103 hard CHECK bounds (storage is the source of truth for hard limits).
- No pediatric percentile curves here (P2-D4 / P6) — only flat advisory bands.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** (pure frontend lib).
- [ ] **Any PHI in logs?** **No** (no logging; values flow through pure functions).
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [ ] Every vital key resolves with correct canonical unit + bands within CHECK bounds.
- [ ] Converters round-trip without drift; MAP/BSA match known references.
- [ ] `evaluateRange` is correct at band boundaries and age/sex variants.
- [ ] Pure, deterministic, unit-tested; no UI/storage coupling.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-05-vitals-data-model-and-form-state.md`](./task-obj-05-vitals-data-model-and-form-state.md) — freezes the field set this registry describes.
- [`task-obj-07-vitals-grid-2-ui.md`](./task-obj-07-vitals-grid-2-ui.md) — consumes the registry + calculators.
- [`task-obj-08-vitals-close-gate.md`](./task-obj-08-vitals-close-gate.md) — proves conversion/flag/derived correctness.

---

**Last Updated:** 2026-06-18  
**Pattern:** P1 `exam-schema.ts` registry + existing `bmi.ts` derived calculator.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
