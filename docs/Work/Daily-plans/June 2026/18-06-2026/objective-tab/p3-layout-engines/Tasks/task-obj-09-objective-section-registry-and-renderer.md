# Task obj-09: objective section registry + ordered renderer (parity refactor)

> **Filename:** `task-obj-09-objective-section-registry-and-renderer.md` in `objective-tab/p3-layout-engines/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Refactor `ObjectiveSection` so its top-level section blocks render from an **ordered objective
section registry** instead of hardcoded JSX — the exact substrate the reorder / collapse /
hide / custom engines (obj-11..14) render through. This is the keystone parity refactor: with
no doctor override and no modality/specialty seed, the rendered order must be **byte-identical**
to today's layout. Clones the shipped subjective `subjective-section-order.ts` registry +
ordered-renderer pattern; no persistence, no DnD, no schema in this task.

**Program / Phase:** objective-tab · Phase 3 (layout engines)  
**Batch:** [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./EXECUTION-ORDER-p3-objective-tab-layout-engines.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE**

**Change Type:**
- [x] **Refactor (parity-preserving)** — extract a registry + ordered renderer; no behaviour change to the default layout, no output change.

**Current State:** (check existing code first!)
- ✅ **What exists:** `ObjectiveSection.tsx` renders `VitalsGrid` (P2), the structured `ExamSystemList` (P1), the `test_results` textarea, and the legacy free-text exam + `vitalsText` blocks in a fixed order. Subjective `subjective-section-order.ts` (`SubjectiveSectionId`, mountable-id resolver, ordered renderer) and `section-reorder-context.tsx` (`SortableSectionShell`) are the proven precedent.
- ✅ **What's done:** `objective-section-order.ts` (`ObjectiveSectionId`, mountable-id resolver, merge), registry-driven ordered render in `ObjectiveSection.tsx`, parity + merge tests.

**Scope Guard:**
- Expected files touched: ≤ 4 (`objective-section-order.ts` + `ObjectiveSection.tsx` rewire + parity test + barrel/index if needed).
- **No** `doctor_settings` change (obj-10), **no** DnD/collapse/hidden wiring (obj-11/12), **no** custom sections (obj-13), **no** seed logic (obj-14). Pure refactor under a parity test.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. `objective-section-order.ts` identity + registry
- [x] ✅ 1.1 `ObjectiveSectionId` union: `'vitals' | 'exam' | 'test_results' | 'legacy_exam' | 'legacy_vitals'` + the `custom_block:<uuid>` template (mirrors `SubjectiveSectionId`). Reserve (comment) `point_of_care` / `media` slots for P5. - **Completed: 2026-06-19**
- [x] ✅ 1.2 `DEFAULT_OBJECTIVE_SECTION_ORDER` reproducing today's hardcoded order byte-for-byte. - **Completed: 2026-06-19**
- [x] ✅ 1.3 Mountable-id resolver: filters the order to sections that should mount for the current context (e.g. legacy blocks only when they have content or are explicitly kept), with graceful merge (unknown ids dropped, missing-but-available appended at canonical slot) — clone P8-D5. - **Completed: 2026-06-19**
- [x] ✅ 1.4 Registry map `id → render node` accessor so a renderer can walk an ordered id list. - **Completed: 2026-06-19**

### 2. `ObjectiveSection` ordered render
- [x] ✅ 2.1 Replace the hardcoded JSX sequence with an ordered walk over the resolved id list rendering the registry node per id. - **Completed: 2026-06-19**
- [x] ✅ 2.2 Each section block wrapped in a shell that exposes a `leadingActions` slot + stable id (so obj-11's grips/obj-12's menu attach later) — but **no** grip/menu rendered yet. - **Completed: 2026-06-19**
- [x] ✅ 2.3 Default-order path used when no override exists (override + seed land in obj-11/14). - **Completed: 2026-06-19**

### 3. Verification & Testing
- [x] ✅ 3.1 Parity test: render `ObjectiveSection` with no override ⇒ section order + DOM structure byte-identical to the pre-refactor snapshot. - **Completed: 2026-06-19**
- [x] ✅ 3.2 Merge test: a stored-order fixture with an unknown id + a missing id resolves to a valid mountable order (no section lost, no crash). - **Completed: 2026-06-19**
- [x] ✅ 3.3 `cd frontend && npx tsc --noEmit` clean on touched files; targeted vitest green; eslint clean. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/objective-section-order.ts
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx
CREATE: frontend/components/cockpit/rx/sections/__tests__/ObjectiveSection.order.test.tsx
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Parity is the contract** — the default render order must not change. The refactor is invisible to a doctor with no settings.
- **Reuse, do not fork** — clone the subjective `subjective-section-order.ts` shapes (`SectionId`, mountable resolver, merge) rather than inventing a parallel scheme.
- The registry is **UI-only** — it never feeds `buildRxPayload`; output is untouched (OBJ-D2 / P3-D3).
- Keep the legacy free-text exam + `vitalsText` as first-class registry sections (OBJ-D7) — they become hideable in obj-12, not removed.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **N** (frontend render refactor).
- [x] **Any PHI in logs?** **No**.
- [x] **External API or AI call?** **N**.
- [x] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] `ObjectiveSection` renders from an ordered registry; default order byte-identical (parity test).
- [x] Stored-order merge drops unknown ids + appends missing-available; no section lost.
- [x] No output change; no `doctor_settings`/DnD/menu in this task.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-10-doctor-settings-objective-layout-columns.md`](./task-obj-10-doctor-settings-objective-layout-columns.md) — persists the order this registry produces.
- [`task-obj-11-reorder-and-collapse-engines.md`](./task-obj-11-reorder-and-collapse-engines.md) — renders grips/collapse over this registry.

---

**Last Updated:** 2026-06-19  
**Pattern:** subjective `subjective-section-order.ts` registry + `SortableSectionShell` ordered renderer.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
