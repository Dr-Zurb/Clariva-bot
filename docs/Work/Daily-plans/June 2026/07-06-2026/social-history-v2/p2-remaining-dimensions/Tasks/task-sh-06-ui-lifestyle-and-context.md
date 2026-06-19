# Task sh-06: `SocialHistoryField` UI — lifestyle + context (substances · diet · activity · occupation · living · travel)

> **Filename:** `task-sh-06-ui-lifestyle-and-context.md` in `social-history-v2/p2-remaining-dimensions/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add the **lifestyle** (Substances · Diet · Activity) and **context** (Occupation+exposures ·
Living · Travel) sections to [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx),
reusing the shipped `StatusChipRow` / `MultiTypeChipRow` / `NumberField` helpers + single-select
chip rows. Reads/writes the extended structured object from sh-05.

**Program / Phase:** social-history-v2 · Phase 2 (remaining dimensions)  
**Batch:** [`plan-p2-social-history-v2-remaining-dimensions-batch.md`](../plan-p2-social-history-v2-remaining-dimensions-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md`](./EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — six UI sections (no new state architecture).

**Current State:**
- ✅ **What exists:** Phase-1 `SocialHistoryField` with Smoking/Smokeless/Alcohol sections + reusable helpers; extended model + setters from sh-05; six lifestyle/context sections wired.
- ✅ **What's missing (was):** the six lifestyle/context sections + their immutable updaters/wiring — **now shipped in sh-06**.

**Scope Guard:**
- Expected files touched: ≤ 3 (`SocialHistoryField.tsx`; its test; maybe a small `setX` updater in `social-history.ts` if not covered by sh-05). Reuse helpers; no new architecture.

**Reference Documentation:**
- Source plan **Phase 2 §** (UI clusters + shape): [`plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Lifestyle cluster
- [x] ✅ 1.1 **Substances** — multi-select uses (cannabis/opioids/sedatives/stimulants/other) + single-select route (oral/inhaled/IV); IV shows an infection-risk hint. - **Completed: 2026-06-07**
- [x] ✅ 1.2 **Diet** — single-select type (veg/non-veg/egg/vegan) + caffeine cups/day number. - **Completed: 2026-06-07**
- [x] ✅ 1.3 **Activity** — single-select level (sedentary/light/moderate/vigorous) + days/week number. - **Completed: 2026-06-07**

### 2. Context cluster
- [x] ✅ 2.1 **Occupation** — free-text input + multi-select exposures (dust/silica · chemicals · heat · heavy-lifting · screen). - **Completed: 2026-06-07**
- [x] ✅ 2.2 **Living** — single-select situation (alone/with-family/institutional) + optional notes. - **Completed: 2026-06-07**
- [x] ✅ 2.3 **Travel** — recent-travel toggle → reveal place input + sick-contacts toggle. - **Completed: 2026-06-07**

### 3. Layout
- [x] ✅ 3.1 Group the new sections under the existing card after the Phase-1 sections; keep the card scannable (cluster headings / spacing); preserve the `CollapsibleContainer` preview. - **Completed: 2026-06-07**

### 4. Verification & Testing
- [x] ✅ 4.1 Component tests — each section sets/clears its field; conditional reveals; round-trip via `serializeSocialHistory`. - **Completed: 2026-06-07**
- [x] ✅ 4.2 `cd frontend; npx tsc --noEmit` + lint + frontend suite green. - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (6 sections)
UPDATE/CREATE: SocialHistoryField test (lifestyle/context)
UPDATE (if needed): frontend/lib/cockpit/social-history.ts (setX updaters not in sh-05)
DO NOT TOUCH: backend; wellbeing/sexual sections (sh-07); migrations
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse, don't reinvent** — `StatusChipRow` / `MultiTypeChipRow` / `NumberField` + chip styles; immutable updaters from sh-05.
- **No collapse regressions** — no `onBlur` / `onMouseDown preventDefault` heuristics.
- **Compact by default** — single-selects collapse when unset; Travel reveals on demand.
- Autosave continues on change.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (write path only)** — UI edits the structured PHI object.
  - [x] **RLS verified?** **Yes** — server-side via 026; unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Six lifestyle/context sections capture + round-trip; card stays scannable; no collapse regression; suite + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Runs in parallel with sh-07 (wellbeing + sexual) — coordinate only on section ordering within the card.

---

## 🔗 Related Tasks

- [`task-sh-05-data-model-and-backend.md`](./task-sh-05-data-model-and-backend.md) — provides the shape.
- [`task-sh-07-ui-wellbeing-and-sexual-history.md`](./task-sh-07-ui-wellbeing-and-sexual-history.md) — parallel UI lane.

---

**Last Updated:** 2026-06-07  
**Pattern:** clones Phase-1 `SocialHistoryField` section helpers.  
**Reference:** `process/CODE_CHANGE_RULES.md` · source plan Phase 2 §.
