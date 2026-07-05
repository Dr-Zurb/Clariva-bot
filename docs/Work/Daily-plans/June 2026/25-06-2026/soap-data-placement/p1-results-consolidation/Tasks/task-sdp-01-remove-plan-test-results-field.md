# Task sdp-01: Remove the Plan-side `TestResultsField` (Objective is the single results home)

> **Filename:** `task-sdp-01-remove-plan-test-results-field.md` in `soap-data-placement/p1-results-consolidation/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Remove the duplicate test-results editor from the **Plan** section so the **Objective** `TestResultsList` (structured rows + the legacy `test_results` free-text textarea) is the single authoring home for results. Today the same `prescriptions.test_results` value is editable in two panes; this consolidates it to one. **Frontend-only — no schema, no API, no migration, no data loss:** `buildRxPayload` already derives `test_results` from the structured rows with legacy free-text passthrough, so removing the Plan UI changes nothing downstream.

**Program / Phase:** soap-data-placement · Phase 1 (results consolidation)
**Batch:** [`plan-p1-soap-data-placement-results-consolidation-batch.md`](../plan-p1-soap-data-placement-results-consolidation-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-soap-data-placement-results-consolidation.md`](./EXECUTION-ORDER-p1-soap-data-placement-results-consolidation.md)
**Estimated Time:** ~30–45 minutes
**Status:** ✅ **COMPLETE** — **Completed: 2026-06-25** (Auto/Sonnet).

**Change Type:**
- [ ] **Update existing** (`PlanSection`) — remove a field. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `TestResultsField` in `PlanSection.tsx` (a free-text textarea bound to `fields.testResults`) **and** the Objective `TestResultsList` legacy textarea (`showLegacyTextarea`, same `fields.testResults`) + structured rows. `buildRxPayload` derives `test_results` from `testResultsStructured` (or legacy free-text fallback).
- ❌ **What's wrong:** the Plan-side editor is a second writer for a field that belongs to Objective.

**Scope Guard:**
- Expected files touched: ≤ 3 — `PlanSection.tsx` (remove component + render); the Plan-section / composition tests that assert the field; (optional) a parity assertion. **DO NOT** touch the Objective legacy textarea (SDP-D5 keeps it), the derivation in `buildRxPayload`, the `testResults` field on `RxFormFields`, or any schema/API.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Remove the Plan-side field
- [x] ✅ 1.1 Delete the `TestResultsField` component and its render call in `PlanSection.tsx`. - **Completed: 2026-06-25**
- [x] ✅ 1.2 Confirm no other Plan-side reference to `fields.testResults` remains; leave `RxFormFields.testResults` intact (still written from Objective + derived). Bonus: this also resolves a duplicate `id="testResults"` (Plan + Objective both used it). - **Completed: 2026-06-25**

### 2. Confirm Objective is unchanged
- [x] ✅ 2.1 Verify the Objective `TestResultsList` still renders structured rows + the legacy `test_results` textarea escape hatch (no change needed). - **Completed: 2026-06-25**

### 3. Verification & Testing
- [x] ✅ 3.1 No test asserted the Plan-side field (composition-root mocks `PlanSection`; all results tests target the Objective `TestResultsList` + `buildRxPayload`). Parity assertions in `objectiveResultsParity` / `rxFormContext.testResults` cover the no-regression claim. - **Completed: 2026-06-25**
- [x] ✅ 3.2 Lint clean on `PlanSection.tsx`; targeted vitest slice **55/55 pass** (6 files: objectiveResultsParity, rxFormContext.testResults, TestResultsList, objectiveTemplateParity, objectiveLayoutParity, PrescriptionFormCompositionRoot). `tsc` repo-wide errors are pre-existing unrelated WIP noise — none in `PlanSection.tsx` or the touched slice. - **Completed: 2026-06-25**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/sections/PlanSection.tsx (remove TestResultsField + render)
UPDATE: frontend/components/cockpit/rx/sections/__tests__/* and/or __tests__/PrescriptionFormCompositionRoot.test.tsx (drop Plan-field assertions; add/keep payload parity)
DO NOT TOUCH: Objective TestResultsList legacy textarea (SDP-D5); buildRxPayload derivation; RxFormFields.testResults; any schema/API/migration
```

**When updating existing code:**
- [ ] Remove cleanly — no dead imports, no orphaned helpers.
- [ ] Keep the escape hatch in Objective; this task only removes the *duplicate* in Plan.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Single authoring home (SDP-D1).** Results are authored in Objective only.
- **Additive/no-loss (SDP-D5).** The Objective legacy textarea + the `testResults` field + the derivation all stay; only the Plan duplicate goes.
- **No downstream change.** PDF / SMS / snapshot read the derived `test_results` exactly as before.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No new writes/reads** — removes a UI writer for an existing field; the field still writes from Objective.
  - [ ] **RLS verified?** N/A — no schema/API/policy change.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**
- [ ] **Migration?** **No.** (Frontend-only — no Opus trigger.)

---

## ✅ Acceptance & Verification Criteria

- [ ] `TestResultsField` is gone from Plan in all mount surfaces; Objective keeps structured rows + the legacy escape hatch.
- [ ] `buildRxPayload` output is byte-identical for the same form state before/after; no field dropped.
- [ ] Tests updated; `tsc`/lint/tests green for the slice.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The smallest, safest slice of the SOAP data-placement program — aligns the obvious duplication before the larger P2 (per-complaint media) and P3 (results timeline) work.

---

## 🔗 Related Tasks

- P2 `sdp-02..04` (per-complaint symptom media) and P3 `sdp-05..07` (investigations & results timeline) — drafted in the [product plan](../../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md), not yet promoted.

---

**Last Updated:** 2026-06-25
**Pattern:** remove a duplicate field writer; rely on the shipped derived-results contract for no-loss.
**Reference:** `process/CODE_CHANGE_RULES.md`
