# Task subj-04: Owned history fields — Family / Social / Past-surgical

> **Filename:** `task-subj-04-owned-history-fields.md` in `subjective-tab/p1-complaint-cards/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add the three **owned** narrative histories the Subjective tab captures per visit (ST-D3):
**Family history**, **Social / Personal history**, **Past surgical history** — each a
chip-assisted, collapsible free-text field bound to the columns subj-01 added. (PMH /
allergies / current-meds are *linked*, handled in subj-05.)

**Program / Phase:** subjective-tab · Phase 1 (complaint-cards)  
**Batch:** [`plan-p1-subjective-tab-complaint-cards-batch.md`](../plan-p1-subjective-tab-complaint-cards-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md`](./EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md)  
**Estimated Time:** ~1.5 hours  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **New feature** — a new `HistoryFields` component bound to existing (subj-01) state.

**Current State:**
- ✅ **What exists:** subj-01's `familyHistory` / `socialHistory` / `pastSurgicalHistory` fields + columns; the chip strip pattern [`FavoritesChipStrip.tsx`](../../../../../../../../frontend/components/cockpit/rx/favorites/FavoritesChipStrip.tsx); the section field styles [`field-styles`](../../../../../../../../frontend/components/cockpit/rx/sections/field-styles.ts).
- ❌ **What's missing:** the `HistoryFields` UI; its mount in the Subjective tab.
- ⚠️ **Notes:** v1 = free-text + chips (ST-D6); structured social-history columns are deferred. Chip *favourites* sourcing is Phase 2 (`doctor_note_favorites`) — in v1 wire a static/local chip set with a clean seam for the Phase-2 source.

**Scope Guard:**
- Expected files touched: ≤ 3 (the component, its mount in `SubjectiveSection`/pane, 1 test).

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. `HistoryFields` component
- [x] ✅ 1.1 Render three collapsible fields (FH / SH / PSH), each a labelled textarea with a chip-assist row that inserts text. - **Completed: 2026-06-03**
- [x] ✅ 1.2 Bind to subj-01 state via `setField`; collapsed by default to keep the rail compact. - **Completed: 2026-06-03**

### 2. Mount
- [x] ✅ 2.1 Place below the complaint list in the Subjective tab (above/with the linked "Patient background" zone from subj-05). - **Completed: 2026-06-03**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: typing + chip-insert update state; autosave fires; collapsible works. - **Completed: 2026-06-03**
- [x] ✅ 3.2 a11y (labels, targets); `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/subjective/HistoryFields.tsx
CREATE: frontend/components/cockpit/rx/subjective/__tests__/HistoryFields.test.tsx
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (mount)
DO NOT TOUCH: RxFormContext schema (subj-01), the linked sections (subj-05)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Free-text + chips, v1 (ST-D6)** — no structured social-history columns yet.
- **Forward-compatible chip source** — wire chips so Phase 2's `doctor_note_favorites` slots in without restructuring.
- **Compact rail** — collapsible; the pane is narrow.
- Writes go through subj-01 `setField` (autosave free).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** (UI bound to subj-01's existing PHI columns; no new schema).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (columns owned by subj-01).

---

## ✅ Acceptance & Verification Criteria

- [x] FH / SH / PSH save to their columns; chip-assist inserts; collapsible; autosaves; a11y + `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The three histories that genuinely have no home elsewhere — everything else patient-level is linked (subj-05).

---

## 🔗 Related Tasks

- [`task-subj-01-data-model-complaints-and-histories.md`](./task-subj-01-data-model-complaints-and-histories.md) — the columns/fields.
- [`task-subj-05-linked-chart-sections.md`](./task-subj-05-linked-chart-sections.md) — the linked counterpart (PMH/allergies/meds).

---

**Last Updated:** 2026-06-03  
**Pattern:** chip-assisted collapsible free-text fields bound to existing state.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
