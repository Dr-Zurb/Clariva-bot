# Task obj-13: custom objective sections (per-doctor default + derived text)

> **Filename:** `task-obj-13-custom-objective-sections.md` in `objective-tab/p3-layout-engines/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Let a doctor add their own **custom objective sections** (free-text blocks for specialty/long-tail
exam content the typed cards don't cover — gynae P/V·P/S, ortho ROM, derm lesion notes, MSE, …),
reusing the shipped subjective custom-subsection engine over obj-10's
`objective_custom_sections` per-doctor default and the `custom_block:<uuid>` registry slot from
obj-09. On save the custom content **derives** into `examination_findings` (or `test_results`)
text per OBJ-D2 — so the PDF/SMS/snapshot keep reading what they read today.

**Program / Phase:** objective-tab · Phase 3 (layout engines)  
**Batch:** [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./EXECUTION-ORDER-p3-objective-tab-layout-engines.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-19

**Change Type:**
- [x] **New feature** — custom objective free-text sections + per-doctor default + derived-text mapping.

**Current State:** (check existing code first!)
- ✅ **What exists:** subjective `custom-subsections.ts` + `CustomSubsectionsField.tsx` (custom-block engine: add/edit/remove, per-doctor default `subjective_custom_subsections`, stable `custom_block:<uuid>` identity, derived text); obj-09's `custom_block:<uuid>` registry slot; obj-10's `objective_custom_sections` column; P1's `buildRxPayload` exam-derivation path.
- ❌ **What's missing:** any objective custom-section UI, persistence wiring, or derived-text mapping.

**Scope Guard:**
- Expected files touched: ≤ 6 (custom-objective lib or generalised reuse + field component + `ObjectiveSection`/`buildRxPayload` wiring + tests).
- **No** custom-section *templates* (P4 `custom_block` scope), **no** seed (obj-14). Doctor-default + per-visit instances + derived text only.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Custom objective section engine
- [x] ✅ 1.1 Reuse/generalise the subjective custom-subsection engine for objective: add/edit/remove a titled free-text block; stable `custom_block:<uuid>` identity; renders in the obj-09 registry at its ordered slot. - **Completed: 2026-06-19** (`custom-objective-sections.ts` re-uses `custom-subsections.ts`; `CustomObjectiveSectionsField.tsx`; renders at the chrome slot after `test_results`).
- [x] ✅ 1.2 Per-doctor **default** set of custom sections persisted to `objective_custom_sections` (clone the subjective doctor-default); per-visit instances hydrate from it. - **Completed: 2026-06-19** (structure-key debounced autosave in the chrome; seeded in `useRxFormProviderSetup`).
- [x] ✅ 1.3 Add-custom action wires from obj-12's "Manage sections" menu + an in-page footer. - **Completed: 2026-06-19** (menu `onAddCustomSection` + `ObjectiveCustomSectionsChrome` empty/footer).

### 2. Derived-text mapping (OBJ-D2)
- [x] ✅ 2.1 On save, custom-section content derives into `examination_findings` via `buildRxPayload`, legacy rows unchanged. - **Completed: 2026-06-19** (decision: all custom blocks derive into `examination_findings`; `test_results` routing deferred — no per-block flag in v1).
- [x] ✅ 2.2 Empty custom sections contribute nothing (no stray delimiters); deterministic ordering single-sourced from the registry. - **Completed: 2026-06-19** (empty blocks serialise to `""` and are filtered before the `\n\n` join).

### 3. Verification & Testing
- [x] ✅ 3.1 Add/edit/remove a custom section; per-doctor default persists + re-applies next visit. - **Completed: 2026-06-19**
- [x] ✅ 3.2 Custom content appears in derived `examination_findings`; legacy/empty rows byte-identical (deeper parity in obj-15). - **Completed: 2026-06-19**
- [x] ✅ 3.3 `custom_block:*` ids are excluded from the hidden set (P10-D4) and from autosaved order (only the static projection persists). - **Completed: 2026-06-19**
- [x] ✅ 3.4 `tsc` clean on touched files; targeted vitest green (66 objective + derivation tests); eslint clean. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/custom-objective-sections.ts   (or generalise custom-subsections.ts)
CREATE: frontend/components/cockpit/rx/objective/CustomObjectiveSectionsField.tsx
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (buildRxPayload derivation)
CREATE: frontend/components/cockpit/rx/objective/__tests__/CustomObjectiveSectionsField.test.tsx
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse, do not fork** the subjective custom-subsection engine (P3-D6 / §J.5) — same identity, persistence, and a11y.
- **Derived-text contract (OBJ-D2)** — custom content reaches the PDF/SMS/snapshot only through the derived `examination_findings`/`test_results`; never a new patient-facing column. Legacy rows byte-identical.
- `custom_block:<uuid>` ids re-mint per visit — never written to the hidden set (P10-D4).
- No template/scope work (P4) — this is the doctor-default + per-visit instance layer only.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Y** — custom-section content derives into the existing PHI `examination_findings` (no new column); per-doctor default config is non-PHI.
- [x] **Any PHI in logs?** **No**.
- [x] **External API or AI call?** **N**.
- [x] **Retention / deletion impact?** **N** (rides existing prescription + `doctor_settings` lifecycle).

---

## ✅ Acceptance & Verification Criteria

- [x] Add/edit/remove custom objective sections; per-doctor default persists.
- [x] Custom content derives into `examination_findings`; legacy/empty rows byte-identical.
- [x] `custom_block:*` excluded from hidden set + autosaved order; deterministic ordering.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-12-visibility-and-manage-sections-menu.md`](./task-obj-12-visibility-and-manage-sections-menu.md) — the add-custom entry point.
- [`task-obj-15-layout-close-gate.md`](./task-obj-15-layout-close-gate.md) — proves derived-text byte-parity.

---

**Last Updated:** 2026-06-18  
**Pattern:** subjective P7/P11 custom-subsection engine (`custom-subsections.ts` + `CustomSubsectionsField.tsx`).  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
