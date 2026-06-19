# Task subj-38: Integration, contract inversion & verification (custom-section visibility)

> **Filename:** `task-subj-38-integration-and-verification.md` in `subjective-tab/p11-custom-section-visibility/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 11: invert the Phase-10 contracts that asserted custom blocks are *never* hidden/persisted (they now
**are**, keyed by the stable id from subj-36), prove a hidden custom section **survives a tab toggle and a patient
reopen**, confirm custom-section **order** now persists across visits (the subj-36 bonus), and re-assert the
**view-only output parity** — a hidden custom section *with data* still flows into `buildRxPayload` and prints in
the PDF/SMS/snapshot. Then run the verification gate and mark the phase done.

**Program / Phase:** subjective-tab · Phase 11 (custom-section visibility)
**Batch:** [`plan-p11-custom-section-visibility-batch.md`](../plan-p11-custom-section-visibility-batch.md)
**Execution order:** [`EXECUTION-ORDER-p11-custom-section-visibility.md`](./EXECUTION-ORDER-p11-custom-section-visibility.md)
**Estimated Time:** ~1–2 hours
**Status:** ✅ **DONE** — 2026-06-18

**Change Type:**
- [x] ✅ **Tests + verification** — primarily inverts/extends existing contracts. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md). - **Completed: 2026-06-18**

**Current State:**
- ✅ **What exists:** Phase-10 suites inverted — [`subjective-section-visibility.test.ts`](../../../../../../../../frontend/lib/cockpit/__tests__/subjective-section-visibility.test.ts), [`SubjectiveSection.visibility-persist.test.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.visibility-persist.test.tsx), [`doctor-settings-subjective-section-hidden.test.ts`](../../../../../../../../backend/tests/unit/utils/doctor-settings-subjective-section-hidden.test.ts), and [`visibility-output-parity.test.ts`](../../../../../../../../frontend/lib/cockpit/__tests__/visibility-output-parity.test.ts). Custom-block hide/remount/reopen/order + view-only parity all covered.
- ✅ **What's done:** assertions for the new behaviour (custom blocks persist by stable id, survive remount, order persists) and inversion of the now-false Phase-10 assertions.

**Scope Guard:**
- Expected files touched: ≤ 5 test files (FE + BE) + the plan/exec status updates. **No** production-code changes here (those are subj-36/37). If a test reveals a product bug, STOP and surface it.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Invert FE unit contracts (`subjective-section-visibility.test.ts`)
- [x] ✅ 1.1 `resolveVisibleSections`: hidden + mountable `custom_block` filtered out; non-mountable passes through. - **Completed: 2026-06-18**
- [x] ✅ 1.2 `isSectionHidden`: returns `true` for hidden mountable custom block. - **Completed: 2026-06-18**
- [x] ✅ 1.3 `hiddenOverridesToPersist`: keeps `custom_block:<id>`; dedupe/drop-unknown preserved; round-trip added. - **Completed: 2026-06-18**

### 2. Invert BE unit contract (`doctor-settings-subjective-section-hidden.test.ts`)
- [x] ✅ 2.1 "drops custom_block" → "keeps valid custom_block:<id>"; dedupe/cap/drop-unknown preserved. - **Completed: 2026-06-18**

### 3. Integration — remount-survival + order (`SubjectiveSection.visibility-persist.test.tsx`)
- [x] ✅ 3.1 Hide custom section → autosave persists `custom_block:<stableId>`. - **Completed: 2026-06-18**
- [x] ✅ 3.2 Tab toggle remount → hidden custom section stays hidden. - **Completed: 2026-06-18**
- [x] ✅ 3.3 Patient reopen via shell → hidden custom section re-applies. - **Completed: 2026-06-18**
- [x] ✅ 3.4 Custom section order persists across reopen with stable id. - **Completed: 2026-06-18**

### 4. Output parity (P11-D4 / inherits P10-D6)
- [x] ✅ 4.1 Extended parity test: hidden custom section with data → byte-identical `buildRxPayload`; structural guard intact. - **Completed: 2026-06-18**

### 5. Verification gate & close-out
- [x] ✅ 5.1 FE: 42 tests green across visibility + parity + custom-subsections-default + visibility-persist; lint clean on touched files. - **Completed: 2026-06-18**
- [x] ✅ 5.2 BE: 7/7 hidden-set tests green; lint clean on touched file. - **Completed: 2026-06-18**
- [x] ✅ 5.3 Batch plan + exec-order status → Done. - **Completed: 2026-06-18**

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/__tests__/subjective-section-visibility.test.ts (invert custom_block contracts)
UPDATE: frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.visibility-persist.test.tsx (custom hide survives remount + reopen; order persists)
UPDATE: frontend/lib/cockpit/__tests__/visibility-output-parity.test.ts (hidden custom-with-data still prints)
UPDATE: backend/tests/unit/utils/doctor-settings-subjective-section-hidden.test.ts (keeps valid custom_block)
UPDATE: plan-p11-… + EXECUTION-ORDER-p11-… (status → Done)
DO NOT TOUCH: production code (subj-36/37 own it) — a failing test here that needs a prod fix is a STOP-and-surface
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Survival is the headline.** The remount + reopen cases are the proof the stable id (subj-36) + dropped special-casing (subj-37) actually compose. Without subj-36, these would re-mint and fail — that's the regression guard.
- **View-only is non-negotiable (P11-D4).** Parity test must use a custom section **with data** to prove hidden ≠ removed.
- **Tolerant still holds (P11-D5).** Keep the dedupe/cap/drop-unknown cases — only the custom_block verdict flips.
- **No production edits in this task.** Tests describe; they don't fix.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **No** — tests only. - **Completed: 2026-06-18**
- [x] ✅ **Any PHI in logs?** **No** — fixtures use section-id strings; no real patient data printed. - **Completed: 2026-06-18**
- [x] ✅ **External API or AI call?** **No.** - **Completed: 2026-06-18**
- [x] ✅ **Retention / deletion impact?** **No.** - **Completed: 2026-06-18**

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Custom-block hide persists by stable id and survives tab toggle + patient reopen. - **Completed: 2026-06-18**
- [x] ✅ Custom-section order persists across a reopen (subj-36 bonus) — covered by a test. - **Completed: 2026-06-18**
- [x] ✅ Hidden custom section with data is byte-identical in `buildRxPayload`; structural guard intact. - **Completed: 2026-06-18**
- [x] ✅ Inverted Phase-10 contracts pass; tolerant (dedupe/cap/drop-unknown) cases preserved. - **Completed: 2026-06-18**
- [x] ✅ `tsc`/lint/tests green both apps; phase marked Done. - **Completed: 2026-06-18**

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The contract inversions are the deliberate review surface: a reviewer reading subj-38's diff sees, in one place,
every place Phase 10 said "custom blocks are special" flip to "custom blocks are ordinary". Pair each inverted
assertion with a one-line comment pointing at P11-D2 so the *why* travels with the test.

---

## 🔗 Related Tasks

- [`task-subj-36-stable-custom-section-identity.md`](./task-subj-36-stable-custom-section-identity.md) · [`task-subj-37-custom-sections-hideable.md`](./task-subj-37-custom-sections-hideable.md).
- Predecessor verification: [`../../p10-section-visibility/Tasks/task-subj-35-integration-and-verification.md`](../../p10-section-visibility/Tasks/task-subj-35-integration-and-verification.md).

---

**Last Updated:** 2026-06-18
**Pattern:** invert Phase-10 custom_block contracts + prove remount/reopen survival + view-only parity, then gate.
**Reference:** `process/CODE_CHANGE_RULES.md`
