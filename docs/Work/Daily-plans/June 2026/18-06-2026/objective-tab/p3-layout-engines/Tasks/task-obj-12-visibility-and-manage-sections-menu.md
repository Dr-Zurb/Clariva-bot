# Task obj-12: hide/unhide visibility delta + "Manage sections" menu

> **Filename:** `task-obj-12-visibility-and-manage-sections-menu.md` in `objective-tab/p3-layout-engines/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add the third layout axis — **visibility**: let a doctor hide objective sections they never use
so they stop rendering, persisted as a per-doctor `objective_section_hidden` **delta set** (only
hidden ids stored; absent ⇒ visible), and consolidate hide/unhide + add-custom + reorder into
one **"Manage sections" menu** anchored top-right of the Objective section. Hiding is view-only:
a hidden section's data still flows byte-identically to the Rx/PDF (P3-D3). Clones subjective
P10.

**Program / Phase:** objective-tab · Phase 3 (layout engines)  
**Batch:** [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./EXECUTION-ORDER-p3-objective-tab-layout-engines.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE** — 2026-06-19

**Change Type:**
- [x] **New feature** — hidden delta set + "Manage sections" menu; no output change.

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-09 registry + obj-11 reorder/collapse; subjective P10 — `subjective_section_hidden` delta resolver, the "Manage sections" menu (hide/unhide + add-custom + reorder, always-reachable trigger, hidden-count, all-hidden empty-state), one-shot hydration + delta autosave.
- ❌ **What's missing:** any objective hidden set, resolver wiring, or menu.

**Scope Guard:**
- Expected files touched: ≤ 5 (visibility resolver lib + "Manage sections" menu component + `ObjectiveSection` wiring + tests).
- **No** custom-section *creation* engine (obj-13 — the menu's add-custom action wires to it once it lands), **no** seed (obj-14). Hidden delta + menu shell only.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Hidden delta resolver
- [x] ✅ 1.1 `resolveVisibleSections(order, hiddenIds, mountableIds)` filters hidden ids from the render plan for currently-mountable sections only; absent id ⇒ visible. - **Completed: 2026-06-19**
- [x] ✅ 1.2 `hiddenOverridesToPersist(...)` keeps only known static ids, dedupes, and drops unknown / `custom_block:*` ids before save (custom blocks removed by deletion, not hidden). - **Completed: 2026-06-19**
- [x] ✅ 1.3 Static `ObjectiveSectionId`s only in the hidden set. - **Completed: 2026-06-19**

### 2. "Manage sections" menu
- [x] ✅ 2.1 Top-right popover (`ManageObjectiveSectionsMenu`) listing mountable sections with hide/unhide toggles + reorder (up/down); add-custom action is an optional prop wired by obj-13. - **Completed: 2026-06-19**
- [x] ✅ 2.2 Trigger **always** rendered + reachable (incl. preview/`disabled`, read-only); shows a hidden-count affordance ("Sections · N hidden"). - **Completed: 2026-06-19**
- [x] ✅ 2.3 All-hidden empty-state in the section body pointing back at the menu — never a blank tab. - **Completed: 2026-06-19**

### 3. Persist / hydrate
- [x] ✅ 3.1 One-shot hydration (`hasHydratedHiddenRef`) of the hidden set; debounce-autosave **only** the hidden delta, excluding unknown/`custom_block:*`. - **Completed: 2026-06-19**
- [ ] 3.2 Optional "Reset to default layout" — deferred (fast-follow; not required for this task).

### 4. Verification & Testing
- [x] ✅ 4.1 Hide/unhide persists (delta autosave) + hydrates from shell on reopen. - **Completed: 2026-06-19**
- [x] ✅ 4.2 Hidden section **with data still appears in `buildRxPayload`** (view-only parity test; structural guard that the payload source never references `objective_section_hidden`). - **Completed: 2026-06-19**
- [x] ✅ 4.3 Menu accessible — trigger `aria-label`, toggle `aria-pressed`, move buttons labelled; trigger reachable in read-only. - **Completed: 2026-06-19**
- [x] ✅ 4.4 `tsc` clean on touched files; targeted vitest green (42 passed); eslint clean. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/objective-section-visibility.ts                       (resolver + delta persist + fetch/save)
CREATE: frontend/components/cockpit/rx/objective/ManageObjectiveSectionsMenu.tsx    (hide/unhide + reorder + count + has-data hint)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx                (hidden set + menu + all-hidden empty state + autosave)
CREATE: frontend/components/cockpit/rx/objective/__tests__/ManageObjectiveSectionsMenu.test.tsx  (hide/persist/hydrate/empty/a11y via ObjectiveSection)
CREATE: frontend/lib/cockpit/__tests__/objective-section-visibility.test.ts         (resolver unit + view-only buildRxPayload parity)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Delta set, not snapshot** (P3-D4) — store only hidden ids; absence ⇒ visible; new sections default visible without back-fill.
- **No locks; menu always reachable** (P10-D7) — any section (incl. the structured exam) is hideable, so the trigger + an all-hidden empty-state must always exist.
- **View-only** (P3-D3) — the hidden set never reaches `buildRxPayload`; a hidden section with data still prints.
- Reuse the subjective hydration/autosave shape — no second debounce mechanism.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Y (config only)** — writes `objective_section_hidden` (non-PHI).
- [ ] **Any PHI in logs?** **No**.
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] Hide/unhide via the menu; hidden is a static-id delta; persists per doctor.
- [x] Trigger always reachable; hidden-count shown; all-hidden empty-state renders.
- [x] Hidden section with data still flows to the Rx (view-only).
- [x] Menu is keyboard + screen-reader accessible.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-11-reorder-and-collapse-engines.md`](./task-obj-11-reorder-and-collapse-engines.md) — reorder consolidated into the menu.
- [`task-obj-13-custom-objective-sections.md`](./task-obj-13-custom-objective-sections.md) — the menu's add-custom action.
- [`task-obj-14-modality-specialty-default-visibility.md`](./task-obj-14-modality-specialty-default-visibility.md) — seeds the default hidden set this resolver consumes.

---

**Last Updated:** 2026-06-18  
**Pattern:** subjective P10 (`subjective_section_hidden` resolver + "Manage sections" menu).  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
