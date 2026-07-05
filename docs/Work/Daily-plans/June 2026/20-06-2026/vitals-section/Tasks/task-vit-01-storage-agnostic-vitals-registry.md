# Task vit-01: Storage-agnostic vitals registry + full catalog definition

> **Filename:** `task-vit-01-storage-agnostic-vitals-registry.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Freeze the **full vitals catalog** behind a **storage-agnostic registry**. Extend `VitalDefinition`
(`frontend/lib/cockpit/vitals-schema.ts`) with a `group` (Core / Respiratory / Metabolic / Neuro /
Paediatric / Obstetric) and a `storage: "column" | "json"` flag, then add **every** new vital from the
catalog so the registry is the single source of truth for what a vital is and where it lives. This is a
**pure data module** — no UI, no storage, no migration, no React. Downstream phases (render, hide/unhide,
trends, validation, derived-text) all read through the registry and never hardcode a field list or a column.

**Program / Phase:** vitals-section · VP1 (catalog + storage foundation)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **Done** (2026-06-20).

**Change Type:**
- [x] **Update existing** — extend the shipped `VITALS_REGISTRY` + `VitalDefinition`. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `VITALS_REGISTRY` with 14 numeric vitals + `pedsOnly`; `VITAL_ORDER`; `resolveVital`/`listVitals`; the 2 categorical selects (`vitalsBpPosture`/`vitalsBpLimb`) live outside the registry (obj-07).
- ✅ **What's missing:** ~~`group` + `storage` fields; the ~13 new numeric vitals + the new categorical/context fields; a way to list vitals by group/storage.~~ **Shipped in vit-01.**

**Scope Guard:**
- Expected files touched: ≤ 2 (`vitals-schema.ts` + its test). **No** UI, **no** storage, **no** migration, **no** form-state/payload wiring (that's vit-03/04), **no** validation move (vit-03).
- Keep the existing 14 vitals' `key`/units/ranges **byte-stable**; only ADD fields/entries. Existing keys stay `storage: "column"`.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Extend the definition shape
- [x] ✅ 1.1 Add `group: VitalGroup` (`"core" | "respiratory" | "metabolic" | "neuro" | "paediatric" | "obstetric"`) and `storage: "column" | "json"` to `VitalDefinition`; tag the existing 14 vitals (all `storage: "column"`, grouped; HC/MUAC = `paediatric`). - **Completed: 2026-06-20**
- [x] ✅ 1.2 Add registry helpers: `listVitalsByGroup()` and `vitalsByStorage(kind)`; keep `VITAL_ORDER` as the canonical render order (new vitals appended in group order). - **Completed: 2026-06-20**

### 2. Add the new numeric vitals (`storage: "json"`)
- [x] ✅ 2.1 Respiratory: O₂ flow (L/min), FiO₂ (%), PEFR (L/min) with hard bounds + advisory bands where clinically meaningful. - **Completed: 2026-06-20**
- [x] ✅ 2.2 Metabolic: blood ketones (mmol/L), Hip (cm); Waist stays as-is. - **Completed: 2026-06-20**
- [x] ✅ 2.3 Neuro: GCS E / V / M sub-scores, pupil size L/R (mm), capillary refill (s) — `gcs_total` stays canonical (auto-sum is a UI concern, vit-06). - **Completed: 2026-06-20**
- [x] ✅ 2.4 Obstetric: fetal heart rate (bpm), fundal height (cm). - **Completed: 2026-06-20**

### 3. Catalog the categorical / context fields
- [x] ✅ 3.1 Declare the non-numeric fields (O₂ delivery method, glucose timing, pupil reactivity L/R, AVPU, pulse rhythm, temp site) in a sibling **categorical registry** (allowed value sets) — separate from the numeric `VitalDefinition` (mirrors how posture/limb stay out of the numeric registry today). All `storage: "json"`. - **Completed: 2026-06-20**

### 4. Verification & Testing
- [x] ✅ 4.1 Unit test: every registry entry has a group + storage; existing 14 keys unchanged + `storage: "column"`; `hardMin < hardMax`; advisory bands within hard bounds; helpers return the expected partitions. - **Completed: 2026-06-20**
- [x] ✅ 4.2 `frontend tsc` + lint clean on touched files; targeted vitest green. - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/vitals-schema.ts (group + storage + new vitals + helpers)
UPDATE/CREATE: a sibling categorical-vitals registry (allowed value sets) + tests
DO NOT TOUCH: any UI, form-state, buildRxPayload, validation, migration (vit-02/03/04/05/06)
```

**When updating existing code:**
- [x] ADD-only to the existing 14 vitals — never change their key/units/ranges (byte-stability for P2/P6 consumers).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Registry is the single source of truth** — group + storage live here; nothing downstream hardcodes a field list.
- **Additive only** — existing vitals stay `storage: "column"` and byte-stable.
- **Pure data** — no React, no I/O, no `Date.now` (matches the module's existing contract).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — pure config module; no migration, no write.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — pure registry data; the migration that gives these `storage: "json"` vitals a home is vit-02.

---

## ✅ Acceptance & Verification Criteria

- [x] Every vital (existing + new) declares `group` + `storage`; existing 14 unchanged; helpers partition by group/storage.
- [x] Categorical/context fields catalogued with allowed value sets.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The freeze that lets the whole program stay registry-driven: once `group` + `storage` exist and the catalog is complete, render (vit-05/06), hide/unhide (vit-07/08), trends (vit-10), and validation (vit-03) all consume one source and never branch on a hardcoded field.

**Shipped artifacts:**
- `frontend/lib/cockpit/vitals-schema.ts` — 27 numeric vitals (14 column + 13 json), `ColumnVitalKey`, `listVitalsByGroup`, `vitalsByStorage`.
- `frontend/lib/cockpit/categorical-vitals-schema.ts` — 7 categorical vitals with allowed value sets.
- Minimal `ColumnVitalKey` wiring in `vitals-trends.ts` + `useLastVisitVitals.ts` (tsc compile guard only; json trends deferred to vit-10).

---

## 🔗 Related Tasks

- [`task-vit-02-migration-vitals-json.md`](./task-vit-02-migration-vitals-json.md) — gives the `storage: "json"` vitals a column.
- [`task-vit-05-grouped-vitals-grid.md`](./task-vit-05-grouped-vitals-grid.md) — first UI consumer of `group`.

---

**Last Updated:** 2026-06-20  
**Pattern:** extend the P2 `vitals-schema.ts` registry; storage-agnostic single source of truth.  
**Reference:** `process/CODE_CHANGE_RULES.md`
