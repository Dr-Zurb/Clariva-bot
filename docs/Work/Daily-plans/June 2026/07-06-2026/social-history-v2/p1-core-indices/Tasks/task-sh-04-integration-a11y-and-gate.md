# Task sh-04: carry-forward / presets integration + a11y + phase gate

> **Filename:** `task-sh-04-integration-a11y-and-gate.md` in `social-history-v2/p1-core-indices/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close out Phase 1: make **carry-forward** (last visit) and **subjective presets** copy the
**structured** social-history object (not the raw TEXT), apply an **a11y pass** on the new
controls (chip groups, number steppers, CAGE toggles), and run the **phase acceptance gate**.

**Program / Phase:** social-history-v2 · Phase 1 (core + indices)  
**Batch:** [`plan-p1-social-history-v2-core-indices-batch.md`](../plan-p1-social-history-v2-core-indices-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-social-history-v2-core-indices.md`](./EXECUTION-ORDER-p1-social-history-v2-core-indices.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **Integration / polish** — wire existing fast-entry surfaces to the structured field + a11y + gate.

**Current State:**
- ✅ **What exists:** carry-forward (`getLastSubjectiveForPatient` + the carry-forward action) and subjective presets (template payload + picker) — both currently copy `socialHistory` TEXT; the structured field (sh-03) + indices (sh-01).
- ✅ **What's missing (was):** structured-aware carry-forward/presets, a11y on the new controls, and the gate run — **now shipped in sh-04**.

**Scope Guard:**
- Expected files touched: ≤ 5 (carry-forward action; preset payload + apply; a11y attrs in `SocialHistoryField`; tests). No new schema/UI surfaces.

**Reference Documentation:**
- Source plan §P1-07 + cross-cutting gate · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Carry-forward
- [x] ✅ 1.1 Carry-forward of the last visit copies `social_history_structured` (fallback: parse TEXT) into the form; "copy all" + "pick fields" both work; autosaves. - **Completed: 2026-06-07**

### 2. Presets
- [x] ✅ 2.1 Subjective preset payload carries the structured object; apply hydrates it; usage counter bumps. - **Completed: 2026-06-07**

### 3. Accessibility
- [x] ✅ 3.1 Chip groups `role="group"` + labels; status/CAGE toggles expose `aria-pressed`; number steppers labelled + keyboard-operable; index badges announced (`aria-live` where useful). - **Completed: 2026-06-07**
- [x] ✅ 3.2 Keyboard-only walkthrough of the section; focus order sane after conditional reveal. - **Completed: 2026-06-07**

### 4. Phase acceptance gate
- [x] ✅ 4.1 Run the [batch cross-cutting gate](../plan-p1-social-history-v2-core-indices-batch.md#cross-cutting-acceptance-gate-whole-phase) end-to-end. - **Completed: 2026-06-07**
- [x] ✅ 4.2 `cd frontend; npx tsc --noEmit` + lint; backend + frontend suites green. - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: carry-forward action (copies structured social history)
UPDATE: subjective preset payload + apply (structured social history)
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (a11y attrs)
UPDATE/CREATE: integration + a11y tests
DO NOT TOUCH: Phase-2 dimensions; backend schema (settled in sh-02)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Structured-first** — carry-forward/presets copy the object; TEXT is fallback only (SHv2-D1).
- **No data loss** on carry-forward from legacy TEXT-only rows (SHv2-D4).
- **A11y parity** with the rest of the subjective tab (keyboard + SR).
- **Per-doctor** presets/favourites only (T2-D2).

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (read/copy path)** — carry-forward reads prior PHI; presets store per-doctor structured templates.
  - [x] **RLS verified?** **Yes** — existing carry-forward/preset RLS unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (inherits existing surfaces).

---

## ✅ Acceptance & Verification Criteria

- [x] Carry-forward + presets round-trip the structured object (legacy TEXT falls back losslessly); a11y pass on new controls; full phase gate + suites + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Phase-1 close-out. Phase 2 adds the remaining 9 dimensions (incl. the off-by-default sexual-history toggle) into the same component + JSONB shape.

---

## 🔗 Related Tasks

- [`task-sh-01-data-model-and-indices.md`](./task-sh-01-data-model-and-indices.md) · [`task-sh-02-migration-and-backend.md`](./task-sh-02-migration-and-backend.md) · [`task-sh-03-form-plumbing-and-ui.md`](./task-sh-03-form-plumbing-and-ui.md).

---

**Last Updated:** 2026-06-07  
**Pattern:** reuses the shipped carry-forward + preset surfaces (subj-07 / subj-08).  
**Reference:** `process/CODE_CHANGE_RULES.md` · source plan §P1-07.
