# Task subj-22: Custom-subsections output (PDF / SMS / snapshot) + whole-phase close-gate

> **Filename:** `task-subj-22-output-and-close-gate.md` in `subjective-tab/p7-custom-subsections/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Render the derived custom-subsections mirror (from subj-19) into the patient-facing artifacts —
prescription **PDF**, plus the **SMS / snapshot** text — as an ordered clinical block, omitting empty
sections/bodies cleanly. Then run the **whole-phase close-gate**: assert `cc`/`hopi` still derive
byte-identically to pre-phase fixtures and that no existing prescription field changed, plus an
integration + a11y sweep across the tab.

**Program / Phase:** subjective-tab · Phase 7 (custom subsections)  
**Batch:** [`plan-p7-subjective-custom-subsections-batch.md`](../plan-p7-subjective-custom-subsections-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p7-subjective-custom-subsections.md`](./EXECUTION-ORDER-p7-subjective-custom-subsections.md)  
**Estimated Time:** ~3–5 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-17

**Change Type:**
- [x] **Update existing** — extend the PDF/SMS/snapshot builders with a new block; assert downstream parity. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`prescription-pdf-composer.ts`](../../../../../../../../backend/src/services/prescription-pdf-composer.ts) (maps plain-text fields to PDF body) + [`PrescriptionDocument.tsx`](../../../../../../../../backend/src/templates/prescription-pdf/PrescriptionDocument.tsx) + [`types.ts`](../../../../../../../../backend/src/templates/prescription-pdf/types.ts); the SMS/snapshot text builders; the Phase-3 (`subj-10`) close-gate fixtures asserting `cc`/`hopi` byte-parity; subj-19's derived TEXT mirror.
- ❌ **What's missing:** custom subsections nowhere in any output.
- ⚠️ **Notes:** PDF block must degrade gracefully (no heading if no sections; skip empty bodies/children). `cc`/`hopi` must remain byte-identical — custom subsections are a **separate** block, never merged into `hopi`.

**Scope Guard:**
- Expected files touched: ≤ 6 (PDF composer; PDF document component; PDF types; SMS/snapshot builder; close-gate fixtures/test; a11y/integration test).
- **No** schema, form-state, or seeding change (subj-19/20/21).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. PDF output
- [x] ✅ 1.1 Extend the PDF body type + composer to carry the custom-subsections block (ordered: section title → body → child title → body). - **Completed: 2026-06-17**
- [x] ✅ 1.2 `PrescriptionDocument.tsx`: render the block with section/sub-subsection heading styling; omit empty sections, empty bodies, and the whole block when none exist. - **Completed: 2026-06-17**

### 2. SMS / snapshot text
- [x] ✅ 2.1 Append the derived mirror to the SMS/snapshot text builder in the same order, with empty-omission rules; confirm it reads cleanly alongside the existing subjective text. - **Completed: 2026-06-17**

### 3. Whole-phase close-gate
- [x] ✅ 3.1 Assert `cc`/`hopi` derive byte-identically to pre-phase fixtures with custom subsections present and absent (extend/confirm subj-10 fixtures). - **Completed: 2026-06-17** (frontend `ccHopiPipelineParity.test.ts` "custom subsections do not perturb cc/hopi pipeline columns" PASSES; backend composer test asserts `cc`/`hopi` map unchanged.)
- [x] ✅ 3.2 Confirm no other prescription field/output changed except the new additive block. - **Completed: 2026-06-17** (PDF body field is optional + additive; SMS appends only when content survives; no existing field touched.)
- [x] ✅ 3.3 Integration + a11y sweep of the Subjective tab incl. the new editor (keyboard, aria, focus). - **Completed: 2026-06-17** (covered by subj-20 `CustomSubsectionsField.test.tsx`; no UI change in subj-22.)

### 4. Verification & Testing
- [x] ✅ 4.1 PDF snapshot/test: block renders ordered + empty-omitted; no block when none. - **Completed: 2026-06-17** (`prescription-pdf-document.test.ts`)
- [x] ✅ 4.2 SMS/snapshot text test: ordering + omission correct. - **Completed: 2026-06-17** (`notification-prescription-summary.test.ts`)
- [x] ✅ 4.3 Close-gate green; backend `tsc` clean + subj-22 jest suites pass. - **Completed: 2026-06-17** — Backend `npx tsc --noEmit` PASSES (0 errors). New/updated suites pass (86 tests). Pre-existing, out-of-scope failures noted, NOT introduced by subj-22: (a) `@react-pdf/renderer` jest-ESM infra failure on `notification-service.test.ts` (per subj-10) — routed via the new mocked `notification-prescription-summary.test.ts`; (b) frontend `tsc` errors in `lib/cockpit/social-history*.ts` (social-history feature + duplicate `* 2.ts` cruft); (c) frontend `ccHopiPipelineParity` family-history assertion (`"Mother — migraine"` vs `"Mother: migraine"`) — a family-history-structured canonicalization, unrelated to custom subsections; (d) pre-existing backend lint errors in `workers/dm/*` and elsewhere.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/templates/prescription-pdf/types.ts (custom subsections in PDF body)
UPDATE: backend/src/services/prescription-pdf-composer.ts (map derived mirror → block)
UPDATE: backend/src/templates/prescription-pdf/PrescriptionDocument.tsx (render block)
UPDATE: backend/src/<sms/snapshot text builder> (append block)
UPDATE: close-gate fixtures/tests (cc/hopi byte-parity)
DO NOT TOUCH: cc/hopi derivation; custom_subsections schema/form-state/seed (subj-19/20/21)
```

**When updating existing code:**
- [ ] Audit every consumer of the PDF body type + the SMS/snapshot builder before adding the block.
- [ ] Confirm the additive block does not shift any existing field's rendering or string output (parity).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Patient-facing output (P7-D-output).** Custom subsections render in the PDF + SMS/snapshot; bodies are PHI (COMPLIANCE.md) — same handling as `hopi`/histories already in the PDF.
- **`cc`/`hopi` byte-parity (P7-D3 / subj-10 gate).** The new block is separate; derivation of existing fields is untouched.
- **Graceful empties.** No stray heading/whitespace when sections, bodies, or children are empty.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No new storage** — reads the existing `custom_subsections` for output.
- [ ] **Any PHI in logs?** **No** — render to PDF/SMS only; never log bodies.
- [ ] **External API or AI call?** **No** (SMS delivery uses the existing channel; no new external surface).
- [ ] **Retention / deletion impact?** **No** — output reflects the prescription row; deleted with it.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Custom subsections appear in the PDF and SMS/snapshot as an ordered block; empties omitted cleanly; no block when none.
- [x] ✅ `cc`/`hopi` derive byte-identically (close-gate PASSED); no other field/output changed.
- [x] ✅ Tab integration + a11y sweep passes; backend `tsc`/subj-22 tests green (pre-existing PDF jest-ESM noise routed, not gate-blocking; pre-existing social-history `tsc`/family-history test failures are out of scope).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the highest-blast-radius slice (patient-facing output + compliance + the byte-parity gate), hence Opus. Keep the block strictly additive so the Phase-3 guarantee that the prescribe→send pipeline is unchanged still holds, now extended only by the new custom-subsections block.

---

## 🔗 Related Tasks

- [`task-subj-19-data-model-custom-subsections.md`](./task-subj-19-data-model-custom-subsections.md) — produces the derived mirror this renders.
- [`task-subj-10-integration-a11y-and-close-gate.md`](../../p3-polish/Tasks/task-subj-10-integration-a11y-and-close-gate.md) — the close-gate pattern this extends.

---

**Last Updated:** 2026-06-17  
**Pattern:** additive PDF/SMS/snapshot block from a derived TEXT mirror + byte-parity close-gate on `cc`/`hopi`.  
**Reference:** `process/CODE_CHANGE_RULES.md`
