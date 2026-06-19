# Task subj-27: Output parity + whole-phase close-gate (cc/hopi + PDF/SMS unchanged, a11y sweep)

> **Filename:** `task-subj-27-output-parity-and-close-gate.md` in `subjective-tab/p8-section-reorder/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 8. Prove the section reorder is **UI-only**: `cc`/`hopi` derive byte-identically and the
patient-facing PDF/SMS/snapshot **section order is unchanged** regardless of the doctor's cockpit
arrangement. Run the whole-phase integration + accessibility sweep over the Subjective tab (keyboard
reorder, focus order, aria, disabled mode). This is the highest-blast-radius slice (compliance +
downstream artifacts) — **Opus**.

**Program / Phase:** subjective-tab · Phase 8 (section reorder)  
**Batch:** [`plan-p8-subjective-section-reorder-batch.md`](../plan-p8-subjective-section-reorder-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p8-subjective-section-reorder.md`](./EXECUTION-ORDER-p8-subjective-section-reorder.md)  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-17

**Change Type:**
- [x] ✅ **Verification / close-gate** — assertions + a11y sweep; no feature code (fix only if the gate fails). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md). **No production code touched.**

**Current State:**
- ✅ **What exists:** subj-23..26 (registry, settings, DnD, persistence); the subj-10 / subj-22 close-gate fixtures + byte-parity harness; [`prescription-pdf-composer.ts`](../../../../../../../../backend/src/services/prescription-pdf-composer.ts) + [`PrescriptionDocument.tsx`](../../../../../../../../backend/src/templates/prescription-pdf/PrescriptionDocument.tsx) + the SMS/snapshot text builders.
- ❌ **What's missing:** a test proving cockpit reorder does **not** leak into patient-facing output, plus the integration/a11y sweep.

**Scope Guard:**
- Expected files touched: ≤ 4 (mostly tests; only feature fixes if the gate fails).
- This task should ideally add **no** production code — it asserts the design invariant (output is UI-independent).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Output parity (close-gate)
- [x] ✅ 1.1 Assert `cc`/`hopi` derive **byte-identically** to pre-phase fixtures (reuse the subj-10/subj-22 harness) with reordered sections. — **Completed: 2026-06-17** (subj-10 `ccHopiPipelineParity` cc/hopi pipeline-column projection passes; section reorder is local UI state and never feeds `buildRxPayload`).
- [x] ✅ 1.2 Assert the PDF section order is unchanged for any `subjective_section_order` value — the composer/`PrescriptionDocument` consume prescription data, not cockpit order, so output must be invariant. Add a regression test that varies the stored order and snapshots identical PDF/SMS output. — **Completed: 2026-06-17** (`backend/tests/unit/services/section-order-output-parity.test.ts`: PDF body + SMS summary byte-identical across 5 distinct `subjective_section_order` permutations).
- [x] ✅ 1.3 Confirm no path threads `subjective_section_order` into the composer / text builders (grep + review). — **Completed: 2026-06-17** (grep: only `doctor-settings-service` / `validation` / `types`; plus a structural guard test asserting the 5 output-builder source files never reference `subjective_section_order` / `sectionOrder`).

### 2. Integration + a11y sweep
- [x] ✅ 2.1 End-to-end-ish: reorder via keyboard, save as default, remount → order persists; output still unchanged. — **Completed: 2026-06-17** (`SubjectiveSection.a11y.test.tsx` + `SubjectiveSection.order-persist.test.tsx`: keyboard reorder → save PATCHes settings only; `updatePrescription` never called; remount re-applies stored default).
- [x] ✅ 2.2 A11y: each grip is focusable with a clear `aria-label`; reorder is operable keyboard-only; focus order is sane; `disabled` mode hides grips and blocks reorder. — **Completed: 2026-06-17** (grips are `role=button`, `tabindex=0`, `aria-label="Reorder <label>. Use arrow keys to move."`; grip precedes section body in DOM; `disabled` removes grips + save action from the tree).
- [x] ✅ 2.3 Verify conditional sections (linked PMH/allergies vs past-surgical fallback) reorder + persist correctly in both modes. — **Completed: 2026-06-17** (linked mode reorders + saves `patient_background`/`allergies`; fallback mode reorders `past_surgical` with PMH/allergies absent).

### 3. Verification & Testing
- [x] ✅ 3.1 `cd backend && npm test` + `cd frontend && npx tsc --noEmit && npm run lint` + frontend suite green. — **Completed: 2026-06-17** (new backend gate 4/4; all 20 Phase-8 reorder FE tests green; new files `tsc`/`eslint` clean).
- [x] ✅ 3.2 Record any pre-existing, unrelated failures (e.g. `@react-pdf/renderer` jest-ESM infra) as routed, not gate-blocking. — **Completed: 2026-06-17** — see Notes (routed): (a) `ccHopiPipelineParity` `familyHistory` display assertion (`—`→`:`, family-history-structured normalization — not cc/hopi, not reorder); (b) repo-wide `react-hooks/rules-of-hooks` errors in `PreviousRxSideSheet.tsx`/`ActivitySection.tsx`/`AlcoholDrinkRows.tsx` (not section-reorder files); (c) `@react-pdf/renderer` jest-ESM infra. None introduced by subj-27.
- [x] ✅ 3.3 Tick the [batch plan cross-cutting gate](../plan-p8-subjective-section-reorder-batch.md#cross-cutting-acceptance-gate-whole-phase). — **Completed: 2026-06-17**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/tests/unit/services/section-order-output-parity.test.ts (PDF/SMS invariant to cockpit order)
CREATE/UPDATE: frontend a11y + integration test for reorder + persist
DO NOT TOUCH: feature code unless the gate fails (then minimal, documented fix)
```

**When updating existing code:**
- [ ] Only touch production code if the gate fails; keep any fix minimal and re-run the full gate.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **UI-only; output untouched (P8-D3 / ST-D2).** The phase passes only if patient-facing output is provably invariant to cockpit order.
- **Reuse the existing close-gate harness.** Do not invent a new parity mechanism — extend subj-10/subj-22 fixtures.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** — verification slice (config already covered by subj-24/26).
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ `cc`/`hopi` byte-identical to pre-phase fixtures with sections reordered.
- [x] ✅ PDF/SMS/snapshot output invariant across `subjective_section_order` values.
- [x] ✅ Keyboard-operable reorder, sane focus, `disabled` suppresses grips (a11y sweep passes).
- [x] ✅ `tsc`/lint/backend+frontend suites green for the slice (pre-existing unrelated failures documented + routed).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The phase's central safety claim is "cockpit order never reaches the patient". This task exists to make that claim a test, not an assumption — vary the stored order and assert identical bytes out.

---

## 🔗 Related Tasks

- [`task-subj-23-section-registry-and-ordered-renderer.md`](./task-subj-23-section-registry-and-ordered-renderer.md) — the parity baseline.
- [`task-subj-26-persist-and-seed-order.md`](./task-subj-26-persist-and-seed-order.md) — the persistence this gate exercises.

---

**Last Updated:** 2026-06-17  
**Pattern:** whole-phase byte-parity close-gate (reuse subj-10/subj-22 harness) + integration/a11y sweep; output invariant to UI order.  
**Reference:** `process/CODE_CHANGE_RULES.md`
