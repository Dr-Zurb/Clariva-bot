# Task obj-30: Exam-card parity (summary/expand) + per-system subsection structure

> **Filename:** `task-obj-30-exam-card-parity-and-subsections.md` in `objective-tab/p7-exam-card-refinement/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Bring the structured-exam cards to **subjective `ComplaintCard` parity** and enrich each
system with grouped findings:

1. **Drop the explicit "Not examined" chip.** Default = nothing selected; an empty system is
   *implicitly* not examined (it stays absent from `examination_json`, exactly as today).
   The in-card status control offers only **Normal | Abnormal**. The doctor returns a system
   to not-examined via an explicit **clear/reset** (the trash analog) — the only way back once
   the chip is gone, so a mis-tap is always recoverable.
2. **Collapse/summary card behaviour** mirroring `ComplaintCard`: a **collapsed summary row**
   for the settled state (neutral/grey = not examined, green = normal, amber = abnormal, with a
   one-line preview = the WNL line or the joined findings), **tap to expand** to edit, a
   **collapse lip** at the bottom of the expanded body, and an inline **Normal** quick-action on
   the row so the routine "all clear" case needs no expand. All 5 systems stay *visible* (unlike
   complaints, they are a fixed list, not doctor-added), the empty ones just render quietly.
3. **Per-system subsection structure.** Enrich `exam-schema.ts` so each system groups its
   abnormal chips into labelled subsections (e.g. Resp → Inspection / Auscultation / Percussion;
   CVS → Heart sounds / Murmurs / Peripheral; Abdomen → Inspection / Palpation; CNS → Higher
   functions / Cranial nerves / Motor-sensory / Reflexes). **Subsections are an entry-time
   grouping over the existing flat `findings: string[]`** — chips stay globally-unique strings,
   so the stored shape and the derived `examination_findings` text are **unchanged** (no
   migration, `OBJ-D2`/`OBJ-D4` data model preserved).

This is the Objective analog of the subjective collapse/summary refinement, ported onto the
exam cards shipped in `obj-03`.

**Program / Phase:** objective-tab · Phase 7 (exam-card refinement — follow-up to P1)
**Plan:** [`plan-objective-tab.md`](../../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md)
**Estimated Time:** ~4–6 hours
**Status:** ✅ **COMPLETE** — 2026-06-27. **Model: Opus** (touches the locked `OBJ-D4` exam UI semantics + the `examination_findings` derived-text parity; ~5 files).

**Change Type:**
- [ ] **Update existing** — rework `ExamSystemCard`, enrich `exam-schema.ts`, add list chrome. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** [`ExamSystemCard.tsx`](../../../../../../../../frontend/components/cockpit/rx/inputs/ExamSystemCard.tsx) (always-open, tri-state radio: Not examined / Normal / Abnormal; flat abnormal chip wall + notes); [`ExamSystemList.tsx`](../../../../../../../../frontend/components/cockpit/rx/inputs/ExamSystemList.tsx) (5 cards + "Mark entire exam normal"); [`exam-schema.ts`](../../../../../../../../frontend/lib/cockpit/exam-schema.ts) (per-system `normalLine` + flat `abnormalChips`); [`ComplaintCard.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCard.tsx) (summary-row / expand / collapse-lip pattern to clone); `ExamSystemFinding { systemId, status, findings?, notes? }` + obj-01 reducer (`SET_EXAM_SYSTEM` / `CLEAR_EXAM_SYSTEM` / `MARK_ALL_EXAM_NORMAL`).
- ❌ **What's missing:** collapsed summary state; expand/collapse-lip; removal of the not-examined chip + a clear/reset; subsection grouping of chips.

**Scope Guard:**
- Expected files touched: ≤ 5 — `ExamSystemCard.tsx`, `exam-schema.ts`, `ExamSystemList.tsx`, the card/list tests, and (only if a gap is found) the exam-derivation parity test.
- **DO NOT** change the `ExamSystemFinding` shape (keep `findings: string[]` flat), **DO NOT** add a migration, **DO NOT** add structured `measurements` (deferred — use `notes` for now), **DO NOT** touch obj-01 derivation/payload, vitals, test-results, or P3 layout chrome (reorder/visibility).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Remove not-examined chip + status model
- [x] ✅ 1.1 Status control inside the card offers **Normal | Abnormal** only; nothing is selected by default (empty = absent from `examination_json` = implicitly not examined). - **Completed: 2026-06-27**
- [x] ✅ 1.2 Added an explicit **clear/reset** (`X`) → `CLEAR_EXAM_SYSTEM`; this is the only path back to not-examined. - **Completed: 2026-06-27**
- [x] ✅ 1.3 All writes stay on the existing obj-01 reducer (`SET_EXAM_SYSTEM` / `CLEAR_EXAM_SYSTEM`) — no new actions. - **Completed: 2026-06-27**

### 2. Collapse / summary card parity (clone ComplaintCard)
- [x] ✅ 2.1 **Collapsed summary row** per system: status dot (grey not-examined / green normal / amber abnormal), label, one-line preview (WNL line or joined findings), inline status control, chevron to expand. - **Completed: 2026-06-27**
- [x] ✅ 2.2 **Expanded body** (abnormal): subsection chip groups + notes + a **Done** collapse lip. Normal-expanded shows the WNL line; empty systems render as a quiet neutral row (still visible — fixed list). - **Completed: 2026-06-27**
- [x] ✅ 2.3 Keyboard + a11y: chevron/toggle `aria-expanded`; status `role=radiogroup`/`radio` keyboard-navigable; labels PHI-free; honors `disabled`. - **Completed: 2026-06-27**

### 3. Per-system subsection schema
- [x] ✅ 3.1 `exam-schema.ts`: replaced flat `abnormalChips` with labelled `subsections[]` (id/label/chips) for the 5 core systems; kept the OLDCARTS-style generic fallback. Added `ExamSubsection` type + `listExamSystemChips()` helper. - **Completed: 2026-06-27**
- [x] ✅ 3.2 Card renders subsection groups generically; chips still toggle into the **flat** `findings: string[]`. - **Completed: 2026-06-27**
- [x] ✅ 3.3 Chip vocabulary kept globally-unique per system (test asserts it) so derived text is unambiguous. - **Completed: 2026-06-27**

### 4. List chrome
- [x] ✅ 4.1 Kept **Mark entire exam normal**; added **Collapse all / Expand all** + an inline summary count ("N normal · N abnormal · N not examined") to the `ExamSystemList` header. - **Completed: 2026-06-27**

### 5. Verification & Testing
- [x] ✅ 5.1 Card/list tests rewritten: no not-examined chip; default empty; one-tap Normal; Abnormal → subsection chips → `findings`; notes; clear/reset; collapse/expand-all; counts. - **Completed: 2026-06-27**
- [x] ✅ 5.2 **Derived-text parity preserved** — `examDerivationParity` / `rxFormContext.exam` / `objectiveTemplateParity` / `objectiveLayoutParity` / `apply-objective-template` / `objective-specialty-packs` all green; no contract change (findings stay flat). - **Completed: 2026-06-27**
- [x] ✅ 5.3 Slice green: 106 tests pass across the exam/objective suites; eslint clean on touched files; `tsc` reports no errors in touched files (pre-existing unrelated errors elsewhere). - **Completed: 2026-06-27**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/inputs/ExamSystemCard.tsx (summary/expand, remove not-examined chip, subsection groups, clear/reset)
UPDATE: frontend/lib/cockpit/exam-schema.ts (flat abnormalChips → labelled subsections[]; keep fallback)
UPDATE: frontend/components/cockpit/rx/inputs/ExamSystemList.tsx (collapse-all / expand-all; optional summary count)
UPDATE: frontend/components/cockpit/rx/inputs/__tests__/ExamSystemList.test.tsx (+ card behaviour)
VERIFY (no change unless gap): frontend/.../__tests__/examDerivationParity.test.tsx
DO NOT TOUCH: ExamSystemFinding shape; migrations; obj-01 derivation/payload; vitals; test-results; P3 layout chrome
```

**When updating existing code:** (MANDATORY)
- [ ] Audit `ExamSystemCard` / `ExamSystemList` consumers + tests before reshaping the card.
- [ ] Confirm `apply-objective-template.ts` + `objective-specialty-packs.ts` (P4) still round-trip the new subsection chips into `findings[]`.
- [ ] Keep `findings` flat — the subsection grouping is render-only.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **No data-contract change.** `ExamSystemFinding` stays `{ systemId, status, findings: string[], notes? }`; "not examined" stays represented by *absence*. `OBJ-D4` data model is **preserved** — only the UI affordance (no explicit chip) changes.
- **No migration, no structured measurements (v1).** Key/value measurements (JVP cm, Power 4/5) are deferred — use `notes`. Structured measurements would touch the derived-text contract + P4 payloads and need a re-lock first.
- **Clone, don't invent.** Reuse `ComplaintCard`'s summary/expand/collapse-lip chrome and the existing chip styles — no new primitive.
- **Derived text is sacred.** `examination_findings` must round-trip unchanged for equivalent selections (`OBJ-D2`).
- No PHI in logs/labels; respect `disabled`.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** directly — writes via the existing obj-01 reducer; no schema/migration.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] No "Not examined" chip; empty system = implicitly not examined; **Normal | Abnormal** only, with a working clear/reset back to not-examined.
- [x] Cards collapse to a summary row (correct status dot + preview) and expand to edit with a collapse lip; one-tap Normal works; all 5 systems stay visible.
- [x] Each system shows labelled subsection chip groups writing into the flat `findings[]`; fallback still renders unknown systems.
- [x] `examination_findings` derived text is parity-preserved for equivalent selections.
- [x] a11y passes; lint + slice tests green; `tsc` clean for touched files.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Follow-up refinement to P1's `obj-03` exam cards, started 2026-06-27. Decisions confirmed with
owner: (a) remove the not-examined chip — empty = implicitly not examined (less "negative" for
the doctor); (b) match the subjective card collapse/summary behaviour; (c) rich per-system
subsections. Kept migration-free by treating subsections as an entry-time grouping over the
existing flat `findings[]`. If this is promoted as a formal phase, register P7 + this `obj-30`
item in [`plan-objective-tab.md`](../../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md)
and add the batch plan + execution-order siblings.

---

## 🔗 Related Tasks

- [`task-obj-03-exam-card-and-host.md`](../../p1-structured-exam/Tasks/task-obj-03-exam-card-and-host.md) — the original exam card this refines.
- [`task-obj-02-exam-system-registry.md`](../../p1-structured-exam/Tasks/task-obj-02-exam-system-registry.md) — the `exam-schema.ts` registry being enriched.
- [`task-obj-04-derivation-close-gate.md`](../../p1-structured-exam/Tasks/task-obj-04-derivation-close-gate.md) — the derived-text parity gate this must keep green.

---

**Last Updated:** 2026-06-27
**Pattern:** subjective `ComplaintCard` summary/expand/collapse-lip ported to exam systems; flat-findings subsection grouping.
**Reference:** `process/CODE_CHANGE_RULES.md`
