# Task vh-03: Exam depth cue across the bespoke exam cards

> **Filename:** `task-vh-03-exam-depth.md` in `soap-card-visual-hierarchy/Tasks/`.
> **Links:** batch plan [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-soap-card-visual-hierarchy.md`](./EXECUTION-ORDER-soap-card-visual-hierarchy.md). Code paths **repo-relative**.

---

## 📋 Task Overview

The largest slice, and deliberately scoped as its own task. The exam systems (General, CVS, Respiratory, Abdomen, CNS) nest system → subsection → finding/chip-group, but — unlike Social History and Chief Complaints — the exam cards are **bespoke** (`ExamSystemCard`, `ExamSubsectionCollapsible`, `Exam*FindingCard`, `Exam*ChipGroupCard`), not the shared `CollapsibleContainer`/`CollapsibleEntryCard`. So the depth-tone cue has to be threaded through by hand across 5+ files, reusing the vh-01 `useDepthToneSurface()` helper.

Because the exam feeds the **locked** `examination_findings` derivation and the objective-layout parity gate, this task must prove that **derivation + layout output stay byte-identical** — this is presentation only.

**Program / Batch:** soap-card-visual-hierarchy · single batch (Wave 3)
**Plan:** [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md)
**Estimated Time:** ~3–5 hours
**Status:** ✅ Done (2026-07-05). **Model: Opus** — touches all 5 bespoke exam finding cards + the shared subsection wrapper + the system card with new surface semantics → the agent-contract "5+ file refactor" escalation. No migration/PHI/RLS.

**Change Type:**
- [ ] ✅ **Update existing** — thread depth tone/rail through the bespoke exam cards. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** `ExamSystemCard` (L1 per-system), `ExamSubsectionCollapsible` (shared subsection wrapper with the sticky header + "In-person only"/"Patient-assisted" tag slot), the 5 `Exam*FindingCard.tsx`, the `Exam*ChipGroupCard.tsx`; scroll in `frontend/lib/cockpit/exam-card-scroll.ts`; parity in `examDerivationParity` / `objectiveLayoutParity`.
- ⚠️ **Depends on vh-01:** consume `useDepthToneSurface()` — do not re-derive tint classes per card.
- ⚠️ **Interacts with teleconsult-exam (02-07):** the subsection wrapper already carries de-emphasis/tag semantics; the depth tone must **layer under** those, not fight them.

**Scope Guard:**
- Expected files touched: `ExamSystemCard.tsx`, `ExamSubsectionCollapsible.tsx`, `ExamGeneralFindingCard.tsx`, `ExamCvsFindingCard.tsx`, `ExamRespFindingCard.tsx`, `ExamAbdFindingCard.tsx`, `ExamCnsFindingCard.tsx`, and the `Exam*ChipGroupCard.tsx` as needed.
- **DO NOT** change exam derivation, chip vocabulary, subsection order, the teleconsult de-emphasis/tag logic, or any scroll offset. **DO NOT** weaken a parity assertion to make a visual change pass.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md` · the teleconsult-exam batch (`docs/Work/Daily-plans/July 2026/02-07-2026/teleconsult-exam/`).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Thread the helper
- [x] ✅ 1.1 Establish the depth baseline at `ExamSystemCard` (L1) and provide the depth context down into subsections. — **Completed: 2026-07-05** (seeds `CollapsibleDepthProvider depth={0}` into the body; card stays raised `bg-card`.)
- [x] ✅ 1.2 Apply tone/rail in `ExamSubsectionCollapsible` (L2) via the vh-01 helper — layered **under** the existing teleconsult de-emphasis + tag treatment. — **Completed: 2026-07-05** (recessed `bg-muted/30` + rail; de-emphasised subsections keep their exact muted/dashed treatment and drop the rail.)
- [x] ✅ 1.3 Apply tone/rail in each `Exam*FindingCard` / `Exam*ChipGroupCard` (L3) consistently across all 5 systems. — **Completed: 2026-07-05** (added `tone.rail` spine to all 5 finding cards + 3 chip-group cards; state-driven surfaces kept.)

### 2. Coexistence with teleconsult semantics
- [x] ✅ 2.1 An `in_person_only` subsection: greyed + collapsed + tag still reads correctly with the depth tone applied (no double-muting that makes text illegible). — **Completed: 2026-07-05** (de-emphasis wins; rail suppressed when de-emphasised.)
- [x] ✅ 2.2 Assessable-first ordering + opt-in expand + patient-assisted flip unchanged. — **Completed: 2026-07-05** (no logic touched; `teleconsultExamCloseGate` green.)

### 3. Parity (regression guard)
- [x] ✅ 3.1 `examDerivationParity` — no assertion changed, green (in-clinic **and** teleconsult). — **Completed: 2026-07-05**
- [x] ✅ 3.2 `objectiveLayoutParity` / `ObjectiveSection` — no derived-text/layout assertion changed. — **Completed: 2026-07-05** (green with adequate timeout; default-5s timeouts are a pre-existing environmental flake, identical at the clean baseline.)
- [x] ✅ 3.3 `exam-card-scroll` behaviour unchanged. — **Completed: 2026-07-05**

### 4. Verification gate
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit` — no new errors in touched files. — **Completed: 2026-07-05**
- [x] ✅ 4.2 `cd frontend && npm run lint` clean on touched files. — **Completed: 2026-07-05**
- [x] ✅ 4.3 `cd frontend && npm test` green for the exam/objective slice. — **Completed: 2026-07-05** (examDerivationParity, exam-findings, exam-card-scroll, ExamSystemList, teleconsultExamCloseGate, objectiveLayoutParity.)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/inputs/ExamSystemCard.tsx
UPDATE: frontend/components/cockpit/rx/inputs/ExamSubsectionCollapsible.tsx
UPDATE: frontend/components/cockpit/rx/inputs/ExamGeneralFindingCard.tsx
UPDATE: frontend/components/cockpit/rx/inputs/ExamCvsFindingCard.tsx
UPDATE: frontend/components/cockpit/rx/inputs/ExamRespFindingCard.tsx
UPDATE: frontend/components/cockpit/rx/inputs/ExamAbdFindingCard.tsx
UPDATE: frontend/components/cockpit/rx/inputs/ExamCnsFindingCard.tsx
UPDATE (as needed): frontend/components/cockpit/rx/inputs/Exam*ChipGroupCard.tsx
REUSE: useDepthToneSurface() / canonical ladder from vh-01
VERIFY (green, no assertion change): examDerivationParity / objectiveLayoutParity / ObjectiveSection / exam-card-scroll
DO NOT TOUCH: exam derivation; chip vocabulary; subsection order; teleconsult de-emphasis/tag logic; scroll offsets
```

**When updating existing code:** (MANDATORY)
- [ ] Reuse the vh-01 helper across all 5 systems — one consistent depth treatment, no per-card divergence.
- [ ] Depth tone layers under the teleconsult de-emphasis; never overrides the "In-person only"/"Patient-assisted" tag legibility.
- [ ] If a parity suite fails, the tone change is wrong — fix the presentation, never the assertion.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Presentation only.** Derivation + layout are invariants (VH-D6; mirrors the teleconsult-exam parity gate).
- **Consistent across systems.** All 5 exam bodies read the same depth treatment.
- **No palette edits; status color stays in chips/tags** (VH-D1).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** **N** — presentational only.
- [ ] ✅ **Any PHI in logs?** **No.**
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Tone + rail visible at system / subsection / finding levels across all 5 exam systems.
- [ ] Teleconsult de-emphasis + tags remain correct and legible with tone applied.
- [ ] Exam derivation + layout parity suites green, **no assertion edits**.
- [ ] `tsc` + lint + exam/objective tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Depends on [`task-vh-01-tint-ladder-and-surface-helper.md`](./task-vh-01-tint-ladder-and-surface-helper.md). Coordinates with the teleconsult-exam batch (`02-07-2026/teleconsult-exam/`).

---

**Last Updated:** 2026-07-05
**Pattern:** thread the shared depth-tone helper through bespoke (non-shared-collapsible) cards; prove derivation + layout byte-parity.
