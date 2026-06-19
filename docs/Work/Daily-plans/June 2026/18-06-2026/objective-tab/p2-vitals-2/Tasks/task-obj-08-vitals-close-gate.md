# Task obj-08: Vitals 2.0 close-gate — unit round-trip / range-flag / derived parity + a11y + verification

> **Filename:** `task-obj-08-vitals-close-gate.md` in `objective-tab/p2-vitals-2/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 2: prove the binding contracts Vitals 2.0 introduces — **canonical-storage unit
round-trips with no drift** (P2-D2), **deterministic + correct range flags and MAP/BSA** (P2-D3),
**read-only ghost-value hydration** (P2-D5), and **zero regression to the shipped 7 vitals + BMI
badge** (P2-D6). Add the fixtures, run the a11y sweep over the grid, and close the verification
gate. Mirrors the P1 close-gate (`obj-04`) and is the phase's acceptance owner.

**Program / Phase:** objective-tab · Phase 2 (Vitals 2.0)  
**Batch:** [`plan-p2-objective-tab-vitals-2-batch.md`](../plan-p2-objective-tab-vitals-2-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-objective-tab-vitals-2.md`](./EXECUTION-ORDER-p2-objective-tab-vitals-2.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19

**Change Type:**
- [ ] **New feature** — add tests + fixtures (no behaviour change; if a parity/drift miss surfaces, the minimal fix lands in obj-06's converter or obj-05's mapping).

**Current State:** (check existing code first!)
- ✅ **What exists:** obj-05's storage + mapping, obj-06's converters/flags/derived, obj-07's grid; the shipped 7-vitals baseline; P1's `examDerivationParity.test.tsx` (close-gate fixture pattern); `VitalsGrid` test patterns.
- ❌ **What's missing:** round-trip / flag / derived parity fixtures + the a11y assertions for the vitals path.

**Scope Guard:**
- Expected files touched: ≤ 4 (parity/round-trip test(s), a11y test, any shared fixture; a one-line fix in obj-06/obj-05 only if a miss is found).
- **No** new feature surface; **no** unit-preference persistence (P3); **no** percentiles (P6).

**Reference Documentation:**
- [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Parity / correctness fixtures (the gate)
- [x] ✅ 1.1 Unit round-trip (°F/lb/in/mmol/L): enter via grid → canonical stored value asserted → re-display in the entered unit with no drift beyond display precision. - **Completed: 2026-06-19**
- [x] ✅ 1.2 Existing-vitals regression: shipped-7 fixture maps through `buildRxPayload` value-identical; extended vitals all null (baseline unperturbed); save→reload→re-save fixed point. - **Completed: 2026-06-19**
- [x] ✅ 1.3 Range-flag boundary: 59/60/100/101 HR edges; age-variant RR; sex-variant waist. - **Completed: 2026-06-19**
- [x] ✅ 1.4 Derived determinism: MAP 93.3 / BSA 1.82 references; null-safe (no badge, no throw). - **Completed: 2026-06-19**
- [x] ✅ 1.5 Edge: out-of-CHECK value still classifies without throwing; missing/no-band vitals → null; ghost present vs absent deterministic. - **Completed: 2026-06-19**

### 2. a11y + integration
- [x] ✅ 2.1 Grid a11y: every core+extended input labelled; unit toggles are labelled `role="group"` button sets with `aria-pressed`; range flag + MAP/BSA badges carry `aria-label`; peds group is a native `<details>` disclosure. - **Completed: 2026-06-19**
- [x] ✅ 2.2 Round-trip: hydrate a stored canonical prescription → grid reflects values in the active unit → edit reflects in state; ghosts read-only. - **Completed: 2026-06-19**

### 3. Verification gate
- [x] ✅ 3.1 Backend vitals suites green (61 pass); all Phase-2 frontend vitals suites green (73 pass across 5 files); eslint clean + `tsc` clean on touched files. Pre-existing repo-wide failures routed (see 3.3). - **Completed: 2026-06-19**
- [x] ✅ 3.2 No PHI in logs across the vitals path — synthetic fixtures only; no logging added; values flow through pure functions. - **Completed: 2026-06-19**
- [x] ✅ 3.3 Phase-2 cross-cutting gate marked in the batch plan. **Routed pre-existing/unrelated:** backend `@react-pdf/renderer` ESM jest-transform failures (31 suites, in the prescription-pdf-service import chain — already-modified WIP in the working tree, not touched by Phase 2); frontend repo-wide `tsc` errors in cockpit-v3 WIP files (subjective sections, social-history) — none in vitals files. - **Completed: 2026-06-19**

---

## 📁 Files to Create/Update

```
CREATE: frontend parity/round-trip + a11y tests (mirror obj-04's examDerivationParity layout)
UPDATE (only if a drift/parity miss is found): obj-06 converter or obj-05 mapping (minimal fix)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The gate is **assertion-first**: prefer proving obj-05/06/07 correct over re-implementing. Any code change is a minimal converter/mapping fix, not new surface.
- Round-trip is **canonical-exact** to the documented precision — drift fails the gate (the whole point of P2-D2).
- Determinism: fixtures reproducible (no `Date.now`, no locale in stored values).
- No PHI in test logs/snapshots — synthetic fixtures only.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** (tests; any fix is in obj-05/06's existing surface).
- [ ] **Any PHI in logs?** **No** (synthetic fixtures only).
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [ ] Unit round-trips have no drift; shipped 7 vitals are value-identical (no regression).
- [ ] Range flags + MAP/BSA are deterministic and correct at boundaries.
- [ ] Ghost values hydrate read-only; a11y + round-trip pass; full verification gate green.
- [ ] Phase-2 cross-cutting gate checklist complete.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-05-vitals-data-model-and-form-state.md`](./task-obj-05-vitals-data-model-and-form-state.md) — the storage/mapping this gate proves.
- [`task-obj-06-vitals-schema-and-derived-calculators.md`](./task-obj-06-vitals-schema-and-derived-calculators.md) — the converters/flags/derived this gate exercises.
- [`task-obj-07-vitals-grid-2-ui.md`](./task-obj-07-vitals-grid-2-ui.md) — the UI whose round-trip + a11y this verifies.
- **Precedent:** P1 close-gate [`../../p1-structured-exam/Tasks/task-obj-04-derivation-close-gate.md`](../../p1-structured-exam/Tasks/task-obj-04-derivation-close-gate.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** P1 `obj-04` byte-parity close-gate ported to vitals unit round-trip / range-flag / derived parity.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
