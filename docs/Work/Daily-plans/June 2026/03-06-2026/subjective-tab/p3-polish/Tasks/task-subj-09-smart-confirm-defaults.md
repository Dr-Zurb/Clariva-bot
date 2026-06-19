# Task subj-09: Smart-confirm defaults (per-doctor attribute pre-selection)

> **Filename:** `task-subj-09-smart-confirm-defaults.md` in `subjective-tab/p3-polish/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Make the common case "pick → glance → done": when a doctor picks a complaint, pre-select
its **most common attribute values for that doctor** (derived from `doctor_note_favorites` /
their prior complaints) so they edit only exceptions (ST.9 / ST-D5). Defaults are
**suggestions** — visually distinct until confirmed, and they never overwrite an explicit edit.

**Program / Phase:** subjective-tab · Phase 3 (polish)  
**Batch:** [`plan-p3-subjective-tab-polish-batch.md`](../plan-p3-subjective-tab-polish-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-subjective-tab-polish.md`](./EXECUTION-ORDER-p3-subjective-tab-polish.md)  
**Estimated Time:** ~1 hour  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **New feature** — a defaulting helper + a "suggested" visual state on the card.

**Current State:**
- ✅ **What exists:** `doctor_note_favorites` + prior complaints (subj-06); the complaint card + schema (subj-02/03).
- ✅ **What's missing:** ~~the per-doctor default resolver; the "suggested-until-confirmed" rendering.~~ **Done.**
- ⚠️ **Notes:** defaults derive from existing data — no new schema. Suggestions stay out of form state until confirmed (no phantom autosave).

**Scope Guard:**
- Expected files touched: ≤ 3 (the defaults helper, the card's suggested-state rendering, a test).

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Default resolver
- [x] ✅ 1.1 Create `frontend/lib/cockpit/complaint-defaults.ts` deriving per-doctor most-common attribute values for a complaint/category from favourites / prior complaints. - **Completed: 2026-06-03**

### 2. Suggested-until-confirmed UI
- [x] ✅ 2.1 On complaint pick, show the defaults as *suggestions* (visually distinct); a single confirm applies them; any explicit edit takes precedence and is never overwritten. - **Completed: 2026-06-03**
- [x] ✅ 2.2 Define the state cleanly so a suggestion does not autosave as entered data until confirmed. - **Completed: 2026-06-03** (local `suggestions` state; `onPatch` only on confirm or explicit edit)

### 3. Verification & Testing
- [x] ✅ 3.1 Test: defaults suggested on pick; confirm applies; explicit edit wins; unknown complaint → no bad defaults. - **Completed: 2026-06-03**
- [x] ✅ 3.2 `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/complaint-defaults.ts
CREATE: frontend/lib/cockpit/__tests__/complaint-defaults.test.ts
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintCard.tsx (suggested-state rendering)
DO NOT TOUCH: backend, the schema registry's contract (subj-03)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Suggestions, never silent overwrites (ST-D5).** Visually distinct until confirmed; an explicit edit always wins.
- **No new schema** — derive from existing favourites / prior complaints.
- **No phantom autosave** — a suggestion is not entered data until confirmed.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** (derives from existing data; writes only on confirm via existing state).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Picking a complaint suggests the doctor's usual values (distinct until confirmed); confirm applies; explicit edits win; no phantom autosave; tests + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The last layer of the fast-entry stack — turns "tap each attribute" into "confirm the usual".

---

## 🔗 Related Tasks

- [`../../p2-fast-entry/Tasks/task-subj-06-complaint-master-and-favorites.md`](../../p2-fast-entry/Tasks/task-subj-06-complaint-master-and-favorites.md) — the data the defaults derive from.
- [`task-subj-10-integration-a11y-and-close-gate.md`](./task-subj-10-integration-a11y-and-close-gate.md) — verifies the whole program incl. defaults.

---

**Last Updated:** 2026-06-03  
**Pattern:** per-doctor suggested defaults (confirm-to-apply).  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
