# Task sh-07: `SocialHistoryField` UI — wellbeing (sleep · stress) + gated sexual history

> **Filename:** `task-sh-07-ui-wellbeing-and-sexual-history.md` in `social-history-v2/p2-remaining-dimensions/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add the **wellbeing** sections (Sleep · Stress) and the **gated, off-by-default Sexual
history** to [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx).
Sexual history stays hidden behind an "Add if relevant" toggle and is serialized only when
enabled + filled (SHv2-D8). Reuses the shipped chip/number helpers.

**Program / Phase:** social-history-v2 · Phase 2 (remaining dimensions)  
**Batch:** [`plan-p2-social-history-v2-remaining-dimensions-batch.md`](../plan-p2-social-history-v2-remaining-dimensions-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md`](./EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — two wellbeing sections + one gated sensitive section.

**Current State:**
- ✅ **What exists:** Phase-1 `SocialHistoryField` + reusable helpers; extended model from sh-05; sleep/stress sections + gated sexual-history UI.
- ✅ **What's missing (was):** the sleep/stress sections + the gated sexual-history UI — **now shipped in sh-07**.

**Scope Guard:**
- Expected files touched: ≤ 3 (`SocialHistoryField.tsx`; its test; maybe a `setX` updater in `social-history.ts` if not covered by sh-05). Reuse helpers.

**Reference Documentation:**
- Source plan **Phase 2 §** (UI clusters + SHv2-D8): [`plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Wellbeing cluster
- [x] ✅ 1.1 **Sleep** — hours/night number + single-select quality (good/fair/poor). - **Completed: 2026-06-07**
- [x] ✅ 1.2 **Stress** — single-select level (low/moderate/high) + single-select support (good/limited/none). - **Completed: 2026-06-07**

### 2. Gated sexual history (SHv2-D8)
- [x] ✅ 2.1 Off-by-default "Add if relevant" toggle (`sexual.enabled`); section + sub-fields render only when enabled; discreet heading/copy. - **Completed: 2026-06-07**
- [x] ✅ 2.2 Sub-fields — active? toggle · partners (single/multiple) · protection (always/sometimes/never). - **Completed: 2026-06-07**
- [x] ✅ 2.3 Disabling the toggle clears the structured `sexual` data (no orphaned serialized text). - **Completed: 2026-06-07**

### 3. Verification & Testing
- [x] ✅ 3.1 Component tests — sleep/stress set/clear; sexual hidden until enabled, appears in serialize only when enabled + filled, clears on disable. - **Completed: 2026-06-07**
- [x] ✅ 3.2 `cd frontend; npx tsc --noEmit` + lint + frontend suite green. - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (sleep/stress + gated sexual)
UPDATE/CREATE: SocialHistoryField test (wellbeing/sexual)
UPDATE (if needed): frontend/lib/cockpit/social-history.ts (setX updaters not in sh-05)
DO NOT TOUCH: backend; lifestyle/context sections (sh-06); migrations
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Sexual history gated + discreet** (SHv2-D8) — off by default; never serialized unless enabled + a sub-field set; disabling clears it.
- **Reuse, don't reinvent** — shipped helpers + chip styles; updaters from sh-05.
- **No collapse regressions**; autosave on change.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (write path only)** — UI edits structured PHI incl. sensitive sexual-history data.
  - [x] **RLS verified?** **Yes** — server-side via 026; unchanged.
- [x] **Any PHI in logs?** **No** — sensitive fields never logged.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (inherits prescription retention).

---

## ✅ Acceptance & Verification Criteria

- [x] Sleep/stress capture + round-trip; sexual history hidden until "Add if relevant", serialized only when enabled + filled, cleared on disable; suite + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Runs in parallel with sh-06 — coordinate only on section ordering within the card.

---

## 🔗 Related Tasks

- [`task-sh-05-data-model-and-backend.md`](./task-sh-05-data-model-and-backend.md) — provides the shape incl. the `sexual.enabled` gate.
- [`task-sh-06-ui-lifestyle-and-context.md`](./task-sh-06-ui-lifestyle-and-context.md) — parallel UI lane.

---

**Last Updated:** 2026-06-07  
**Pattern:** clones Phase-1 `SocialHistoryField` section helpers; adds a gated sub-section.  
**Reference:** `process/CODE_CHANGE_RULES.md` · source plan Phase 2 §.
