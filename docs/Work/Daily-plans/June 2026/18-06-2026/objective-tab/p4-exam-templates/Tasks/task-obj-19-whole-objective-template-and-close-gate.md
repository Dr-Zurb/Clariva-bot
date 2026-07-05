# Task obj-19: Whole-objective template upgrade + output-parity / apply-round-trip / a11y close-gate (Phase 4 closer)

> **Filename:** `task-obj-19-whole-objective-template-and-close-gate.md` in `objective-tab/p4-exam-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 4. Fold the per-section scopes into the **whole-objective** template (`objective_full`) so one
"Templates" button captures + applies exam + vitals + test results + custom sections under a combined
applying state, then run the **close-gate**: prove output byte-parity (hand-entry vs. template/pack-applied
→ identical `buildRxPayload`), prove the apply → save → reload → re-apply fixed point, run the a11y sweep,
and run the verification gate. Mirrors subjective `subj-18` + this program's `obj-15`.

**Program / Phase:** objective-tab · Phase 4 (exam templates + specialty packs)  
**Batch:** [`plan-p4-objective-tab-exam-templates-batch.md`](../plan-p4-objective-tab-exam-templates-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p4-objective-tab-exam-templates.md`](./EXECUTION-ORDER-p4-objective-tab-exam-templates.md)  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ **COMPLETE (2026-06-19)** — **Opus**. Depends on **obj-17 AND obj-18**.

**Change Type:**
- [ ] **Update existing** (whole-objective template) + **test/close-gate**. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-17's scoped save/apply engine + reusable button; obj-18's specialty packs; the P1 derived-text parity tests + P3's [`objectiveLayoutParity.test.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/__tests__/objectiveLayoutParity.test.tsx) (the parity-fixture shape to mirror); `buildRxPayload` in [`RxFormContext.tsx`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx).
- ❌ **What's missing:** the composed `objective_full` save/apply path (one button, combined state); the output-parity + apply-round-trip + a11y close-gate tests.

**Scope Guard:**
- Expected files touched: ≤ 5 (the whole-objective button/header; the apply engine's `objective_full` composition; the parity/round-trip/a11y test file; tiny doc ticks). **No** new migration, **no** new server surface.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Whole-objective template
- [x] ✅ 1.1 `objective_full` save composes obj-17's per-scope save payloads (exam + vitals + test results + custom sections) into one bundle. - **Completed: 2026-06-19**
- [x] ✅ 1.2 `objective_full` apply dispatches all composed reducer actions behind **one** combined "Applying…" state + one result summary (mirror subj-18's orchestration; no server step here, so no partial-failure path). - **Completed: 2026-06-19**
- [x] ✅ 1.3 Rename/confirm the global objective button label → **"Templates"** (P4-D6); `data-testid` consistent with subjective (`objective-template-trigger` / `objective-template-save-trigger`). - **Completed: 2026-06-19**

### 2. Output byte-parity close-gate (P4-D3 / OBJ-D2)
- [x] ✅ 2.1 For a rich fixture, assert `buildRxPayload` (`examination_findings`, `test_results`, all `vitals_*`) is **byte-identical** whether the content was hand-entered or filled by applying a scoped template / `objective_full` / a specialty pack. - **Completed: 2026-06-19**
- [x] ✅ 2.2 Assert no template/pack state reaches `buildRxPayload` except through normal form state (no extra keys, no layout/visibility leakage). - **Completed: 2026-06-19**
- [x] ✅ 2.3 Re-assert legacy/empty rows derive byte-identically. - **Completed: 2026-06-19**

### 3. Apply round-trip fixed point
- [x] ✅ 3.1 apply → save (as `objective_full`) → reload (remount) → re-apply yields the same form state + same derived payload (stable fixed point). - **Completed: 2026-06-19**
- [x] ✅ 3.2 Per-section round-trip: a `vitals` / `exam_cvs` / `objective_custom_block` template survives save+reapply unchanged; other sections untouched. - **Completed: 2026-06-19**

### 4. Accessibility sweep
- [x] ✅ 4.1 Every Templates button + the picker + the specialty-pack affordance are keyboard-operable and labelled; `disabled` (read-only) mode hides the buttons. - **Completed: 2026-06-19**

### 5. Verification gate
- [x] ✅ 5.1 `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green (route any pre-existing unrelated failures — do not fix out of scope). - **Completed: 2026-06-19**
- [x] ✅ 5.2 Tick the batch plan's cross-cutting acceptance gate + flip Phase 4 status; update the program README P4 row. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/apply-objective-template.ts (objective_full composition)
UPDATE: frontend/components/cockpit/rx/.../the whole-objective Templates button + header label
CREATE: frontend/components/cockpit/rx/sections/__tests__/objectiveTemplateParity.test.tsx (parity + round-trip + a11y)
UPDATE: the batch plan + program README (status ticks)
DO NOT TOUCH: buildRxPayload derivation logic; obj-16 migration; obj-17 per-scope internals (compose them)
```

**When updating existing code:**
- [ ] Compose, don't fork — `objective_full` = the union of obj-17's per-scope save/apply, orchestrated under one state.
- [ ] Mirror `objectiveLayoutParity.test.tsx`'s fixture + assertion style for the parity gate.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **View/content-only against output (P4-D3 / OBJ-D2).** Templates + packs fill the same structured form state hand-entry fills; the derived `examination_findings`/`test_results`/`vitals_*` never change byte-wise. This is the binding contract obj-19 proves.
- **One combined state (clone subj-18).** Full apply shows one "Applying…"; since objective has no server step, there is no partial-failure branch — keep it simple.
- **"Templates" everywhere (P4-D6).**
- **Don't fix out-of-scope test failures** — route pre-existing/unrelated suite noise (e.g. independent subjective refactor failures) per the contract; do not expand scope.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — composes obj-16/17 template paths (per-doctor); no new surface.
  - [ ] **RLS verified?** **Yes** — inherits obj-16's doctor-scoped paths.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Whole-objective template captures + applies exam + vitals + test results + custom sections under one "Templates" button with a combined applying state; per-section behaviour unchanged.
- [ ] **Output byte-parity:** hand-entry vs. template/pack-applied → identical `buildRxPayload`; PDF/SMS/snapshot unchanged; legacy rows byte-identical; no template state leaks into the payload.
- [ ] Apply → save → reload → re-apply is a stable fixed point (whole + per-section).
- [ ] a11y: buttons/picker/pack affordance keyboard + screen-reader operable; read-only mode hides them.
- [ ] `tsc`/lint/test green; batch plan gate ticked; Phase 4 marked complete; README updated.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Closes the objective templating story: every objective section has its own scoped template, specialty packs
seed content, the whole-objective bundle composes them — and the derived output is provably unchanged. This
is the P4 analog of obj-15 (layout close-gate) + subj-18 (whole-section upgrade).

---

## 🔗 Related Tasks

- [`task-subj-18-whole-subjective-template-upgrade.md`](../../../../03-06-2026/subjective-tab/p6-section-templates/Tasks/task-subj-18-whole-subjective-template-upgrade.md) — the whole-section upgrade this mirrors.
- [`task-obj-15-layout-close-gate.md`](../../p3-layout-engines/Tasks/task-obj-15-layout-close-gate.md) — the P3 close-gate whose parity-fixture rigor this reuses.
- [`task-obj-17-…`](./task-obj-17-form-state-scoped-objective-templates.md) · [`task-obj-18-…`](./task-obj-18-specialty-exam-packs.md) — composed here.

---

**Last Updated:** 2026-06-19  
**Pattern:** compose the scoped objective apply paths into one whole-objective template + prove output byte-parity / apply round-trip / a11y, then close the phase gate (mirror subj-18 + obj-15).  
**Reference:** `process/CODE_CHANGE_RULES.md`
