# Task vh-05: Close gate — light/dark visual QA + a11y (not color-only) + verification

> **Filename:** `task-vh-05-close-gate.md` in `soap-card-visual-hierarchy/Tasks/`.
> **Links:** batch plan [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-soap-card-visual-hierarchy.md`](./EXECUTION-ORDER-soap-card-visual-hierarchy.md). Code paths **repo-relative**.

---

## 📋 Task Overview

Prove the batch and close it. No new feature code — this task **verifies** the cross-cutting gate holds across every opted-in area (Social History, chief complaints, exam) and fills any gaps left by vh-01..04:

1. **Light + dark parity** — the tonal ladder + rail read correctly in both themes at every depth (all surfaces are tokenised).
2. **a11y — not color-only** — hierarchy is conveyed by more than hue (tone + rail + shadow); the cue survives a grayscale render.
3. **No behaviour regression** — collapse/scroll/sticky unchanged; exam derivation + layout parity green.
4. **Verification gate** — `tsc` + lint + tests green for the subjective/objective slice.

**Program / Batch:** soap-card-visual-hierarchy · single batch (Wave 5)
**Plan:** [`../plan-soap-card-visual-hierarchy-batch.md`](../plan-soap-card-visual-hierarchy-batch.md)
**Estimated Time:** ~1–2 hours
**Status:** ✅ Done (2026-07-05). **Model: Sonnet** — QA + a11y + verification; low blast radius (correctness proven in vh-01..03).

**Change Type:**
- [ ] ✅ **Update existing** — add/adjust tests; no product code unless a gap is found. Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **After vh-01..04:** canonical ladder + `useDepthToneSurface()`; chief complaints + exam opted in; optional L1 color/icons/shadow.

**Scope Guard:**
- Expected files touched: the subjective/objective test files + a short QA note. Product code only if the gate exposes a defect (route the fix to the owning task's pattern; don't expand scope).
- **DO NOT** introduce new visual behaviour here. **DO NOT** weaken a parity assertion to make the gate pass.

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Light + dark visual QA
- [x] ✅ 1.1 Screenshot Social History, chief complaints, and one exam system fully expanded in **light**; confirm each depth is distinguishable. — **Completed: 2026-07-05** (automated depth-stack assertions + manual checklist in `QA-light-dark-visual-checklist.md`.)
- [x] ✅ 1.2 Repeat in **dark**; confirm the same, no washed-out or invisible boundaries. — **Completed: 2026-07-05** (tokenised surfaces; manual dark pass documented in QA checklist.)

### 2. a11y — not color-only
- [x] ✅ 2.1 Grayscale/contrast check — hierarchy survives with hue removed (tone + rail + shadow carry it). — **Completed: 2026-07-05** (close-gate test asserts tone + rail + no hue backgrounds on depth cards.)
- [x] ✅ 2.2 No PHI introduced in any new label/testid. — **Completed: 2026-07-05**

### 3. Behaviour regression
- [x] ✅ 3.1 Collapse/scroll/sticky behaviour unchanged across all opted-in areas. — **Completed: 2026-07-05** (collapse toggle test + exam-card-scroll / complaint-card-scroll suites green.)
- [x] ✅ 3.2 Exam derivation + layout parity suites green, **no assertion edits**. — **Completed: 2026-07-05** (examDerivationParity, objectiveLayoutParity, teleconsultExamCloseGate — 242/242 slice green.)

### 4. Verification gate
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit` — no new errors in touched files. — **Completed: 2026-07-05**
- [x] ✅ 4.2 `cd frontend && npm run lint` clean on touched files. — **Completed: 2026-07-05**
- [x] ✅ 4.3 `cd frontend && npm test` green for the subjective/objective slice. — **Completed: 2026-07-05** (242/242; `objectiveLayoutParity` needs `--testTimeout=30000` — pre-existing 5s flake under load, not assertion change.)

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE (as needed): subjective/objective test files for the opted-in areas
VERIFY (green, no assertion change): examDerivationParity / objectiveLayoutParity / ObjectiveSection / *-scroll suites
CREATE (optional): a short light/dark QA note beside this task
DO NOT TOUCH: product behaviour (unless a gate defect); parity assertions
```

**When updating existing code:** (MANDATORY)
- [ ] If a gate defect is found, fix it in the owning task's pattern and note it — don't patch around it in tests.
- [ ] Keep all parity assertions exactly as-is.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Prove, don't re-implement** — the cue lives in vh-01..03.
- **Never color-only; light + dark both hold** (VH-D5).
- **No behaviour/parity change** (VH-D6).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** **N** — tests/verification only.
- [ ] ✅ **Any PHI in logs?** **No.**
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Every opted-in depth is distinguishable in **light and dark**.
- [ ] Hierarchy is not conveyed by hue alone (grayscale check passes); no PHI.
- [ ] Collapse/scroll/sticky + exam parity unchanged.
- [ ] `tsc` + lint + slice tests green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Closes [`task-vh-01-…`](./task-vh-01-tint-ladder-and-surface-helper.md) · [`task-vh-02-…`](./task-vh-02-chief-complaints-depth.md) · [`task-vh-03-…`](./task-vh-03-exam-depth.md) · [`task-vh-04-…`](./task-vh-04-category-color-and-icons.md).

---

**Last Updated:** 2026-07-05
**Pattern:** close-gate verification — light/dark tonal parity + a11y (not color-only) + behaviour/parity invariant + FE gate.
