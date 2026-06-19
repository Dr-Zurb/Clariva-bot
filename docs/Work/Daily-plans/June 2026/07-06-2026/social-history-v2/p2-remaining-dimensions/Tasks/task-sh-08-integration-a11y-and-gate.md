# Task sh-08: carry-forward / presets verify + a11y + Phase-2 gate

> **Filename:** `task-sh-08-integration-a11y-and-gate.md` in `social-history-v2/p2-remaining-dimensions/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close out Phase 2: **verify** carry-forward (last visit) and subjective presets carry the new
dimensions (they serialize the whole structured object, so this should need little/no wiring),
run an **a11y pass** on the new controls, and execute the **phase acceptance gate**.

**Program / Phase:** social-history-v2 · Phase 2 (remaining dimensions)  
**Batch:** [`plan-p2-social-history-v2-remaining-dimensions-batch.md`](../plan-p2-social-history-v2-remaining-dimensions-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md`](./EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **Integration / polish** — verify fast-entry surfaces + a11y + gate.

**Current State:**
- ✅ **What exists:** carry-forward and presets pass full `socialHistoryStructured`; a11y on phase-2 controls; phase gate verified.
- ✅ **What's missing (was):** confirmation tests, a11y attrs on travel/sexual toggles, backend last-subjective phase-2 content detection — **now shipped in sh-08**.

**Scope Guard:**
- Expected files touched: ≤ 4 (a11y attrs in `SocialHistoryField`; any minor carry-forward/preset fix only if a gap is found; tests). No new schema/UI surfaces.

**Reference Documentation:**
- Source plan Phase 2 § + cross-cutting gate · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Carry-forward + presets verify
- [x] ✅ 1.1 Carry-forward of the last visit hydrates the new dimensions (incl. gated sexual when present); "copy all" + "pick fields" work; autosaves. - **Completed: 2026-06-07**
- [x] ✅ 1.2 Subjective preset save/apply round-trips the new dimensions; only patch wiring if a gap is found. - **Completed: 2026-06-07**

### 2. Accessibility
- [x] ✅ 2.1 New chip groups `role="group"` + labels; single-select chips + toggles expose `aria-pressed`; number fields labelled + keyboard-operable; Travel/sexual reveals keep focus order sane. - **Completed: 2026-06-07**
- [x] ✅ 2.2 Keyboard-only walkthrough of the full (now long) section; the "Add if relevant" toggle is reachable + announced. - **Completed: 2026-06-07**

### 3. Phase acceptance gate
- [x] ✅ 3.1 Run the [batch cross-cutting gate](../plan-p2-social-history-v2-remaining-dimensions-batch.md#cross-cutting-acceptance-gate-whole-phase) end-to-end. - **Completed: 2026-06-07**
- [x] ✅ 3.2 `cd frontend; npx tsc --noEmit` + lint; backend + frontend suites green. - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (a11y attrs on new controls)
UPDATE (only if a gap found): carry-forward action / preset payload+apply
UPDATE/CREATE: integration + a11y tests
DO NOT TOUCH: the structured shape (settled in sh-05); backend schema
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Structured-first** — carry-forward/presets copy the object; TEXT fallback only.
- **No data loss** carrying forward legacy rows (incl. promoted notes).
- **Sensitive data discretion** — gated sexual history copies only when present; never logged.
- **A11y parity** with the rest of the subjective tab.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (read/copy path)** — carry-forward reads prior PHI; presets store per-doctor structured templates.
  - [x] **RLS verified?** **Yes** — existing carry-forward/preset RLS unchanged.
- [x] **Any PHI in logs?** **No** — incl. sensitive fields.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Carry-forward + presets round-trip all nine new dimensions (sexual only when present); a11y pass on new controls; full phase gate + suites + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Phase-2 close-out → completes the medical-school social history. Any future v3 (JSONB→columns for analytics) is out of program v1.

**Gap fixed in sh-08:** backend `socialHistoryStructuredHasContent` in `prescription-service.ts` now detects phase-2-only rows for last-subjective lookup (JSONB without derived TEXT).

---

## 🔗 Related Tasks

- [`task-sh-05-data-model-and-backend.md`](./task-sh-05-data-model-and-backend.md) · [`task-sh-06-ui-lifestyle-and-context.md`](./task-sh-06-ui-lifestyle-and-context.md) · [`task-sh-07-ui-wellbeing-and-sexual-history.md`](./task-sh-07-ui-wellbeing-and-sexual-history.md).

---

**Last Updated:** 2026-06-07  
**Pattern:** reuses the shipped carry-forward + preset surfaces (subj-07 / subj-08).  
**Reference:** `process/CODE_CHANGE_RULES.md` · source plan Phase 2 §.
