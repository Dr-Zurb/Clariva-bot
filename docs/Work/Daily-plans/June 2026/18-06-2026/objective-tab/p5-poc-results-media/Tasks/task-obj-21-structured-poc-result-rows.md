# Task obj-21: Structured POC / result-row UI (`TestResultRow` cards + patient-brought & in-clinic-POC sections)

> **Filename:** `task-obj-21-structured-poc-result-rows.md` in `objective-tab/p5-poc-results-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Surface obj-20's structured rows in the Objective tab: build a `TestResultRow` card (name · value · unit · date ·
interpretation chip · source toggle) — the Zone-C analog of P1's `ExamSystemCard` — and register two
registry-aware Objective sections (**patient-brought reports** + **in-clinic POC**) so P3's reorder / collapse /
visibility apply for free. Keep the single `test_results` textarea as the escape hatch (OBJ-D7). **Form-state /
reducer only — no schema, no derivation changes** (obj-20 owns those), **no media** (obj-22), **no templates**
(obj-23).

**Program / Phase:** objective-tab · Phase 5 (point-of-care results + media)  
**Batch:** [`plan-p5-objective-tab-poc-results-media-batch.md`](../plan-p5-objective-tab-poc-results-media-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p5-objective-tab-poc-results-media.md`](./EXECUTION-ORDER-p5-objective-tab-poc-results-media.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **COMPLETE** — **Completed: 2026-06-19** (Sonnet; depends on obj-20).

**Change Type:**
- [ ] **Update existing** (Objective section tree) + **add** the row card. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-20's `testResultsStructured` field + reducer actions + derived `test_results`; the structured-card pattern in [`ExamSystemList.tsx`](../../../../../../../../frontend/components/cockpit/rx/inputs/ExamSystemList.tsx) / `ExamSystemCard`; the chip-palette pattern in [`exam-schema.ts`](../../../../../../../../frontend/lib/cockpit/exam-schema.ts); the section registry [`objective-section-order.ts`](../../../../../../../../frontend/lib/cockpit/objective-section-order.ts) + the section host [`ObjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx); the existing `test_results` textarea section.
- ❌ **What's missing:** the `TestResultRow` card; the patient-brought + in-clinic-POC section ids in the registry; the fast-entry chips (common test names + interpretation).

**Scope Guard:**
- Expected files touched: ≤ 6 (the `TestResultRow` card; a results-list/host component; the section registry; `ObjectiveSection` mount; a small chip-catalog; tests). **No** migration/derivation (obj-20), **no** media (obj-22), **no** templates/packs (obj-23).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Result-row card
- [x] ✅ 1.1 `TestResultRowCard`: name (free text + common-test chips), value + unit, date, interpretation chip (`normal`/`high`/`low`/`abnormal`), source toggle (`patient_report` / `in_clinic_poc`), notes; dispatches obj-20's reducer actions. - **Completed: 2026-06-19**
- [x] ✅ 1.2 Add/remove row affordances; empty-state; `disabled` (read-only) renders values without inputs (mirror `ExamSystemCard`). - **Completed: 2026-06-19**

### 2. Section registration (P3 registry)
- [x] ✅ 2.1 Register `test_results` (structured patient-brought) + `point_of_care` (in-clinic) section ids in `objective-section-order.ts` (labels, default order; POC collapsed by default). - **Completed: 2026-06-19**
- [x] ✅ 2.2 Mount both in `ObjectiveSection` via `TestResultsList`; reorder/collapse/visibility/manage-menu (P3) apply; legacy `testResults` textarea kept in the patient-brought section as the escape hatch (OBJ-D7). - **Completed: 2026-06-19**

### 3. Fast entry
- [x] ✅ 3.1 `test-result-catalog.ts`: static chip catalog for patient-brought + POC tests + interpretation chips; type-aware default units where cheap; free-text fallback on every field. - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 `TestResultsList.test.tsx`: add/edit/remove rows, interpretation + source toggle, `buildRxPayload` derive parity, legacy escape hatch, read-only mode. Registry/layout tests updated for `point_of_care`. - **Completed: 2026-06-19**
- [x] ✅ 4.2 Targeted vitest (92 pass) + eslint clean on touched files. Pre-existing unrelated `tsc` noise (`social-history.ts`, `subjective-section-*.ts`) routed. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/objective/TestResultRow.tsx (the row card)
CREATE: frontend/components/cockpit/rx/objective/TestResultsList.tsx (list host, optional)
UPDATE: frontend/lib/cockpit/objective-section-order.ts (test_results structured + point_of_care ids)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (mount the sections)
CREATE: frontend/lib/cockpit/test-result-catalog.ts (common test + interpretation chips)
DO NOT TOUCH: obj-20's schema/derivation; media (obj-22); templates/packs (obj-23)
```

**When updating existing code:**
- [ ] Clone `ExamSystemCard`/`ExamSystemList` UX (tri-state-style affordances, chip palette, read-only render) — do not fork a new card pattern.
- [ ] Register via the P3 registry so layout engines apply automatically; do not hand-roll reorder/collapse.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Structured UI over obj-20's rows only.** No derivation logic here; the card dispatches, `buildRxPayload` derives.
- **Registry-aware (P3).** New sections plug into the shipped reorder/collapse/visibility engine.
- **Escape hatch stays (OBJ-D7).** The `test_results` textarea remains for unstructured entry.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — writes obj-20's `test_results_json` via the reducer (per-patient prescription).
  - [ ] **RLS verified?** **Yes** — inherits obj-20's doctor-scoped prescription path.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Patient-brought + in-clinic-POC sections render structured `TestResultRow` cards with fast entry; reorder/collapse/visibility (P3) apply; the `test_results` textarea remains as the escape hatch.
- [ ] Rows dispatch obj-20's reducer actions; `buildRxPayload` derives `test_results` from them; read-only mode hides edit inputs.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The Zone-C analog of P1's structured exam UI (`obj-02/03`), reusing the card + registry patterns wholesale.

---

## 🔗 Related Tasks

- [`task-obj-20-structured-test-results-foundation.md`](./task-obj-20-structured-test-results-foundation.md) — the substrate consumed here.
- [`task-obj-23-result-templates-packs-modality.md`](./task-obj-23-result-templates-packs-modality.md) — templates/packs over these rows.

---

**Last Updated:** 2026-06-19  
**Pattern:** clone `ExamSystemCard` + P3 registry registration over obj-20's `testResultsStructured` rows.  
**Reference:** `process/CODE_CHANGE_RULES.md`
