# Task vit-14: Doctor-authored custom vitals (registry-agnostic, json-backed)

> **Filename:** `task-vit-14-custom-vitals.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Let a doctor define their **own** vital (e.g. "Abdominal girth", "CVP", "Peak flow — personal best")
when the shipped registry (vit-01) doesn't carry it. A **"+ Add custom vital"** action in the unified
`ManageVitalsMenu` opens a small inline form (label, optional unit, numeric vs free-text). The definition
persists as a **per-doctor default** (`doctor_settings.vitals_custom`, mirroring `objective_custom_sections`),
the custom vital then appears in the menu catalog + the grid like any other vital, and its **value** rides
in the existing `prescriptions.vitals_json` JSONB under a namespaced key — **no new value column**.

**Program / Phase:** vitals-section · VP3+ (catalog extensibility)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~1.5–2 days (cross-layer)  
**Status:** ✅ **Done** (2026-06-24) — migration 157 + backend transport (cloned `objective_custom_sections`, since `vitals_hidden` transport was found incomplete → captured to inbox) + frontend lib/catalog/json-derive/UI. Decisions locked: both numeric+text, per-doctor default, retain-on-remove. Values ride in `vitals_json.vitalsCustom` (self-describing entries). Gate green: backend 76 tests, frontend 114 tests, touched files lint+typecheck clean.

**Change Type:**
- [ ] **Cross-layer feature** — migration + backend type/validation + frontend storage/UI. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** unified `ManageVitalsMenu` (search + show/hide, vit-08); the shared `vitals-menu-catalog.ts`; `objective_custom_sections` as the per-doctor custom-structure precedent (migration 152 / `custom-objective-sections.ts`); `prescriptions.vitals_json` + the additive derive path (`vitals-json.ts`, migration 156); `doctor_settings` transport (vit-07).
- ❌ **What's missing:** any concept of a doctor-defined vital; `doctor_settings.vitals_custom`; a custom-vital add form; custom-vital rendering in the grid; custom-vital lines in `deriveVitalsText`.

**Scope Guard:**
- Expected files touched: ~6–8 across layers (migration + `doctor-settings` type/Zod + a `vitals-custom.ts` lib + `vitals-menu-catalog.ts` + `ManageVitalsMenu`/grid + `RxFormContext` json wiring + `vitals-json.ts` derive + tests).
- **No** edit to the shipped numeric/categorical registries (vit-01) — custom vitals are additive, never mutate the built-in catalog.
- **No** trends/sparklines for custom vitals in v1 (defer); value capture + derive only.
- Reuse the `objective_custom_sections` autosave + structure-key pattern — do **not** invent a new persistence paradigm.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Storage model (per-doctor definition)
- [ ] 1.1 Migration: add `doctor_settings.vitals_custom` (JSONB, default `[]`) — a list of `{ id, label, unit?, kind: "numeric" | "text", group }` definition objects. Mirror migration 152/156 shape + the `vitals_hidden` comment style. Definition strings only (not PHI).
- [ ] 1.2 Backend `doctor-settings` type + Zod: validate `vitals_custom` (id slug, label max-len, unit max-len, `kind` enum, `group` ∈ registry groups, max count). Validate in the controller before the service (agent contract).

### 2. Value storage (per-visit, json-backed)
- [ ] 2.1 Custom values persist in `prescriptions.vitals_json` under a namespaced key (e.g. `custom:<id>`) — **no new column**. Numeric stays canonical; text trimmed.
- [ ] 2.2 `deriveVitalsText` (`vitals-json.ts`) appends custom-vital lines **additively** — empty/all-blank still derives to `""` (V3-D5 byte-parity holds for rows without custom vitals).

### 3. Frontend definition + catalog
- [ ] 3.1 A `vitals-custom.ts` lib: the `CustomVitalDef` type, autosave-to-default (clone `custom-objective-sections.ts`), and a structure key for the debounce guard.
- [ ] 3.2 `vitals-menu-catalog.ts` merges custom defs into the catalog (after built-ins, in their chosen group) so they list + search + show/hide like any vital.

### 4. UI — add form + grid render
- [ ] 4.1 A **"+ Add custom vital"** footer action in `ManageVitalsMenu` opens an inline form (label, optional unit, numeric/text); on save it appends to `vitals_custom` (autosave) and the vital appears in the catalog.
- [ ] 4.2 The grid renders custom vitals (numeric → number input + unit; text → short text input) in their group; respects the vit-07/08 hidden set.
- [ ] 4.3 Custom vitals are **removable** from the definition (with the same value-retention courtesy as hide-with-data, or an explicit delete-definition confirm).

### 5. Verification & Testing
- [ ] 5.1 Migration test (up/down, default `[]`); backend Zod accept/reject cases.
- [ ] 5.2 Round-trip: define → enter value → `buildRxPayload` carries it under `vitals_json`; reload re-hydrates; derive appends a line; a row with **no** custom vitals stays byte-identical (V3-D5).
- [ ] 5.3 `frontend tsc`/lint + `backend test` green for the slice.

**Note:** mark items `- [ ] N.N …` → `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/157_doctor_vitals_custom.sql (+ migration test)
CREATE: frontend/lib/cockpit/vitals-custom.ts (+ test)
CREATE: a custom-vital add-form component (+ test)
UPDATE: backend doctor-settings type + Zod + controller validation
UPDATE: frontend vitals-menu-catalog.ts (merge custom defs)
UPDATE: ManageVitalsMenu.tsx (+ "+ Add custom vital"), VitalsGrid render
UPDATE: RxFormContext.tsx (custom values in/out of vitals_json), vitals-json.ts (derive)
DO NOT TOUCH: shipped vit-01 registries; visibility transport semantics (vit-07); buildRxPayload byte-contract for non-custom rows
```

**When updating existing code:**
- [ ] Clone the `objective_custom_sections` persistence + autosave pattern; do not fork a new paradigm.
- [ ] Keep custom values inside `vitals_json` — never add a dedicated column.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Additive only** — a row without custom vitals derives byte-identically to today (V3-D5).
- **Definition vs value split** — definition is a per-doctor default (`doctor_settings`); value is per-visit (`vitals_json`).
- **No PHI in the definition** — labels/units/structure only; never log values.
- **v1 excludes trends** — value capture + derive; sparklines deferred.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — new `doctor_settings.vitals_custom` column (migration) + writes custom values into `prescriptions.vitals_json`.
- [ ] **Any PHI in logs?** **No** — definitions only; values never logged.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** Removing a definition must not silently destroy stored values — confirm/retain policy (4.3).

> 🛑 **STOP / Opus gate — REQUIRED.** New migration + a PHI-adjacent `vitals_json` write path + a 5+ file cross-layer change. Per `00-agent-contract.mdc`, this must be implemented by Opus, not Auto.

---

## ✅ Acceptance & Verification Criteria

- [ ] A doctor can define, edit, and remove a custom vital; it lists/searches/shows/hides in `ManageVitalsMenu` and renders in the grid.
- [ ] Values persist via `vitals_json`, re-hydrate on reload, and append a derived line; non-custom rows stay byte-identical.
- [ ] Migration + backend Zod tested; `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes / Open decisions

1. **Kind:** numeric-with-unit only, or also free-text? (Plan assumes both.)
2. **Scope:** per-doctor default that seeds every visit (like objective sections) vs per-visit only. (Plan assumes per-doctor default.)
3. **Trends:** custom numerics into the trend series later (vit-15?) — out of scope here.
4. **Namespacing:** `custom:<id>` key convention inside `vitals_json` keeps it clearly separable from shipped registry keys.

---

## 🔗 Related Tasks

- [`task-vit-08-manage-vitals-menu.md`](./task-vit-08-manage-vitals-menu.md) — the unified menu the add action lives in.
- [`task-vit-03-vitals-json-contract-and-derived-text.md`](./task-vit-03-vitals-json-contract-and-derived-text.md) — the json + derive contract custom values extend.

---

**Last Updated:** 2026-06-24  
**Pattern:** clone of `objective_custom_sections` (per-doctor custom structure) + `vitals_json` value storage.  
**Reference:** `process/CODE_CHANGE_RULES.md`
