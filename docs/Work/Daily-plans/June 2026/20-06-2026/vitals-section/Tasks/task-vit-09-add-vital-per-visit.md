# Task vit-09: Per-visit "+ Add vital" ephemeral reveal (working override, not saved default)

> **Filename:** `task-vit-09-add-vital-per-visit.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Let a doctor surface a **hidden** vital for the **current visit only** — without changing their saved default.
A "+ Add vital" affordance opens a grouped picker of currently-hidden vitals; choosing one reveals it in the
grid for this visit via a **working override** in component/form state. The persisted `vitals_hidden` default
(vit-07/08) is untouched, so the next visit starts from the doctor's default again. Mirrors the objective
per-visit override layered over the persisted default (P3-D5).

**Program / Phase:** vitals-section · VP3 (hide/unhide engine)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Add affordance** — per-visit reveal over the persisted default. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** vit-07 resolver (`hidden` → visible), vit-08 menu (persisted default); the objective per-visit override pattern in `ObjectiveSection.tsx`; the grid (vit-05/06).
- ✅ **What's missing (resolved):** a per-visit reveal that adds a hidden vital to the visible set without persisting.

**Scope Guard:**
- Expected files touched: ≤ 3 (a "+ Add vital" picker + grid wiring + tests). **No** change to the persisted default (vit-07/08), **no** new storage, **no** trends.
- The working override is **session/visit-scoped only** (component/form state) — never written to `vitals_hidden`.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Per-visit reveal
- [x] ✅ 1.1 A "+ Add vital" control opening a grouped picker of currently-hidden vitals; selecting one adds it to the **effective visible set for this visit** via a working override merged over the vit-07 resolver result. - **Completed: 2026-06-21**
- [x] ✅ 1.2 The persisted `vitals_hidden` default is **not** mutated; reload/next visit returns to the doctor's default (unless they used the vit-08 menu to change the default). - **Completed: 2026-06-21**

### 2. Interaction with the menu + data
- [x] ✅ 2.1 A vital revealed for the visit can still be re-hidden for the visit (remove from the working override); revealing a hidden vital that already holds a value just shows it (no warning needed — revealing, not hiding). - **Completed: 2026-06-21**
- [x] ✅ 2.2 Clear visual cue that a revealed vital is "added for this visit" vs part of the saved default (optional, subtle). - **Completed: 2026-06-21**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: "+ Add vital" reveals a hidden vital for the visit; persisted default unchanged; remount returns to default; revealed vital is editable + saves normally. - **Completed: 2026-06-21**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: a "+ Add vital" picker component (+ test)
UPDATE: VitalsGrid (merge per-visit working override over the resolved visible set)
DO NOT TOUCH: persisted vitals_hidden default (vit-07/08); storage; trends; buildRxPayload
```

**When updating existing code:**
- [x] Working override is visit-scoped only — never persist it to `vitals_hidden`.
- [x] Merge order: persisted default (vit-07) → per-visit reveal override → effective visible set.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Per-visit, ephemeral** — reveal does not change the saved default (mirrors objective P3-D5 override-vs-default).
- **Reveal ≠ hide** — no warning when revealing; a revealed vital with data simply shows.
- **UX-only** — never reaches `buildRxPayload` (V3-D5).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — visit-scoped UI state only; no persisted write.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — ephemeral UI state over the vit-07 resolver.

---

## ✅ Acceptance & Verification Criteria

- [x] "+ Add vital" reveals a hidden vital for the current visit only; saved default unchanged; remount returns to default.
- [x] Revealed vital is editable + saves like any other; no payload impact.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

What makes aggressive default-hiding safe: a doctor can keep a lean core grid and still pull in "fundal height" or "PEFR" for the one visit that needs it, in two taps, without ever editing their saved layout.

---

## 🔗 Related Tasks

- [`task-vit-07-vitals-visibility-persistence.md`](./task-vit-07-vitals-visibility-persistence.md) — the default this overrides per-visit.
- [`task-vit-08-manage-vitals-menu.md`](./task-vit-08-manage-vitals-menu.md) — the persisted-default counterpart.

---

**Last Updated:** 2026-06-21  
**Pattern:** per-visit working override over a persisted default (objective P3-D5 analog).  
**Reference:** `process/CODE_CHANGE_RULES.md`
