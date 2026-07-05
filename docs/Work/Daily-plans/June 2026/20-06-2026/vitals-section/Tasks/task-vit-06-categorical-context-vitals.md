# Task vit-06: Categorical / context vitals (O₂ delivery, glucose timing, pupils, AVPU, rhythm, GCS E/V/M)

> **Filename:** `task-vit-06-categorical-context-vitals.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Add the **non-numeric** vitals that give the numbers meaning: O₂ delivery method (+ ties to O₂ flow/FiO₂),
glucose timing (fasting/random/post-prandial), pupil reactivity L/R, AVPU, pulse rhythm, and temperature site —
as plain selects extending the obj-07 posture/limb pattern. Plus the **GCS E/V/M sub-entry** that auto-sums into
the canonical `gcs_total`. All categorical fields are `storage: "json"`, validated by their allowed value sets,
and degrade gracefully when absent.

**Program / Phase:** vitals-section · VP2 (render all vitals)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Update existing** — add categorical selects + GCS sub-entry to the grid. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-07 `PostureSelect`/`LimbSelect` (the plain-select pattern); vit-01 categorical registry (allowed value sets); vit-03/04 storage + form-state for json fields; numeric GCS total.
- ❌ **What's missing:** the categorical selects in the grid; the GCS E/V/M → total auto-sum.

**Scope Guard:**
- Expected files touched: ≤ 4 (categorical select components + grid wiring + GCS sub-entry + tests). **No** new storage (vit-03), **no** hide/unhide (VP3), **no** trends (VP4 handles categorical timeline).
- Categorical values stored canonically (the enum value), not the display label.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Categorical selects
- [x] ✅ 1.1 Render O₂ delivery method, glucose timing, pupil reactivity L/R, AVPU, pulse rhythm, temp site as selects from the vit-01 categorical registry (allowed value sets), in their group, reusing the obj-07 select pattern. - **Completed: 2026-06-21**
- [x] ✅ 1.2 Each is optional (`—` empty default); stores the enum value via form-state (vit-04); no display-label leakage into payload. - **Completed: 2026-06-21**

### 2. GCS E/V/M auto-sum
- [x] ✅ 2.1 Optional E/V/M sub-fields that **auto-sum into `gcs_total`** when entered; entering total directly is still valid (sub-fields blank); never produce an out-of-range total. - **Completed: 2026-06-21**
- [x] ✅ 2.2 Make the relationship legible (sub-fields grouped under GCS) without forcing E/V/M entry. - **Completed: 2026-06-21**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: selects render allowed values, store enum (not label); E/V/M sums to total; total-only path still works; absent fields degrade cleanly. - **Completed: 2026-06-21**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: VitalsGrid.tsx / VitalsExtended.tsx (categorical selects in-group)
CREATE: a categorical select + GCS-sub-entry component(s) + tests
DO NOT TOUCH: storage/validation (vit-03); hide/unhide (VP3); trends (VP4)
```

**When updating existing code:**
- [x] Reuse the obj-07 posture/limb select pattern; do not invent a new select.
- [x] Store enum values canonically; GCS total stays the single canonical neuro score.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Categorical = allowed value set from the registry** — store enum, not label.
- **GCS total is canonical** — E/V/M auto-sum, never a competing source of truth.
- **Optional + degradable** — absent categoricals never block or error.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No schema** — render + form-state over vit-03's `vitals_json`.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — client render over the frozen contract.

---

## ✅ Acceptance & Verification Criteria

- [x] Categorical/context vitals render as registry-driven selects storing enum values.
- [x] GCS E/V/M auto-sums to canonical total; total-only path preserved.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Context fields are what make vitals interpretable — "94% SpO₂ on 4 L" vs "on room air", "120 mg/dL fasting" vs "random". Cheap to add now that storage + registry exist; high clinical signal.

---

## 🔗 Related Tasks

- [`task-vit-05-grouped-vitals-grid.md`](./task-vit-05-grouped-vitals-grid.md) — the numeric grid these sit beside.
- [`task-vit-12-vital-trends-overview.md`](./task-vit-12-vital-trends-overview.md) — renders categorical history as a value-timeline.

---

**Last Updated:** 2026-06-21  
**Pattern:** obj-07 plain-select pattern extended to the full categorical catalog; GCS auto-sum.  
**Reference:** `process/CODE_CHANGE_RULES.md`
