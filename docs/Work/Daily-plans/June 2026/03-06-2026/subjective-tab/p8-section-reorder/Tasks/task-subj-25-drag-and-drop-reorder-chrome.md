# Task subj-25: Drag-and-drop reorder chrome for all subjective sections (left grip + keyboard)

> **Filename:** `task-subj-25-drag-and-drop-reorder-chrome.md` in `subjective-tab/p8-section-reorder/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Make every top-level Subjective section **drag-reorderable**. Add a left-edge six-dot grip to each
section (via `CollapsibleContainer.leadingActions`), wire native HTML5 drag-and-drop over subj-23's
ordered id list with a drop-intent indicator line, and support keyboard reorder (ArrowUp/ArrowDown on
the focused grip) — reusing the affordances already shipped in `CustomSubsectionsField` (Phase 7) and
the drop-intent helpers in `ComplaintList` / `complaint-drag.ts`. Reorder updates **local order state**
only; persistence + seeding land in subj-26.

**Program / Phase:** subjective-tab · Phase 8 (section reorder)  
**Batch:** [`plan-p8-subjective-section-reorder-batch.md`](../plan-p8-subjective-section-reorder-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p8-subjective-section-reorder.md`](./EXECUTION-ORDER-p8-subjective-section-reorder.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ⏳ **PENDING**

**Change Type:**
- [ ] **New feature** — additive interaction layer over the subj-23 registry. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-23 registry + ordered render; the Phase-7 grip + keyboard reorder in [`CustomSubsectionsField.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx) (`CustomSubsectionDragHandle`, drop-intent, indicator line); `CollapsibleContainer.leadingActions` slot ([`CollapsibleContainer.tsx`](../../../../../../../../frontend/components/ui/CollapsibleContainer.tsx)); native DnD drop-intent in [`ComplaintList.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintList.tsx) + [`complaint-drag.ts`](../../../../../../../../frontend/lib/cockpit/complaint-drag.ts).
- ❌ **What's missing:** a grip / drag wiring on the section blocks (only custom subsections have it today); local order state on `SubjectiveSection`.

**Scope Guard:**
- Expected files touched: ≤ 5 (new `SortableSectionShell` or grip wrapper; `SubjectiveSection.tsx` order state + wiring; possibly a shared `section-drag.ts` extracted from the Phase-7 helpers; tests).
- **No** persistence / settings api (subj-26), **no** output change.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Reorder primitives
- [ ] 1.1 Extract / reuse the drop-intent helper (before/after based on pointer position) — promote the Phase-7 / `complaint-drag.ts` logic into a shared section helper if it reduces duplication; otherwise reuse in place.
- [ ] 1.2 Local order state in `SubjectiveSection` over subj-23's id list (initialised from `DEFAULT_SECTION_ORDER`; subj-26 will override the init).

### 2. Grip + DnD chrome
- [ ] 2.1 Render a six-dot grip (left edge) on each orderable section via `CollapsibleContainer.leadingActions`. For non-collapsible blocks (e.g. `ComplaintList`, linked zones), wrap in a shared `SortableSectionShell` that owns the grip + draggable container so every section gets a consistent handle.
- [ ] 2.2 Native HTML5 DnD: `draggable` grip, `dragstart` (set dragged id), `dragover` (compute drop intent + show indicator line), `drop` (reorder the id list). Mirror the `CustomSubsectionsField` indicator styling.
- [ ] 2.3 Keyboard reorder: ArrowUp/ArrowDown on the focused grip moves the section one slot; mirror the Phase-7 `CustomSubsectionDragHandle` keyboard handler.

### 3. A11y + disabled
- [ ] 3.1 Grip has an `aria-label` (e.g. `Reorder <section name>`), is focusable, and is hidden / inert when `disabled`.
- [ ] 3.2 Reorder announces or moves focus sensibly; the fixed toolbar/heading remain non-draggable.

### 4. Verification & Testing
- [ ] 4.1 Test: keyboard ArrowUp/ArrowDown reorders sections (stable in jsdom — prefer keyboard over synthetic drag, per Phase-7 learnings).
- [ ] 4.2 Test: reorder updates the rendered order; `disabled` hides grips and blocks reorder.
- [ ] 4.3 `cd frontend && npx tsc --noEmit && npm run lint` clean; suites green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/subjective/SortableSectionShell.tsx (grip + draggable wrapper)
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (order state + DnD wiring)
CREATE/UPDATE: frontend/lib/cockpit/section-drag.ts (shared drop-intent, optional extract)
CREATE: frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.reorder.test.tsx
DO NOT TOUCH: persistence/settings (subj-26); PDF/output; cc/hopi
```

**When updating existing code:**
- [ ] Reuse the Phase-7 grip + keyboard handler and the `complaint-drag` drop-intent — do not introduce a new DnD library or a divergent indicator style.
- [ ] Keep custom-subsection **internal** reorder (Phase 7) intact; this task reorders the section blocks, not their contents.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse Phase-7 drag + a11y primitives (P8-D6).** Same grip, indicator, keyboard pattern; no new dep.
- **UI-only (P8-D3).** Local order state; no output or derivation change.
- **Left-edge grip.** Drag affordance lives on the left edge of each section header (Part-A precedent).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** — UI interaction state only.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Every top-level section has a left-edge grip; drag + keyboard reorder both work.
- [ ] Drop indicator mirrors the Phase-7/ComplaintList affordance; `disabled` suppresses grips.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Synthetic drag is unreliable in jsdom (a Phase-7 learning) — assert reorder via the keyboard path and unit-test the drop-intent helper directly.

---

## 🔗 Related Tasks

- [`task-subj-23-section-registry-and-ordered-renderer.md`](./task-subj-23-section-registry-and-ordered-renderer.md) — the ordered id list this mutates.
- [`task-subj-26-persist-and-seed-order.md`](./task-subj-26-persist-and-seed-order.md) — feeds the initial order + saves the result.

---

**Last Updated:** 2026-06-17  
**Pattern:** native HTML5 DnD + keyboard reorder over an id list, reusing the Phase-7 grip + `complaint-drag` drop-intent.  
**Reference:** `process/CODE_CHANGE_RULES.md`
