# Task obj-11: reorder (DnD + keyboard) + collapse-memory engines wired + persist/seed

> **Filename:** `task-obj-11-reorder-and-collapse-engines.md` in `objective-tab/p3-layout-engines/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Wire the **reorder** and **collapse-memory** engines over obj-09's objective registry, reusing
the shipped subjective primitives: a left-edge six-dot grip + keyboard ArrowUp/ArrowDown to
reorder section blocks, and a remembered per-section collapse/expand state. Both persist as
per-doctor defaults via obj-10's `objective_section_order` / `objective_section_collapsed`
columns, using the proven **one-shot hydration + debounced delta-autosave** discipline; load
merges with the live registry (P3-D4).

**Program / Phase:** objective-tab · Phase 3 (layout engines)  
**Batch:** [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./EXECUTION-ORDER-p3-objective-tab-layout-engines.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE** — 2026-06-19

**Change Type:**
- [x] **New feature** — reorder + collapse interaction over the registry; per-doctor persistence; no output change.

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-09 registry + ordered renderer with a `leadingActions` slot; subjective `section-reorder-context.tsx` (`SortableSectionShell`, grip + drop-intent + keyboard reorder) and `subjective-section-collapse.ts` (resolver + delta serialiser + `saveSubjectiveSectionCollapsed`); the `hasHydratedRef` one-shot-hydration guard in `SubjectiveSection`.
- ❌ **What's missing:** any objective reorder chrome, collapse persistence, or autosave.

**Scope Guard:**
- Expected files touched: ≤ 6 (objective reorder/collapse libs or shared-generic reuse + `ObjectiveSection` wiring + tests).
- **No** hidden set / menu (obj-12), **no** custom sections (obj-13), **no** seed (obj-14). Reorder + collapse only.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Reorder engine
- [x] ✅ 1.1 Render the grip on each section header via `CollapsibleContainer.leadingActions` (`ObjectiveSortableSectionShell` + `ObjectiveSectionDragHandle`, mirroring the subjective shell + drop-intent helpers — no new DnD lib). - **Completed: 2026-06-19**
- [x] ✅ 1.2 Keyboard ArrowUp/ArrowDown on the focused grip moves the section; before/after drop indicator mirrors the subjective affordance. - **Completed: 2026-06-19**
- [x] ✅ 1.3 Local order state over the registry; debounced autosave persists to `objective_section_order`. - **Completed: 2026-06-19**

### 2. Collapse-memory engine
- [x] ✅ 2.1 Controlled collapse per section block via `CollapsibleContainer`; map keyed by section id → open bool. - **Completed: 2026-06-19**
- [x] ✅ 2.2 Default collapse policy: `vitals`/`exam`/`test_results` open; legacy blocks collapsed (preserves today's visible content). - **Completed: 2026-06-19**
- [x] ✅ 2.3 Persist the collapse delta (only sections toggled away from default) to `objective_section_collapsed`. - **Completed: 2026-06-19**

### 3. Persist / hydrate / merge
- [x] ✅ 3.1 One-shot hydration (`hasHydratedCollapseRef` guard) of order + collapse from the per-doctor default on mount; no stale-echo clobber. - **Completed: 2026-06-19**
- [x] ✅ 3.2 Debounced delta-autosave (one PATCH per settle) — cloned from `saveSubjectiveSectionCollapsed`/order save. - **Completed: 2026-06-19**
- [x] ✅ 3.3 Load merges with the live registry via `resolveInitialSectionOrder`: unknown ids dropped, missing-available appended at canonical slot. - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 Reorder persists; keyboard reorder works (covered in `ObjectiveSection.reorder-collapse.test.tsx`). - **Completed: 2026-06-19**
- [x] ✅ 4.2 Collapse state persists + hydrates; default policy correct. - **Completed: 2026-06-19**
- [x] ✅ 4.3 Merge test (stale/unknown/duplicate id) — no section lost by a bad stored order. - **Completed: 2026-06-19**
- [x] ✅ 4.4 `tsc` clean on touched files; targeted vitest green (24 passed); eslint clean. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/objective-section-collapse.ts          (resolver + delta serialiser + fetch/save)
UPDATE: frontend/lib/cockpit/objective-section-order.ts             (drag/move/reorder helpers + order fetch/save)
CREATE: frontend/components/cockpit/rx/objective/ObjectiveSortableSectionShell.tsx  (grip + drop-target wrapper)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (collapsible cards + reorder + hydrate/autosave)
CREATE: frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.reorder-collapse.test.tsx
UPDATE: frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.test.tsx        (legacy details → CollapsibleContainer)
UPDATE: frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.order.test.tsx  (settings-fetch mock + renamed legacy-vitals title)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse the shipped engines** (P3-D6) — grips, drop-intent, keyboard reorder, one-shot hydration, delta autosave. No new DnD library, no second debounce.
- **View-only** (P3-D3) — neither order nor collapse reaches `buildRxPayload`.
- **Graceful merge, never hide** (P3-D4) — a stale stored order must never drop a live section.
- Preview/`disabled` mode is read-only — no autosave when the form is not editable.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Y (config only)** — writes `doctor_settings` objective order/collapse (non-PHI).
- [ ] **Any PHI in logs?** **No**.
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] Grip + keyboard reorder works; persists + re-applies next visit.
- [x] Collapse remembered per section; default policy correct; persists.
- [x] Merge tolerant of stale/unknown ids; no section lost.
- [x] No output change (view-only; order/collapse never reach `buildRxPayload`); preview mode read-only (grips hidden, no autosave when `disabled`).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-09-objective-section-registry-and-renderer.md`](./task-obj-09-objective-section-registry-and-renderer.md) — the registry these engines render over.
- [`task-obj-10-doctor-settings-objective-layout-columns.md`](./task-obj-10-doctor-settings-objective-layout-columns.md) — the order/collapse persistence.
- [`task-obj-12-visibility-and-manage-sections-menu.md`](./task-obj-12-visibility-and-manage-sections-menu.md) — consolidates reorder into the menu.

---

**Last Updated:** 2026-06-18  
**Pattern:** subjective P8 (`section-reorder-context.tsx`) + P9 (`subjective-section-collapse.ts`).  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
