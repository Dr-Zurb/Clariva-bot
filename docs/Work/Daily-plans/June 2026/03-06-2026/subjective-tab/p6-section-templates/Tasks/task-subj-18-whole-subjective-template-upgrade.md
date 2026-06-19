# Task subj-18: Whole-subjective template upgrade (include PMH + rename Presets → Templates)

> **Filename:** `task-subj-18-whole-subjective-template-upgrade.md` in `subjective-tab/p6-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Upgrade the **whole-subjective** template (today's `Presets` button, `scope="subjective_full"`)
so it also captures + applies **Past medical history** (conditions/meds), composing subj-16's
form-state apply with subj-17's PMH create-on-apply into **one** save and **one** apply with a
combined "applying…" state — and rename the label everywhere to **"Templates"**.

**Program / Phase:** subjective-tab · Phase 6 (section templates)  
**Batch:** [`plan-p6-subjective-section-templates-batch.md`](../plan-p6-subjective-section-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p6-subjective-section-templates.md`](./EXECUTION-ORDER-p6-subjective-section-templates.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE** — 2026-06-17. Depends on **subj-16 AND subj-17**.

**Change Type:**
- [x] **Update existing**. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`SubjectivePresetButton.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/SubjectivePresetButton.tsx) (full save/apply, complaints+PSH+family/social); subj-16's scoped helpers + reusable button; subj-17's `usePmhTemplateApply` + `pmh_json`.
- ❌ **What's missing:** `subjective_full` capturing PMH; a combined apply that runs the reducer dispatch **and** the PMH chart creates; the label rename.

**Scope Guard:**
- Expected files touched: ≤ 5 (full button; apply helper; the section header that mounts it; a test). No new migrations (reuses subj-17's `pmh_json`).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Full save captures PMH
- [x] ✅ 1.1 `subjective_full` save now also snapshots the patient's PMH conditions/meds into `pmh_json` (reuse subj-17's snapshot), alongside the existing complaints/PSH/family/social `subjective_json`. - **Completed: 2026-06-17**

### 2. Full apply orchestration
- [x] ✅ 2.1 Full apply runs the form-state reducer dispatch (subj-16/existing) **and** `usePmhTemplateApply` (subj-17) for the PMH slice, behind **one** combined "Applying…" state and one result/error summary. - **Completed: 2026-06-17**
- [x] ✅ 2.2 Ordering: dispatch form state first (synchronous), then await PMH creates; partial-failure on PMH must not lose the form-state apply. - **Completed: 2026-06-17**

### 3. Rename + label
- [x] ✅ 3.1 Renamed the global button label `Presets` → **"Templates"** (`data-testid` → `subjective-template-trigger`). Scoped buttons already read "Templates" (P6-D6). - **Completed: 2026-06-17**
- [x] ✅ 3.2 `subjective_full` excludes allergies (doctor's choice); `templateHasSubjectiveContent` checks PMH only, not `allergies_json` — extension point documented in code. - **Completed: 2026-06-17**

### 4. Verification & Testing
- [x] ✅ 4.1 Tests: full save captures complaints+PMH + stamps `subjective_full`; `fullSubjectiveHasContent`; PMH in picker filter; form-state apply unchanged; per-call `onSummary` override; integration testid updated. - **Completed: 2026-06-17**
- [x] ✅ 4.2 Scoped vitest green (31/32 — one pre-existing family-history serialization assertion in integration smoke); eslint clean on touched files. - **Completed: 2026-06-17**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/SubjectivePresetButton.tsx (PMH capture/apply + "Templates" label)
UPDATE: frontend/lib/cockpit/apply-subjective-template.ts (full save now includes pmh_json; full apply composes PMH)
UPDATE: the Subjective section header that mounts the global button (label only if needed)
CREATE/UPDATE: a test for full save+apply incl. PMH + combined state
DO NOT TOUCH: the scoped form-state/server apply behaviours (subj-16/17) — compose them, don't fork
```

**When updating existing code:**
- [x] ✅ Reused subj-17's `usePmhTemplateApply` verbatim via `PmhTemplateBridge` registered by `ProblemOrientedMedicalSection`.
- [x] ✅ Kept existing complaints/PSH/family/social full behaviour byte-identical; PMH is purely additive.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Compose, don't fork.** Full apply = subj-16 form-state path + subj-17 PMH path, orchestrated; no parallel implementations.
- **One state, clear partial-failure (P6-D3).** Combined "applying…"; PMH partial failure doesn't undo the form-state fill.
- **Allergies excluded from full** (doctor's choice) — additive extension point only.
- **"Templates" everywhere (P6-D6).**

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — inherits subj-17 paths.
  - [x] **RLS verified?** **Yes** — inherits subj-17's verified paths.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** new surface beyond subj-17.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ The whole-subjective template captures + applies complaints, PSH, family, social **and** PMH under one "Templates" button with a combined applying state and partial-failure-safe PMH apply; existing form-state behaviour unchanged; scoped tests + lint green. - **2026-06-17**

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Closes the templating story: every subsection has its own scoped template, and the whole-subjective bundle now spans both form-state and server-backed (PMH) data.

---

## 🔗 Related Tasks

- [`task-subj-16-form-state-scoped-templates.md`](./task-subj-16-form-state-scoped-templates.md) — form-state apply composed here.
- [`task-subj-17-server-backed-scoped-templates.md`](./task-subj-17-server-backed-scoped-templates.md) — PMH apply path composed here.

---

**Last Updated:** 2026-06-17  
**Pattern:** compose the scoped form-state + PMH apply paths into the shipped whole-subjective button; rename to "Templates".  
**Reference:** `process/CODE_CHANGE_RULES.md`
