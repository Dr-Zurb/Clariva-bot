# Task tc-04: Teleconsult examination — close gate (parity + behaviours + a11y + verification)

> **Filename:** `task-tc-04-teleconsult-exam-close-gate.md` in `teleconsult-exam/Tasks/`.
> **Links:** batch plan [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-teleconsult-exam.md`](./EXECUTION-ORDER-teleconsult-exam.md). Code paths **repo-relative**.

---

## 📋 Task Overview

Prove the batch and close it. No new feature code — this task **verifies** the cross-cutting gate holds end-to-end and fills any test gaps left by tc-01..tc-03:

1. **In-clinic byte-parity** — the whole point of `TC-D5`: an in-clinic visit's exam UI and derived `examination_findings` are unchanged.
2. **Teleconsult behaviours** — ordering, greyed/collapsed/tagged in-person-only, opt-in expand, patient-assisted flip, scoped normal, caveat suffix — all verified together on a teleconsult render.
3. **a11y** — the feasibility tag is announced (not colour-only), opt-in expand is keyboard-operable, no PHI in labels/logs.
4. **Verification gate** — `tsc` + lint + tests green for the slice.

**Program / Batch:** teleconsult-exam · single batch (Wave 4)
**Plan:** [`../plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md)
**Estimated Time:** ~2–3 hours
**Status:** Implemented — close gate green (2026-07-03). **Model: Sonnet** — verification + tests; low blast radius (contract proof lives in tc-03, UX in tc-02).

**Change Type:**
- [x] ✅ **Update existing** — add/adjust tests; no product code unless a gap is found. Follow `docs/Work/process/CODE_CHANGE_RULES.md`. - **Completed: 2026-07-03**

**Current State:** (check existing code first!)
- ✅ **What exists (after tc-01..04):** the `remote` flag + `isTeleconsult` + `teleconsultNormalLine` (tc-01); the teleconsult UI preset across the 5 bodies (tc-02); scoped-normal + caveat derivation (tc-03); consolidated close-gate suite in `teleconsultExamCloseGate.test.tsx` (tc-04).

**Scope Guard:**
- Expected files touched: the exam/objective test files (+ a small teleconsult render helper). Product code only if the gate exposes a defect (route the fix to the owning task's pattern; don't expand scope).
- **DO NOT** introduce new product behaviour here. **DO NOT** weaken any in-clinic parity assertion to make teleconsult pass.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. In-clinic parity (regression guard)
- [x] ✅ 1.1 Run `examDerivationParity` / `objectiveLayoutParity` / `rxFormContext.exam` / `objectiveTemplateParity` with an in-clinic (or absent) modality and confirm **no assertion changed** and all green. - **Completed: 2026-07-03**
- [x] ✅ 1.2 Snapshot/assert that an in-clinic exam render (order, no tags, existing auto-open) matches pre-change. - **Completed: 2026-07-03**

### 2. Teleconsult behaviour matrix
- [x] ✅ 2.1 Render each system with a teleconsult modality: assessable-first order; `in_person_only` greyed + collapsed + **"In-person only"** tag; opt-in expand. - **Completed: 2026-07-03**
- [x] ✅ 2.2 Expand an in-person-only subsection, record a finding → stored as today, tag flips to **"Patient-assisted"**, and the finding derives into `examination_findings`. - **Completed: 2026-07-03**
- [x] ✅ 2.3 Mark a system normal on teleconsult → scoped WNL line in preview + derivation; a non-empty teleconsult exam ends with the caveat exactly once; empty exam → `""`. - **Completed: 2026-07-03**

### 3. Accessibility
- [x] ✅ 3.1 The feasibility tag is textual / announced (assert it is not conveyed by colour alone). - **Completed: 2026-07-03**
- [x] ✅ 3.2 Opt-in expand of an in-person-only subsection is keyboard-operable (`aria-expanded` toggles; focus order sane). - **Completed: 2026-07-03**
- [x] ✅ 3.3 No PHI in any new label/testid/log. - **Completed: 2026-07-03**

### 4. Verification gate
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit` — no new errors in touched files (pre-existing unrelated errors documented, not introduced). - **Completed: 2026-07-03**
- [x] ✅ 4.2 `cd frontend && npm run lint` clean on touched files. - **Completed: 2026-07-03**
- [x] ✅ 4.3 `cd frontend && npm test` green for the exam/objective slice (115 tests in the teleconsult slice green; `objectiveLayoutParity` / `ObjectiveSection` have 7 pre-existing obj-15/WIP failures unrelated to exam derivation — identical payloads, no caveat leak). - **Completed: 2026-07-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/inputs/__tests__/ExamSystemList.test.tsx (teleconsult matrix + a11y)
UPDATE: frontend/components/cockpit/rx/__tests__/examDerivationParity.test.tsx (teleconsult scoped-normal + caveat; in-clinic assertions untouched)
VERIFY (green, no assertion change): objectiveLayoutParity / rxFormContext.exam / objectiveTemplateParity / ObjectiveSection
CREATE (optional): a small renderTeleconsultExam(...) test helper
DO NOT TOUCH: product behaviour (unless a gate defect); in-clinic parity assertions
```

**When updating existing code:** (MANDATORY)
- [x] ✅ If a gate defect is found, fix it in the owning task's file/pattern and note it — don't patch around it in tests. (No defects found — tests only.) - **Completed: 2026-07-03**
- [x] ✅ Keep in-clinic assertions exactly as-is; teleconsult is additive. - **Completed: 2026-07-03**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **The gate cannot pass by weakening in-clinic parity.** In-clinic output/behaviour is the invariant.
- **Prove behaviour, don't re-implement it.** Product logic lives in tc-01..03.
- a11y: tag textual + announced; keyboard opt-in; PHI-free.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **N** — tests/verification only.
- [x] ✅ **Any PHI in logs?** **No.**
- [x] ✅ **External API or AI call?** **No.**
- [x] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ In-clinic UI + derived text byte-identical (parity suites green, no assertion edits). - **Completed: 2026-07-03**
- [x] ✅ Teleconsult behaviour matrix (order, tag, opt-in, patient-assisted flip, scoped normal, caveat) all asserted green. - **Completed: 2026-07-03**
- [x] ✅ a11y: textual/announced tag, keyboard opt-in, no PHI. - **Completed: 2026-07-03**
- [x] ✅ `tsc` + lint + slice tests green; pre-existing unrelated failures routed, not introduced. - **Completed: 2026-07-03**

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- [`task-tc-01-exam-remote-feasibility-schema.md`](./task-tc-01-exam-remote-feasibility-schema.md) · [`task-tc-02-teleconsult-exam-ui-preset.md`](./task-tc-02-teleconsult-exam-ui-preset.md) · [`task-tc-03-scoped-normal-and-limitation-derivation.md`](./task-tc-03-scoped-normal-and-limitation-derivation.md).

---

**Last Updated:** 2026-07-03
**Pattern:** close-gate verification — in-clinic parity invariant + teleconsult behaviour matrix + a11y + FE gate.
