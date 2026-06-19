# Task obj-15: output-parity + engine round-trip + a11y close-gate + verification

> **Filename:** `task-obj-15-layout-close-gate.md` in `objective-tab/p3-layout-engines/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

The phase-closing gate: prove that the Phase-3 layout engines are **view-only** — that no
reorder / collapse / hidden / custom / modality-seed permutation changes the derived
`examination_findings` / `test_results` / `vitals_*` or the PDF/SMS/snapshot by a single byte
(P3-D3) — that every engine **round-trips** (order/collapse/hidden/custom survive a remount and
re-apply as the per-doctor default), and that the whole surface is accessible. Then run the
verification gate. Same parity-fixture rigor that made P1's `obj-04` and the subjective P8/P10
close-gates Opus.

**Program / Phase:** objective-tab · Phase 3 (layout engines)  
**Batch:** [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./EXECUTION-ORDER-p3-objective-tab-layout-engines.md)  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ **COMPLETE** (2026-06-19) — close-gate test file (12 assertions) green; `tsc`/eslint clean; frontend objective+layout+parity suites (761) and the backend SMS-summary contract (4) pass. No engine drift found — the gate held with no source fixes needed.

**Change Type:**
- [ ] **Tests + verification** — assertion-first close-gate; no new feature code (fixes only if a contract breaks).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-09..14 (registry, settings, reorder/collapse, visibility/menu, custom sections, modality/specialty seed); P1 `examDerivationParity.test.tsx` (byte-parity fixture pattern); subjective P8/P10 output-parity + remount tests.
- ❌ **What's missing:** the cross-cutting parity + round-trip + a11y proof for the objective layout engines.

**Scope Guard:**
- Expected files touched: ≤ 3 (one comprehensive close-gate test file + minimal fixes if a contract breaks + plan/checkbox updates).
- **No** new features. If a parity contract breaks, fix the *source* engine, do not weaken the test.

**Reference Documentation:**
- [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Output byte-parity (P3-D3)
- [x] ✅ 1.1 For a fixed prescription, `buildRxPayload` emits identical output across every permutation of order, collapse, hidden set, and modality/specialty seed — layout state never reaches the payload. - **Completed: 2026-06-19** Driven through the REAL component tree (reorder via keyboard grip, collapse toggle, hide via menu, four modality/specialty seeds) — full-payload JSON byte-identical each time. *Structural note: layout lives in `ObjectiveSection` local state + `doctor_settings`, never in `RxFormFields`, so `buildRxPayload` is independent of it by construction.*
- [x] ✅ 1.2 A **hidden** section with content still appears in the derived output (hiding is view-only). - **Completed: 2026-06-19** (`test_results` hidden → payload still carries "Hb 12.5 g/dL"; custom block still in `examination_findings`).
- [x] ✅ 1.3 Legacy-only row derives **byte-identical** to today; save→reload→re-save fixed point; PDF/SMS/snapshot unchanged. - **Completed: 2026-06-19** (frontend passthrough + backend `notification-prescription-summary` "byte-identical SMS whether or not exam fields present").

### 2. Engine round-trips
- [x] ✅ 2.1 Order persists, re-applies as the per-doctor default after a remount; merge tolerant of stale/unknown ids. - **Completed: 2026-06-19**
- [x] ✅ 2.2 Collapse state survives a remount. - **Completed: 2026-06-19**
- [x] ✅ 2.3 Hidden set survives a remount; all-hidden empty-state renders; trigger reachable. - **Completed: 2026-06-19**
- [x] ✅ 2.4 Custom content round-trips via `examination_findings`; per-doctor default re-applies; `custom_block:*` never reaches the persisted order/hidden set and is never offered for hiding (delete-only). - **Completed: 2026-06-19**
- [x] ✅ 2.5 Modality/specialty seed applies as default; explicit override wins wholesale; seed never persisted on mount. - **Completed: 2026-06-19**

### 3. Accessibility sweep
- [x] ✅ 3.1 Reorder grips keyboard-operable (ArrowUp/Down, focus, `aria`). - **Completed: 2026-06-19**
- [x] ✅ 3.2 "Manage sections" menu: `aria-expanded` on trigger, `aria-pressed` toggle state, screen-reader labels. - **Completed: 2026-06-19**
- [x] ✅ 3.3 Custom-section fields labelled (`Section title`/`Notes`); `disabled` mode read-only (no inputs) with no autosave. - **Completed: 2026-06-19**

### 4. Verification gate
- [x] ✅ 4.1 `npx tsc --noEmit` clean for the slice. - **Completed: 2026-06-19**
- [x] ✅ 4.2 eslint clean on the touched file. - **Completed: 2026-06-19**
- [x] ✅ 4.3 Targeted frontend objective + layout + parity suites green (761); backend SMS-summary contract green (4, via jest). - **Completed: 2026-06-19** *Routed (not introduced): the pre-existing subjective-refactor WIP failures (`SubjectiveSection.*`, `CustomSubsectionsField`) are unrelated — confirmed by stash-isolation in obj-14; untouched here.*
- [x] ✅ 4.4 Mark the batch-plan cross-cutting gate + per-task checkboxes complete. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/sections/__tests__/objectiveLayoutParity.test.tsx ✅
UPDATE: docs/.../p3-layout-engines/plan-p3-objective-tab-layout-engines-batch.md (gate checkboxes) ✅
UPDATE: docs/.../p3-layout-engines/Tasks/task-obj-09..14 (mark complete) ✅
```

**No source fixes were required** — every Phase-3 engine held the view-only / round-trip contract as written.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Assertion-first** — the gate encodes the P3-D3 view-only contract + the engine round-trips. If a permutation drifts the output, fix the engine; never relax the assertion.
- **Reuse the P1 parity-fixture shape** so the objective close-gate reads like `obj-04`.
- Pre-existing repo-wide failures (unrelated WIP) are **routed, not introduced** — document them, don't fix out of scope.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** (tests + verification; fixes only if a contract breaks).
- [ ] **Any PHI in logs?** **No** (fixtures use synthetic data).
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Output byte-parity across every layout permutation; hidden-with-data still prints; legacy byte-identical.
- [x] ✅ Order/collapse/hidden/custom round-trip a remount as per-doctor defaults; seed defaults + override-wins.
- [x] ✅ a11y sweep passes; disabled custom sections read-only.
- [x] ✅ Verification gate green; pre-existing unrelated failures routed.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-09-objective-section-registry-and-renderer.md`](./task-obj-09-objective-section-registry-and-renderer.md) … [`task-obj-14-modality-specialty-default-visibility.md`](./task-obj-14-modality-specialty-default-visibility.md) — everything this gate proves.

---

**Last Updated:** 2026-06-19  
**Pattern:** P1 `obj-04` derivation byte-parity close-gate + subjective P8/P10 output-parity + remount tests.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
