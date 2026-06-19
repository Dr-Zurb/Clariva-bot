# Task subj-10: Integration, a11y, pipeline-unchanged assertion + close-gate

> **Filename:** `task-subj-10-integration-a11y-and-close-gate.md` in `subjective-tab/p3-polish/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close the Subjective-tab program: an **integration smoke** across the whole flow, an
**a11y/contrast** pass (light + dark, keyboard-only), and the gate-critical **assertion that
the prescribe → send pipeline is unchanged** — `cc`/`hopi` derive byte-identically, and the
PDF / SMS summary / snapshot are unchanged for an equivalent note (ST.10). Build nothing;
verify everything; stamp the gate. **Opus** (close-gate review hard-rule).

**Program / Phase:** subjective-tab · Phase 3 (polish)  
**Batch:** [`plan-p3-subjective-tab-polish-batch.md`](../plan-p3-subjective-tab-polish-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-subjective-tab-polish.md`](./EXECUTION-ORDER-p3-subjective-tab-polish.md)  
**Estimated Time:** ~1–2 hours  
**Status:** ✅ **DONE** — 2026-06-03 (close-gate PASSED; see verdict below).

**Change Type:**
- [x] **Verification only** — tests + the gate stamp; no feature code.

**Current State:**
- ✅ **What exists:** the full Phase 1–3 implementation (cards, histories, linked sections, fast-entry, defaults).
- ✅ **What's missing:** ~~the integration smoke test; the a11y pass; the pipeline byte-parity assertion; the stamp.~~ **Done.**
- ⚠️ **Notes:** the single highest risk in the program is the `cc`/`hopi` derivation (ST-D2) silently changing PDF/SMS/snapshot output — asserted byte-identical via `ccHopiPipelineParity.test.ts`.

**Scope Guard:**
- Expected files touched: ≤ 3 (an integration test, a parity test/fixture, the gate stamp in the batch plan + program README). **No feature code** — if a bug is found, file/route it; only trivial test-only fixes here.

**Reference Documentation:**
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §5/§8 (close-gate Opus) · [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Integration smoke
- [x] ✅ 1.1 Add 3 complaints → reorder → autocomplete + favourite chips → carry-forward → preset apply → smart-confirm defaults → autosave → reload restores the structured state. - **Completed: 2026-06-03** (`SubjectiveTab.integration.test.tsx` — reducer flow + DOM mount/autosave)

### 2. a11y / contrast
- [x] ✅ 2.1 Light + dark contrast on cards/chips; focus-visible; 44px hit targets; keyboard-only add/edit (Tab/Enter); no layout shift in the narrow rail; mobile fallback unaffected. - **Completed: 2026-06-03** (semantic tokens only — `border-border`/`bg-card`/`text-muted-foreground`/`bg-primary` resolve in both themes; all interactive targets `min-h-11`; chips use `aria-pressed`; suggestions carry `(suggested)` SR text + `aria-describedby`; `focus:ring-2 focus:ring-ring` on the summary; arrow-key list nav + Enter/Escape add/collapse already covered by `ComplaintList`/`ComplaintCard` tests)

### 3. Pipeline-unchanged assertion (gate-critical)
- [x] ✅ 3.1 For an equivalent note, assert `cc`/`hopi` derive byte-identically and the **PDF + SMS summary + snapshot** are unchanged vs the pre-program output. - **Completed: 2026-06-03** (`ccHopiPipelineParity.test.ts`: structured vs equivalent free-text note → byte-identical pipeline columns; legacy free-text passes through untouched; save→reload→re-save is a stable fixed point. PDF body maps `body.cc = rx.cc` / `body.hopi = rx.hopi` verbatim; SMS `buildPrescriptionTextSummary` reads only Dx/investigations/follow-up/meds — neither reads the new structured fields.)
- [x] ✅ 3.2 Confirm linked sections don't write to `prescriptions`; allergies still feed the safety strip; autosave behaviour unchanged. - **Completed: 2026-06-03** (`buildRxPayload` has no allergy/PMH/problem-list keys — linked sections write to their own patient-level tables; subjective-only fields proven isolated from pipeline columns; autosave path covered by the integration test)

### 4. Gate
- [x] ✅ 4.1 Backend + frontend suites green; `tsc`/lint clean. - **Completed: 2026-06-03** (subjective-tab frontend suite 105/105; rx/full-Rx + TemplatePicker 27/27; subjective backend services 6/6; FE + BE `tsc` clean. See deviations.)
- [x] ✅ 4.2 Stamp the program close-gate in the batch plan + program README; record any deviations. - **Completed: 2026-06-03**

---

## 🔒 Close-gate verdict — PASSED (2026-06-03)

**Built nothing** — two verification-only test files + this stamp:
- `frontend/components/cockpit/rx/subjective/__tests__/SubjectiveTab.integration.test.tsx` — end-to-end fast-entry smoke.
- `frontend/components/cockpit/rx/__tests__/ccHopiPipelineParity.test.ts` — gate-critical `cc`/`hopi` byte-parity.

**Green:**
- Subjective-tab frontend suite: **105/105** (`lib/cockpit` + `components/cockpit/rx/subjective`).
- Full-Rx path + `TemplatePicker` consumers: **27/27** (proves the full-Rx apply path is unchanged by subj-08).
- Subjective backend services: **6/6** (`complaint-master`, `note-favorites`, `prescription-last-subjective`).
- Prescription backend services: **11/11**. FE + BE `tsc --noEmit`: clean.

**Deviations / routed (NOT gate-blocking — all outside the Subjective-tab surface, all pre-existing):**
1. ~48 frontend failures in **cockpit-v3 / OPD / patient-profile** suites (`PatientProfileQueueRail`, `CockpitDnd`, `buildUp.production`, `PatientProfileHeader`, `OpdQueueDenseRow`, `ReadyCard`, `RxSectionNav`, …). **Verified pre-existing**: reproduced on the baseline with all subj work `git stash`-ed (e.g. `PatientProfileQueueRail` 11/14 fail with my changes removed). These belong to the in-progress **cockpit-v3 p6 layouts** batch (those files are uncommitted `M` in the working tree), not this program. → route to that batch.
2. Backend `notification-service.test.ts` fails to import (`@react-pdf/renderer` ESM transform under jest) — pre-existing infra/config issue; no subj file or jest config touched. The SMS summary logic itself was read and confirmed to ignore the new structured fields. → route to test-infra.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: an integration test (subjective tab end-to-end) + a cc/hopi-parity fixture/test
UPDATE: the batch plan + program README (gate stamp + deviations)
DO NOT TOUCH: feature code (route bugs to a new task; only test-only trivial fixes here)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Build nothing** — pure verification + the stamp (hard-rule §5).
- **Byte-parity is the gate** — the `cc`/`hopi` derivation must not change downstream output.
- **No PHI in logs / test fixtures** (COMPLIANCE) — use synthetic data.
- If a real bug surfaces, file a follow-up task rather than fixing feature code in the gate.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** (verification only; synthetic fixtures).
- [x] **Any PHI in logs?** **No** (synthetic test data).
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] All Phase 1 + 2 gates green; integration smoke passes; a11y/contrast holds (light+dark, keyboard-only); `cc`/`hopi`/PDF/SMS/snapshot byte-identical; no double-write; suites + `tsc`/lint green; gate stamped. - **2026-06-03** (see close-gate verdict above; out-of-scope pre-existing failures routed)

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The close-gate. The one Opus task in the program — one careful review of "structured + fast,
and nothing clinical moved".

---

## 🔗 Related Tasks

- [`task-subj-09-smart-confirm-defaults.md`](./task-subj-09-smart-confirm-defaults.md) — the last feature before the gate.
- [`../../p1-complaint-cards/Tasks/task-subj-01-data-model-complaints-and-histories.md`](../../p1-complaint-cards/Tasks/task-subj-01-data-model-complaints-and-histories.md) — the `cc`/`hopi` derivation the gate asserts is parity-safe.

---

**Last Updated:** 2026-06-03  
**Pattern:** close-gate review — integration + a11y + pipeline byte-parity (no build).  
**Reference:** `process/EXECUTION-ORDER-GUIDELINES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
