# Task subj-08: Subjective presets (extend `doctor_rx_templates` + apply-subset)

> **Filename:** `task-subj-08-subjective-presets.md` in `subjective-tab/p2-fast-entry/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Let doctors save + apply **subjective presets** — a complaint+OLDCARTS+history bundle
("Migraine subjective", "URI subjective") — in one tap, reusing the shipped
`doctor_rx_templates` table + `TemplatePicker` with a **"Subjective only" apply mode** (ST.8).

**Program / Phase:** subjective-tab · Phase 2 (fast-entry)  
**Batch:** [`plan-p2-subjective-tab-fast-entry-batch.md`](../plan-p2-subjective-tab-fast-entry-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-subjective-tab-fast-entry.md`](./EXECUTION-ORDER-p2-subjective-tab-fast-entry.md)  
**Estimated Time:** ~1.5 hours  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **Update existing** — extend the template payload + the picker. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`091_doctor_rx_templates.sql`](../../../../../../../../backend/migrations/091_doctor_rx_templates.sql) (already has `cc`/`hopi` + `use_count`/`last_used_at`); the shipped [`TemplatePicker.tsx`](../../../../../../../../frontend/components/ehr/TemplatePicker.tsx) (search, apply, save-current, usage ranking); the Phase-1 `complaints` + history state.
- ✅ **What's missing:** ~~the template payload carrying `complaints` + histories; a "Subjective only" apply mode that fills just those fields.~~ **Done.**

**Scope Guard:**
- Expected files touched: ≤ 5 (template payload/type + service; the picker apply-mode; the save-current snapshot; a test). Optional migration only if the template payload needs a column (it may piggyback existing JSON/columns — confirm in audit).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Template payload
- [x] ✅ 1.1 Audit `doctor_rx_templates` payload + `rx-template-service.ts`; extend it to carry `complaints` + FH/SH/PSH (additive; piggyback existing JSON column if present, else add one — confirm in audit). - **Completed: 2026-06-03** (`119_doctor_rx_templates_subjective_json.sql` + `normalizeSubjective()`)

### 2. Picker apply-subset
- [x] ✅ 2.1 Add a "Subjective only" apply mode to `TemplatePicker` that fills only the subjective fields (cards + histories) via the Phase-1 reducer; bumps `use_count`/`last_used_at`. - **Completed: 2026-06-03** (`variant="subjective"` + `apply-subjective-template.ts`)
- [x] ✅ 2.2 "Save current as subjective preset" snapshots the current subjective into a template. - **Completed: 2026-06-03** (`SubjectivePresetButton` in Subjective tab)

### 3. Verification & Testing
- [x] ✅ 3.1 Test: save-current snapshots subjective; apply fills only subjective fields; usage counter bumps; per-doctor RLS holds. - **Completed: 2026-06-03** (`apply-subjective-template.test.ts`; usage bump via existing `recordRxTemplateUse` in picker)
- [x] ✅ 3.2 `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/rx-template-service.ts (+ payload/type; optional migration if a column is needed)
UPDATE: frontend/components/ehr/TemplatePicker.tsx (Subjective-only apply mode + save-current)
UPDATE: the Subjective tab entry point that opens the picker
CREATE/UPDATE: a test for save + apply-subset
DO NOT TOUCH: the Rx (full) apply path's existing behaviour
```

**When updating existing code:**
- [x] Audit the template payload + every apply caller before extending — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [x] Keep the existing full-Rx apply unchanged; add the subset mode beside it.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Reuse the shipped template infra** — don't build a parallel preset system.
- **Apply-subset must not disturb** Dx/meds/plan when in "Subjective only" mode.
- **Fills the array (ST-D1)** — preset hydrates `complaints` + histories, not raw text.
- **Per-doctor** (T2-D2); RLS unchanged.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — `doctor_rx_templates` payload extension (per-doctor; PHI-adjacent template text).
  - [x] **RLS verified?** **Yes** — `doctor_rx_templates` doctor-scoped (migration 091); unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (templates already cascade on doctor deletion).

---

## ✅ Acceptance & Verification Criteria

- [x] Save-current snapshots the subjective; "Subjective only" apply fills only cards + histories; usage ranking bumps; full-Rx apply unchanged; per-doctor RLS; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Order-set-style speed for common presentations, reusing the template picker doctors already know.

---

## 🔗 Related Tasks

- [`task-subj-06-complaint-master-and-favorites.md`](./task-subj-06-complaint-master-and-favorites.md) — the substrate.
- [`task-subj-07-carry-forward-last-visit.md`](./task-subj-07-carry-forward-last-visit.md) — the per-patient counterpart.

---

**Last Updated:** 2026-06-03  
**Pattern:** shipped `doctor_rx_templates` + `TemplatePicker` extended with a subjective-only apply mode.  
**Reference:** `process/CODE_CHANGE_RULES.md`
