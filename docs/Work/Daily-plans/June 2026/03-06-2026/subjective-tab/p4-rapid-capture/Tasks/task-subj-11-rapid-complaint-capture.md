# Task subj-11: Rapid complaint capture bar (type → Enter → collapsed card)

> **Filename:** `task-subj-11-rapid-complaint-capture.md` in `subjective-tab/p4-rapid-capture/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase 1 `Tasks/` folder.

---

## 📋 Task Overview

Change the complaint **entry interaction** to match how patients actually present — they
rattle off several complaints at once before we can ask about components. Add a persistent
**rapid-capture bar** at the top of [`ComplaintList`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintList.tsx):
type a complaint, press Enter → it registers as a **collapsed** card, the bar clears and
keeps focus → type the next, Enter, repeat. SOCRATES/OLDCARTS details are entered later by
**clicking a card to expand** it (already supported). This replaces the current
"+ Add complaint" flow, which forces the full editor open on every add.

**Program / Phase:** subjective-tab · Phase 4 (rapid-capture)
**Batch:** [`plan-p4-subjective-tab-rapid-capture-batch.md`](../plan-p4-subjective-tab-rapid-capture-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md`](./EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md)
**Estimated Time:** ~0.5–1 day
**Status:** ⬜ TODO

**Change Type:**
- [ ] **Update existing** — rewire the add flow in `ComplaintList`; extend [`ComplaintAutocomplete`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx) with a free-text-commit-on-Enter path. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] **New (small)** — a `ComplaintCaptureBar` component (may be inlined in `ComplaintList`).

**Current State:**
- ✅ **What exists:** structured `complaints` JSONB + reducer (`ADD/UPDATE/REMOVE/REORDER_COMPLAINT`) in [`RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx); [`ComplaintCard`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCard.tsx) already renders a collapsed summary when `!isEditing && isComplaintComplete` and expands via `onRequestEdit`; `ComplaintAutocomplete` (complaint_master, captures `category`); type-aware schema, severity, associated, favorites, carry-forward, presets — all reused unchanged.
- ❌ **What's missing:** a dedicated capture bar; new cards landing **collapsed** instead of auto-opening the editor; free-text-commit-on-Enter in the autocomplete; duplicate-name → focus-existing behaviour.
- ⚠️ **Notes:** `handleAddComplaint` currently sets `activeInstanceId` + `pendingFocusIdRef` (auto-opens editor). Capture-add must NOT do this — the new card lands as a summary, focus stays in the bar.

**Scope Guard:**
- Expected files touched: ≤ 4 (`ComplaintList.tsx`, `ComplaintAutocomplete.tsx`, 1 new capture component or inline, tests). DO NOT touch the reducer, JSONB model, schema registry, or `cc`/`hopi` derivation.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Rapid-capture bar
- [ ] 1.1 Persistent input at the top of `ComplaintList`, backed by `ComplaintAutocomplete` so a picked match captures `complaint_master.category`.
- [ ] 1.2 On Enter: if a dropdown item is highlighted → commit it (name + category); else commit the typed free text as a custom complaint. Dispatch `ADD_COMPLAINT`, clear the bar, **retain focus** for the next complaint.
- [ ] 1.3 Duplicate name (case-insensitive trim match): do NOT add a new card — expand/focus the existing one instead.

### 2. New cards land collapsed
- [ ] 2.1 Capture-add must NOT set `activeInstanceId` / `pendingFocusIdRef`; the card renders as a summary immediately (name-only is `isComplaintComplete`).
- [ ] 2.2 Click a card → existing `onRequestEdit` opens the full SOCRATES/OLDCARTS editor; Escape/blur collapses (already works — verify, do not regress).

### 3. Replace the old add path
- [ ] 3.1 Remove the editor-opening "+ Add complaint" behaviour; the capture bar is the sole add path. Keep an empty-state hint that points at the bar.

### 4. Verification & Testing
- [ ] 4.1 Test: type 4 complaints with Enter between each → 4 collapsed cards, bar cleared, focus retained; autosave fires.
- [ ] 4.2 Test: Enter on a highlighted autocomplete match captures category; clicking the card loads the matching schema.
- [ ] 4.3 Test: duplicate name focuses the existing card, no new card added.
- [ ] 4.4 a11y: bar is a labelled combobox; 44px targets; keyboard-only add flow; `tsc`/lint/tests green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintList.tsx (capture bar + collapsed-add + dup handling)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx (free-text commit on Enter + clear)
CREATE: (optional) frontend/components/cockpit/rx/subjective/ComplaintCaptureBar.tsx
UPDATE: frontend/components/cockpit/rx/subjective/__tests__/ComplaintList.test.tsx
DO NOT TOUCH: RxFormContext reducer, complaint-schema.ts, cc/hopi derivation
```

**When updating existing code:**
- [ ] Audit `ComplaintList` / `ComplaintAutocomplete` callers before rewiring — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [ ] Preserve the existing click-to-expand + Escape/blur-collapse behaviour; only the *add* path changes.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Capture name-first, details-later** — the bar only sets `name` (+ `category` when picked); all OLDCARTS/SOCRATES entry stays in the click-to-expand editor.
- **Focus stays in the bar** after each Enter so a doctor can dictate a list without touching the mouse.
- **Single open card at a time** — keep the existing single `activeInstanceId` accordion model.
- **No direct field mutation** — writes go through existing reducer actions (autosave is wired off that).
- **Free-text always allowed** — a complaint not in `complaint_master` still commits; category falls back to the keyword resolver / OLDCARTS.

**DO NOT include** code or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** (UI/interaction only; existing schema + reducer).
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Type → Enter registers a collapsed card; bar clears; focus retained; repeat works for a multi-complaint list.
- [ ] Clicking a card opens the type-aware attribute editor; collapses back on Escape/blur.
- [ ] Duplicate name focuses the existing card rather than adding a second.
- [ ] Autosave fires; `cc`/`hopi` derivation unchanged; a11y + `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The whole point is the "rattle-off" capture: a patient lists headache, heartburn, body
ache, lethargy in one breath; the doctor types each + Enter without being pulled into a
detail editor. Details come later, per-card, on click. ~90% of the machinery (cards,
collapse/expand, schema, autocomplete) already ships from `subj-01..10`; this task is a
focused rewire of the *add* interaction only.

---

## 🔗 Related Tasks

- [`task-subj-12-nested-associated-complaints.md`](./task-subj-12-nested-associated-complaints.md) — reuses this capture bar one level down (nested add).
- subj-02 — the `ComplaintCard` / `ComplaintList` this rewires.
- subj-06 — `ComplaintAutocomplete` / complaint_master this extends.

---

**Last Updated:** 2026-06-04
**Pattern:** name-first rapid capture; click-to-expand for detail.
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md`
