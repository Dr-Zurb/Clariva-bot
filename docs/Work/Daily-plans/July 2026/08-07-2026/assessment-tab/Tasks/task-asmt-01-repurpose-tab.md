# Task asmt-01: Repurpose the Assessment tab (full editor in the tab, strip stays glance)

> **Filename:** `task-asmt-01-repurpose-tab.md` in `assessment-tab/Tasks/`.
> **Links:** batch plan [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-assessment-tab.md`](./EXECUTION-ORDER-assessment-tab.md). Code paths **repo-relative**.

---

## 📋 Task Overview

The `assessment` tab is redundant: in the v3 flat-tab registry it renders nothing but `<AssessmentStrip>` (the same Working-Dx + DDx glance bar), while the Plan pane still mounts `<AssessmentSection dxLifted>`, which renders only a passive *pointer* ("Working Dx is in the strip above…"). This task makes the **tab the canonical Assessment editor** and keeps the strip as the docked at-a-glance — with **no migration and no data change**.

1. **Tab renders the full editor.** Change the `assessment` tab `render` in `cockpit-tabs.tsx` to mount the full `<AssessmentSection>` editor (Dx input + `DdxChipList`) instead of the bare strip.
2. **Strip stays glance.** `AssessmentStrip` keeps `id="diagnosis"` (glance input + the ribbon 🎯 focus target). Where the shell docks it, it remains a read-first glance surface — not removed.
3. **Resolve the duplicate Dx id.** Two inputs bound to `provisionalDiagnosis` must not both use `id="diagnosis"`. The **strip keeps `id="diagnosis"`**; the tab editor's Dx input uses a distinct anchor (e.g. under the existing `#rx-diagnosis` section) so there is no duplicate DOM id.
4. **Remove the dead pointer.** Delete the `dxLifted` *summary/pointer* branch in `AssessmentSection` (the "Working Dx is in the strip above" copy). The Plan pane keeps hiding its own Dx block (Plan still passes the hide flag), but the copy that points at the strip is gone because the tab now owns editing.
5. **Leave room for later blocks.** The editor keeps its current fields (Dx + DDx); the impression/acuity (asmt-02), structured Dx (asmt-03) and problem-linkage (asmt-04) blocks slot in later.

No migration; no change to `provisional_diagnosis` / `differential_diagnosis`; no payload change.

**Program / Batch:** assessment-tab · Wave 1
**Plan:** [`../plan-assessment-tab-batch.md`](../plan-assessment-tab-batch.md)
**Estimated Time:** ~3–4 hours
**Status:** Draft — not implemented. **Model: Sonnet** — tab-registry + component wiring across single-layer files; no migration/PHI/RLS → no escalation.

**Change Type:**
- [ ] ✅ **Update existing** — re-point the tab body; remove a dead branch; no new columns. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `assessment` tab in `frontend/lib/patient-profile/v3/cockpit-tabs.tsx` (≈ L221–230) renders `<AssessmentStrip>`; `AssessmentSection.tsx` has a live editor branch (Dx `input#diagnosis` + `<DdxChipList/>`) **and** a `dxLifted` pointer branch (L30–48); `AssessmentStrip.tsx` owns `id="diagnosis"` + DDx; `PatientRibbon.tsx` 🎯 segment focuses `document.getElementById("diagnosis")`.
- ⚠️ **Watch:** the non-lifted `AssessmentSection` editor input also uses `id="diagnosis"` (L60). If both the strip and the tab editor render, that is a **duplicate DOM id** — the tab editor MUST switch to a distinct id/anchor while the strip retains `id="diagnosis"` (ribbon contract). Confirm whether the strip is still docked in the live shell or only rendered as this tab; keep the ribbon target valid either way.

**Scope Guard:**
- Expected files touched: `cockpit-tabs.tsx`, `AssessmentSection.tsx`, and the assessment/tab test files. `AssessmentStrip.tsx` only if the glance role needs a comment/aria tweak.
- **DO NOT** add a migration or change `provisional_diagnosis` / `differential_diagnosis` shape (that is asmt-02/03). **DO NOT** remove the strip. **DO NOT** change the ribbon 🎯 focus contract (`id="diagnosis"`). **DO NOT** touch the Plan pane's decision to hide its own Dx.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Tab body
- [ ] 1.1 Re-point the `assessment` tab `render` in `cockpit-tabs.tsx` to the full `<AssessmentSection>` editor (not the strip). Keep `PANE_ICONS.assessment`, title, order; revisit `naturalSizePct`/`minSizePx` so a full editor has room (the current `8` / `60` sizes a 60px strip).
- [ ] 1.2 Confirm the tab body still mounts inside the existing `RxFormProvider` context (no new provider) so Dx/DDx state is shared with the strip.

### 2. Editor / glance de-dupe
- [ ] 2.1 Give the tab editor's Dx input a **distinct** id/anchor; the strip keeps `id="diagnosis"`. Verify no duplicate `id="diagnosis"` exists when both render.
- [ ] 2.2 Confirm the ribbon 🎯 (`PatientRibbon.tsx`) still focuses the strip's Dx (`id="diagnosis"`) — unchanged.

### 3. Remove the dead pointer
- [ ] 3.1 Delete the `dxLifted` pointer/summary branch in `AssessmentSection.tsx` (the "Working Dx is in the strip above" copy). Decide the fate of the `dxLifted` prop: keep it as a "hide my Dx block" flag for the Plan pane, or rename for clarity — document the choice.
- [ ] 3.2 Confirm the Plan pane (`RxPane` `dxLifted`) still hides its own Dx block; Plan does not gain a second Dx editor.

### 4. Tests
- [ ] 4.1 Update `cockpit-tabs` test(s) that assert the assessment tab renders the strip → now renders the editor.
- [ ] 4.2 Update `AssessmentSection.test.tsx` — drop assertions on the removed pointer copy; add the "tab editor uses a non-`diagnosis` id" assertion.
- [ ] 4.3 `AssessmentStrip.test.tsx` unchanged in behavior (glance still owns `id="diagnosis"`).

### 5. Verification gate
- [ ] 5.1 `cd frontend && npx tsc --noEmit` — no new errors in touched files.
- [ ] 5.2 `cd frontend && npm run lint` clean on touched files.
- [ ] 5.3 `cd frontend && npm test` green for the assessment / cockpit-tabs / ribbon slices.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/patient-profile/v3/cockpit-tabs.tsx            (assessment tab render → full editor; resize)
UPDATE: frontend/components/cockpit/rx/sections/AssessmentSection.tsx (remove dxLifted pointer; distinct tab-editor anchor)
UPDATE: frontend/components/cockpit/middle/AssessmentStrip.tsx      (glance role only, if a comment/aria tweak is needed)
UPDATE: frontend/lib/patient-profile/v3/__tests__/cockpit-tabs.test.tsx (assessment tab now renders editor)
UPDATE: frontend/components/cockpit/rx/sections/__tests__/AssessmentSection.test.tsx (drop pointer assertions)
DO NOT TOUCH: provisional_diagnosis / differential_diagnosis shape; migrations; ribbon 🎯 id contract
```

**When updating existing code:** (MANDATORY)
- [ ] The ribbon 🎯 still focuses the Working Dx (`id="diagnosis"` on the strip).
- [ ] No duplicate `id="diagnosis"` in the DOM when strip + tab both render.
- [ ] Plan still hides its own Dx; no second Dx editor appears in Plan.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Tab = editor, strip = glance (ASMT-D1).** UI/registry only; no schema.
- **One shared state (ASMT-D2).** Strip + tab read/write the same `RxFormContext` fields; strip keeps `id="diagnosis"`.
- **No data change.** `provisional_diagnosis` / `differential_diagnosis` untouched; no payload change.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** **N** — presentational/registry only; no schema, no field change.
- [ ] ✅ **Any PHI in logs?** **No.**
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] The `assessment` tab renders the full Assessment editor (Dx + DDx), not the bare strip.
- [ ] The strip remains a glance surface and still owns `id="diagnosis"`; the ribbon 🎯 still focuses it; no duplicate DOM id.
- [ ] The dead `dxLifted` pointer copy is gone; Plan still hides its own Dx.
- [ ] `tsc` + lint + assessment/tab slice tests green; no data or payload change.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Enables [`task-asmt-02-impression-and-acuity.md`](./task-asmt-02-impression-and-acuity.md), [`task-asmt-03-structured-diagnoses.md`](./task-asmt-03-structured-diagnoses.md) (they add blocks into the tab editor this task establishes).

---

**Last Updated:** 2026-07-09
**Pattern:** re-point a redundant tab at the real editor; keep the strip as glance; remove the dead pointer — no schema, no data.
