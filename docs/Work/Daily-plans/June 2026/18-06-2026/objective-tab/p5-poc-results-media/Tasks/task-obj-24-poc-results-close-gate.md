# Task obj-24: P5 close-gate — derived `test_results` byte-parity + media round-trip + modality view-only + a11y + verification

> **Filename:** `task-obj-24-poc-results-close-gate.md` in `objective-tab/p5-poc-results-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 5. Prove that the structured Zone-C surfaces are **content/view-only against the derived output**:
`test_results` derives **byte-identically** whether hand-entered or structured (and legacy rows pass through),
media attachments **round-trip** on reload, modality emphasis is provably **view-only**, the a11y sweep passes,
and the verification gate is green. Mirrors obj-04 (P1 derivation gate) + obj-15 (P3 layout gate) + obj-19
(P4 template gate).

**Program / Phase:** objective-tab · Phase 5 (point-of-care results + media)  
**Batch:** [`plan-p5-objective-tab-poc-results-media-batch.md`](../plan-p5-objective-tab-poc-results-media-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p5-objective-tab-poc-results-media.md`](./EXECUTION-ORDER-p5-objective-tab-poc-results-media.md)  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ **COMPLETE** (2026-06-19) — close-gate test file (12 assertions) green; P5-related frontend slice (93) + backend slice (51) pass; `tsc`/eslint clean on touched files. No source drift — the gate held with tests only.

**Change Type:**
- [x] **Test / close-gate** (+ tiny doc ticks). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **Shipped:** obj-20..23 contracts + [`objectiveResultsParity.test.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/__tests__/objectiveResultsParity.test.tsx) (12 assertions: byte-parity, round-trip, modality view-only, a11y); batch plan gate ticked; Phase 5 marked complete in README + product plan.

**Scope Guard:**
- Expected files touched: ≤ 4 (the parity/round-trip/a11y test file; tiny doc ticks on the batch plan + program README + this task). **No** new migration, **no** new server surface; **compose** obj-20..23, do not change their internals.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Output byte-parity (P5-D3 / OBJ-D2)
- [x] ✅ 1.1 For a rich fixture, assert `buildRxPayload.test_results` is **byte-identical** whether the content was hand-entered (legacy textarea) or filled by structured rows / a `test_results`-scope template / a POC pack. - **Completed: 2026-06-19**
- [x] ✅ 1.2 Assert no structured/template/media state reaches `buildRxPayload` except through normal form state (no extra keys, no media/layout leakage). - **Completed: 2026-06-19**
- [x] ✅ 1.3 Re-assert legacy/empty rows derive `test_results` byte-identically (P1 gate holds under P5). - **Completed: 2026-06-19**

### 2. Round-trip fixed points
- [x] ✅ 2.1 apply/enter → save → reload (remount) → re-derive yields the same `test_results` + same `test_results_json` (stable fixed point). - **Completed: 2026-06-19**
- [x] ✅ 2.2 Media: upload → save → reload lists the same objective-tagged attachments; non-objective attachments untouched. - **Completed: 2026-06-19**

### 3. Modality emphasis is view-only (OBJ-D6)
- [x] ✅ 3.1 Across in-person/video/voice seeds, the derived payload is identical to the pure derivation (emphasis changes order/visibility only). - **Completed: 2026-06-19**

### 4. Accessibility sweep
- [x] ✅ 4.1 Result-row controls + the media strip + every Templates/pack affordance are keyboard-operable + labelled; `disabled` (read-only) mode hides the edit affordances. - **Completed: 2026-06-19**

### 5. Verification gate
- [x] ✅ 5.1 `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green (route pre-existing unrelated failures — do not fix out of scope). - **Completed: 2026-06-19**
- [x] ✅ 5.2 Tick the batch plan's cross-cutting acceptance gate + flip Phase 5 status; update the program README P5 row + the product-plan P5 status. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/sections/__tests__/objectiveResultsParity.test.tsx ✅ (12 assertions)
UPDATE: the batch plan + program README + product plan (status ticks) ✅
DO NOT TOUCH: buildRxPayload derivation logic; obj-20 migration; obj-21/22/23 internals (compose them)
```

**When updating existing code:**
- [x] ✅ Mirror `objectiveLayoutParity` / `objectiveTemplateParity` fixture + assertion style for the parity gate.
- [x] ✅ Compose obj-20..23 — the gate exercises the real surfaces, it does not re-implement them.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **View/content-only against output (P5-D3 / OBJ-D2).** Structured rows + templates + packs + media fill the same form state hand-entry fills; the derived `test_results` never changes byte-wise. This is the binding contract obj-24 proves.
- **Media round-trips, doesn't leak.** Attachments survive reload and never enter `buildRxPayload`.
- **Modality emphasis is view-only (OBJ-D6).** Prove the payload is seed-independent.
- **Don't fix out-of-scope test failures** — route pre-existing/unrelated suite noise per the contract.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] ✅ **Data touched?** **Yes** — composes obj-20..23 paths (per-patient); no new surface.
  - [x] ✅ **RLS verified?** **Yes** — inherits the prior tasks' scoped paths.
- [x] ✅ **Any PHI in logs?** **No.**
- [x] ✅ **External API or AI call?** **No.**
- [x] ✅ **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ **Output byte-parity:** hand-entry vs structured/template/pack → identical `buildRxPayload`; PDF/SMS/snapshot unchanged; legacy rows byte-identical; no structured/media/template state leaks into the payload.
- [x] ✅ Enter → save → reload → re-derive is a stable fixed point; media attachments round-trip.
- [x] ✅ Modality emphasis is provably view-only; a11y: controls/strip/affordances keyboard + screen-reader operable; read-only mode hides edit affordances.
- [x] ✅ `tsc`/lint/test green; batch plan gate ticked; Phase 5 marked complete; README + product plan updated.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Closes the Objective Zone-C story: structured results + media seeded by templates/packs + modality emphasis — and the derived `test_results` output is provably unchanged. The P5 analog of obj-04 (derivation gate) + obj-15 (layout gate) + obj-19 (template gate).

---

## 🔗 Related Tasks

- [`task-obj-04-…`](../../p1-structured-exam/Tasks/) (derivation gate) · [`task-obj-15-…`](../../p3-layout-engines/Tasks/task-obj-15-layout-close-gate.md) (layout gate) · [`task-obj-19-…`](../../p4-exam-templates/Tasks/task-obj-19-whole-objective-template-and-close-gate.md) (template gate) — the close-gate rigor this reuses.
- [`task-obj-20-…`](./task-obj-20-structured-test-results-foundation.md) · [`task-obj-22-…`](./task-obj-22-objective-media-attachments.md) — the contracts proven here.

---

**Last Updated:** 2026-06-19  
**Pattern:** prove derived-`test_results` byte-parity / round-trip / modality-view-only / a11y, then close the phase gate (mirror obj-04 + obj-15 + obj-19).  
**Reference:** `process/CODE_CHANGE_RULES.md`
