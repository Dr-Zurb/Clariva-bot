# Task vit-05: Grouped numeric vitals grid (registry-driven, storage-agnostic)

> **Filename:** `task-vit-05-grouped-vitals-grid.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Render **all** numeric vitals from the registry in `VitalsGrid`, **grouped** (Core / Respiratory / Metabolic /
Neuro / Paediatric / Obstetric), replacing the hardcoded field list with a `map` over `listVitalsByGroup()`.
Each field reuses the shipped `VitalField` (unit toggle, range flag, ghost value, sparkline slot) so the new
vitals get P2/P6 behaviour for free. Storage-agnostic: the grid never knows whether a value is column- or
json-backed. No new input mechanics — just registry-driven layout.

**Program / Phase:** vitals-section · VP2 (render all vitals)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Update existing** — make `VitalsGrid`/`VitalsExtended` registry-driven + grouped. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `VitalsGrid.tsx` (hardcoded BP/HR/Temp/SpO₂/Wt/Ht + BMI/BSA), `VitalsExtended.tsx` (RR/Pain/Glucose/GCS/Waist + peds `<details>`); `VitalField` with unit/range/ghost/sparkline; vit-01 `group` + vit-04 form-state.
- ❌ **What's missing:** the new numeric vitals are defined + storable but not rendered; the grid is not grouped or registry-driven.

**Scope Guard:**
- Expected files touched: ≤ 4 (`VitalsGrid.tsx`, `VitalsExtended.tsx`, small group-layout helper + tests). **No** categorical fields (vit-06), **no** hide/unhide (VP3), **no** trend wiring beyond the existing sparkline slot (VP4).
- Keep BMI/MAP/BSA derived badges + existing field behaviour intact.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Group-driven layout
- [x] ✅ 1.1 Render numeric vitals by iterating `listVitalsByGroup()`; each group gets a labelled sub-section; Core preserves today's order/look (BP pair, then HR/Temp/SpO₂/Wt(+BMI/BSA)/Ht). - **Completed: 2026-06-21**
- [x] ✅ 1.2 Non-core groups render below; Paediatric keeps the collapsible `<details>` treatment; empty groups (no visible vitals) render nothing. - **Completed: 2026-06-21**

### 2. Reuse field mechanics
- [x] ✅ 2.1 Every field uses `VitalField` (unit toggle, range flag, ghost, sparkline slot) — no per-vital bespoke markup; derived badges (BMI/MAP/BSA) stay where they are. - **Completed: 2026-06-21**
- [x] ✅ 2.2 Storage-agnostic: the grid reads/writes via form-state only (vit-04); never branches on column vs json. - **Completed: 2026-06-21**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: all registry numeric vitals render in group order; existing core fields keep labels/units; derived badges present; sparkline slot intact. - **Completed: 2026-06-21**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green; existing VitalsGrid tests updated (not weakened). - **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/inputs/VitalsGrid.tsx (group map over registry)
UPDATE: frontend/components/cockpit/rx/inputs/VitalsExtended.tsx (groups; reuse VitalField)
CREATE/UPDATE: a small group-layout helper + tests
DO NOT TOUCH: categorical fields (vit-06); hide/unhide (VP3); buildRxPayload; storage
```

**When updating existing code:**
- [x] Reuse `VitalField` for every numeric vital; do not fork field markup.
- [x] Core group preserves today's visual order/labels (no regression for shipped fields).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Registry-driven** — the grid maps over the registry; no hardcoded field list.
- **Storage-agnostic** — read/write via form-state; column vs json invisible to the grid.
- **Reuse P2 field mechanics** — unit/range/ghost/sparkline come from `VitalField`.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — render-only over existing form-state.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — client render over the frozen registry + form-state.

---

## ✅ Acceptance & Verification Criteria

- [x] All numeric vitals render, grouped, registry-driven; core fields unregressed; derived badges intact.
- [x] Storage-agnostic (form-state only); sparkline slot preserved for VP4.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The visible turning point: the grid stops being a fixed list and becomes a projection of the catalog. Every future vital added to the registry shows up here for free.

---

## 🔗 Related Tasks

- [`task-vit-01-storage-agnostic-vitals-registry.md`](./task-vit-01-storage-agnostic-vitals-registry.md) — provides `group`.
- [`task-vit-06-categorical-context-vitals.md`](./task-vit-06-categorical-context-vitals.md) — the categorical counterpart.
- [`task-vit-08-manage-vitals-menu.md`](./task-vit-08-manage-vitals-menu.md) — hides/shows what this renders.

---

**Last Updated:** 2026-06-21  
**Pattern:** registry-driven grouped grid reusing the P2 `VitalField`.  
**Reference:** `process/CODE_CHANGE_RULES.md`
