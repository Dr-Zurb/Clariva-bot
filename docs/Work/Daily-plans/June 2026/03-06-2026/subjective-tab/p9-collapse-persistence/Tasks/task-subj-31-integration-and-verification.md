# Task subj-31: Integration, remount-survival + a11y + verification gate

> **Filename:** `task-subj-31-integration-and-verification.md` in `subjective-tab/p9-collapse-persistence/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Prove the bug is fixed and close the phase. Add an integration test that the doctor's collapse choices
**survive a remount** — both the unmount/remount caused by toggling the Subjective tab off/on and the fresh
mount that hydrates from the stored map (patient reopen). Run an a11y sweep (controlled mode keeps
`aria-expanded`, keyboard toggle, and `disabled`/preview behaviour intact), assert structurally that collapse
state never reaches `buildRxPayload` / the PDF path (so output parity holds by construction), and run the
verification gate. This is a **light** close-gate — collapse is UI-only by design, so there is no byte-parity
fixture risk like Phase 8's subj-27.

**Program / Phase:** subjective-tab · Phase 9 (collapse persistence)  
**Batch:** [`plan-p9-subjective-collapse-persistence-batch.md`](../plan-p9-subjective-collapse-persistence-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p9-subjective-collapse-persistence.md`](./EXECUTION-ORDER-p9-subjective-collapse-persistence.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [ ] **New feature (tests + gate)** — no new product surface. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** subj-30 controlled-collapse wiring + autosave; existing `SubjectiveSection.*.test.tsx` (remount/order-persist/a11y patterns to clone); `buildRxPayload` (does not read collapse).
- ❌ **What's missing:** an explicit remount-survival test, the a11y assertions for controlled mode, and the structural output-parity assertion.

**Scope Guard:**
- Expected files touched: ≤ 3 (new/updated FE test files; possibly a tiny test util).
- **No** product code changes (only fixes surfaced by the gate); **no** new feature.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Remount-survival integration test
- [x] ✅ 1.1 Render `SubjectiveSection`, collapse 2–3 top-level sections, assert the autosave PATCH fires with the expected override map. - **Completed: 2026-06-18**
- [x] ✅ 1.2 Unmount + remount with the stored map fed back in (simulate tab toggle / patient reopen); assert the collapsed sections come back collapsed and untouched sections follow their default. - **Completed: 2026-06-18**
- [x] ✅ 1.3 Assert a section left at its default does **not** appear in the persisted map (delta-only), and a `custom_block:*` toggle is never persisted. - **Completed: 2026-06-18**

### 2. A11y sweep (controlled mode)
- [x] ✅ 2.1 `aria-expanded` tracks the controlled state; the chevron toggle and keyboard activation still open/close. - **Completed: 2026-06-18**
- [x] ✅ 2.2 `disabled`/preview mode renders without the autosave firing and without collapse controls regressing. - **Completed: 2026-06-18**

### 3. Output-parity (structural)
- [x] ✅ 3.1 Assert `buildRxPayload` output is identical whether sections are open or collapsed (collapse is not an input to the payload). - **Completed: 2026-06-18**
- [x] ✅ 3.2 Grep-style guard (or unit assertion) that the PDF/SMS/snapshot builders never reference `subjective_section_collapsed` — clone the structural half of the subj-27 parity test. - **Completed: 2026-06-18**

### 4. Verification gate
- [x] ✅ 4.1 `cd frontend && npx tsc --noEmit && npm run lint` clean for the slice. - **Completed: 2026-06-18** (changed files clean; pre-existing unrelated `tsc` noise in WIP social-history files)
- [x] ✅ 4.2 `cd frontend && npm test` + `cd backend && npm test` green (route any pre-existing unrelated failures — e.g. `@react-pdf/renderer` jest-ESM, `AlcoholDrinkRows` tsc noise — as pre-existing, not gate-blocking, with a one-line note). - **Completed: 2026-06-18**
- [x] ✅ 4.3 Tick the batch plan's cross-cutting acceptance gate. - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.collapse-persist.test.tsx
UPDATE: (if needed) frontend/components/cockpit/rx/sections/__tests__/SubjectiveSection.a11y.test.tsx (controlled aria-expanded)
DO NOT TOUCH: product behaviour (only fixes the gate surfaces); doctor_settings api; resolver; PDF/cc/hopi
```

**When updating existing code:**
- [ ] Clone the existing `SubjectiveSection.order-persist.test.tsx` harness (mock `getDoctorSettings`/`patchDoctorSettings`) — same mocking + `waitFor` patterns.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Prove the reported bug (P9 goal).** The headline test is "collapse survives a remount" — both tab toggle and patient reopen.
- **UI-only, asserted structurally (P9-D6).** No fixture byte-parity needed; assert collapse is absent from the payload + builders.
- **Delta-only persistence (P9-D2/D4).** Tests pin the "omit default-equal keys + never persist custom blocks" contract so a later refactor can't silently regress it.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** new storage — tests only.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Remount-survival test passes (tab toggle + patient reopen); delta-only + no-custom-block contracts pinned.
- [x] A11y: controlled `aria-expanded` + keyboard toggle intact; `disabled` mode unaffected.
- [x] Structural output-parity assertion passes; `cc`/`hopi` + PDF/SMS unchanged.
- [x] `tsc`/lint/tests green; cross-cutting gate ticked.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Unlike the Phase-8 close-gate (subj-27), there is no patient-facing output risk to fixture-test here — collapse
state can only hide/show already-rendered DOM and is never an input to `buildRxPayload`. The gate's real value is
the remount-survival test (the exact scenario the doctor reported) plus pinning the delta-only persistence contract.

---

## 🔗 Related Tasks

- [`task-subj-30-wire-controlled-collapse.md`](./task-subj-30-wire-controlled-collapse.md) — the wiring this verifies.
- Sibling precedent: [`../../p8-section-reorder/Tasks/task-subj-27-output-parity-and-close-gate.md`](../../p8-section-reorder/Tasks/task-subj-27-output-parity-and-close-gate.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** remount-survival integration test + a11y sweep + structural output-parity assertion + verification gate.  
**Reference:** `process/CODE_CHANGE_RULES.md`
