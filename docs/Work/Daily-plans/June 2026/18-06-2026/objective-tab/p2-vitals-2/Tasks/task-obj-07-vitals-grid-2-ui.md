# Task obj-07: Vitals 2.0 grid UI — extended fields, unit toggles, range flags, derived badges, ghost values

> **Filename:** `task-obj-07-vitals-grid-2-ui.md` in `objective-tab/p2-vitals-2/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Build the Vitals 2.0 grid: extend `VitalsGrid` (or add a `VitalsExtended` subcomponent it hosts)
to render obj-05's new fields grouped sensibly (core vitals + extended; a peds group, possibly
collapsible), with per-field **unit toggles**, **out-of-range flags**, **derived MAP/BSA badges**,
and **last-visit ghost-value** placeholders. Built over obj-05's form state + obj-06's registry/
calculators, reusing the existing `NumericField`/`BmiBadge` patterns. The shipped 7 vitals + the
BMI badge + legacy `vitalsText` stay exactly as-is (P2-D6).

**Program / Phase:** objective-tab · Phase 2 (Vitals 2.0)  
**Batch:** [`plan-p2-objective-tab-vitals-2-batch.md`](../plan-p2-objective-tab-vitals-2-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-objective-tab-vitals-2.md`](./EXECUTION-ORDER-p2-objective-tab-vitals-2.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19

**Change Type:**
- [ ] **Update existing** — extend `VitalsGrid`; add one subcomponent. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `VitalsGrid.tsx` (BP/HR/temp/SpO₂/wt/ht + `NumericField` + `BmiBadge`, advisory `RANGES`); obj-05's new form state; obj-06's `vitals-schema.ts` + `vitals-derive.ts`; `getLastPrescriptionInEpisode` (ghost source); `ObjectiveSection.tsx` (hosts `VitalsGrid`).
- ❌ **What's missing:** UI for the extended vitals, unit toggles, range flags, MAP/BSA badges, and ghost values.

**Scope Guard:**
- Expected files touched: ≤ 4 (`VitalsGrid.tsx`, a new `VitalsExtended`/`UnitToggle` subcomponent, the ghost-value hookup, a component test).
- **No** storage/migration change (obj-05), **no** new registry/math (obj-06), **no** exam-card or layout-engine change, **no** persistence of unit preference (P3).

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · accessibility expectations in [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Extended-vitals fields
- [x] ✅ 1.1 RR, pain (0–10), glucose, GCS total, BP posture/limb, HC, MUAC, waist rendered via the registry (labels/steps/suffixes) through a shared `VitalField`. - **Completed: 2026-06-19**
- [x] ✅ 1.2 Group layout: shipped core grid kept; "Extended" group + collapsible peds group (HC/MUAC). All values write canonical via `setField`. - **Completed: 2026-06-19**
- [x] ✅ 1.3 Posture/limb render as labelled selects constrained to the allowed sets. - **Completed: 2026-06-19**

### 2. Unit toggles, flags, derived
- [x] ✅ 2.1 Per-field unit toggle for temp (°C/°F), weight (kg/lb), height + HC/MUAC/waist (cm/in), glucose (mg/dL↔mmol/L): display-only; stored value stays canonical (convert on input + render via obj-06). - **Completed: 2026-06-19**
- [x] ✅ 2.2 Out-of-range flag (icon + color-exception + `aria-label`) when `evaluateRange` ≠ normal, on core + extended fields. (Age/sex unavailable in `RxFormContext`, so adult/default bands apply.) - **Completed: 2026-06-19**
- [x] ✅ 2.3 Derived MAP badge next to BP, BSA badge next to weight (alongside the unchanged BMI badge). Computed only. - **Completed: 2026-06-19**

### 3. Last-visit ghost values
- [x] ✅ 3.1 `useLastVisitVitals` surfaces the episode's last-prescription vitals as read-only ghost placeholders/captions (P2-D5); never writes back into the form. - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 Component tests: extended fields render + write canonical; unit toggle flips display without changing stored value; range flag at out-of-range; MAP/BSA badges show; ghost renders read-only. - **Completed: 2026-06-19**
- [x] ✅ 4.2 a11y: inputs labelled; unit toggle is a labelled keyboard-operable `role="group"` of buttons with `aria-pressed`; flags have `aria-label`; peds group is a native `<details>`. - **Completed: 2026-06-19**
- [x] ✅ 4.3 Existing 7 vitals + BMI badge behaviour preserved (existing regression tests unchanged + green). - **Completed: 2026-06-19**
- [x] ✅ 4.4 `tsc` clean on touched files; targeted vitest green (20 pass); eslint clean. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/inputs/VitalsGrid.tsx (host extended group, derived badges, ghost)
CREATE: frontend/components/cockpit/rx/inputs/VitalsExtended.tsx (extended fields + unit toggles + flags)  [or co-locate in VitalsGrid if small]
CREATE/UPDATE: frontend component tests
```

**When updating existing code:** (MANDATORY)
- [ ] Confirm the shipped core grid + BMI badge behaviour is byte-for-byte preserved before adding the extended group.
- [ ] Map the change concretely; additive-only (P2-D6).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Unit conversion happens **only at the display edge** (P2-D2). `setField` always stores canonical; never persist a converted value.
- Ghost values are **read-only references** (P2-D5) — no auto-fill/carry-forward write.
- Reuse `vitals-derive.ts`/`vitals-schema.ts` (obj-06); do not re-implement conversion or flag logic in the component.
- Color usage for flags follows the existing BMI-badge color-exception note (`__color-exceptions.md`), not semantic tokens.
- Additive only: the shipped 7 vitals, BMI badge, and `vitalsText` stay.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** (UI over existing form state; storage is obj-05).
- [ ] **Any PHI in logs?** MUST be **No** (vitals are PHI; never log values).
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [ ] Extended vitals render and write canonical values; posture/limb constrained to allowed sets.
- [ ] Unit toggles change display only; stored value stays canonical (no drift).
- [ ] Range flags + MAP/BSA badges show correctly; BMI badge unchanged.
- [ ] Last-visit ghost values render read-only and never overwrite entry.
- [ ] a11y clean; existing 7 vitals unchanged; tests added; no PHI in logs.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-05-vitals-data-model-and-form-state.md`](./task-obj-05-vitals-data-model-and-form-state.md) — the form state this grid edits.
- [`task-obj-06-vitals-schema-and-derived-calculators.md`](./task-obj-06-vitals-schema-and-derived-calculators.md) — the registry/calculators this grid consumes.
- [`task-obj-08-vitals-close-gate.md`](./task-obj-08-vitals-close-gate.md) — proves the round-trip + a11y this grid implements.

---

**Last Updated:** 2026-06-18  
**Pattern:** Existing `VitalsGrid`/`NumericField`/`BmiBadge`; P1 `ExamSystemCard` interaction discipline.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
