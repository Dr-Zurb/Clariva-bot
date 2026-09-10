# Task rxl-04: Phase 1 suites + docs + gate

---

## 📋 Task Overview

Close Phase 1. Prove the lock holds on every surface, prove opening a finished chart writes nothing, run the verification gate, and record honestly whether Phase 2 is unblocked.

**Program / Phase:** rx-lifecycle · Phase 1 (lock integrity)
**Batch:** [`plan-p1-rx-lifecycle-lock-integrity-batch.md`](../plan-p1-rx-lifecycle-lock-integrity-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md`](./EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md)
**Estimated Time:** ~2 hours
**Status:** ✅ **DONE** (honest residuals — phase not Shipped)
**Completed:** 2026-08-31

**Change Type:**
- [x] **Update existing** — tests and docs only

**Current State:**
- ✅ `rxl-01` / `rxl-02` / `rxl-03` merged (precondition).
- ⚠️ Existing suites mount Plan and Objective sections without a cockpit state and type into them. Some of these encode the bug.
- ❌ No suite asserts the lock across all five surfaces at once.
- ❌ No suite asserts "opening a chart performs no write".

**Scope Guard:** ≤ 6 files, tests and docs only. No production behaviour change. If a gate item fails, **record it and stop** — do not fix it here and do not widen the phase.

**Reference:** product plan Phase 1 gate · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 `rxl-01..03` implemented (not git-merged).
- [x] 1.2 Isolated S/O/A/P/Vitals suites stay editable without a provider (`useRxSectionLock`). Persist-when-`disabled` suites encode pre-Q3 shared flag — judged, not blanket-updated. Plan incomplete-row is a pre-existing flake.

### 2. Suites
- [x] 2.1 `rxLifecyclePhase1Gate.test.tsx` — S/O/A/P + vitals field-by-field.
- [x] 2.2 Fails-closed probe in the same file.
- [x] 2.3 Zero-write on ended + desk vitals.
- [x] 2.4 Desk vitals visible, not dirty, on an open visit.
- [x] 2.5 Assessment "Stable" button assertion already fixed in `rxl-01`. Other encoded-bug persist tests left (Q3).

### 3. Docs
- [x] 3.1 Program README + product plan Phase 1 → Implemented, not Shipped.
- [x] 3.2 Residuals table in the batch plan.
- [x] 3.3 RXL-DL-8 interim noted in README + batch.

### 4. Verification gate
- [ ] 4.1 `tsc --noEmit` clean — **failed** (pre-existing, not Phase 1 files).
- [ ] 4.2 `lint` clean — **failed** (pre-existing hook-deps warnings).
- [x] 4.3 Full suite run: 99 failed / 4718 passed. Blast-radius 72/2344. Recorded, not absorbed.
- [x] 4.4 DoD walked — type-check / lint hard-stops unmet; phase not Shipped.
- [x] 4.5 No backend file touched by this phase.

---

## 📁 Files

```
CREATE: frontend integration suite — lock across five surfaces
CREATE: frontend suite — fails-closed + zero-write on chart open
UPDATE: existing Plan / Objective / vitals suites that asserted editability
UPDATE: docs/Work/Daily-plans/August 2026/31-08-2026/rx-lifecycle/README.md
UPDATE: docs/Work/Product plans/plan-rx-lifecycle.md (Phase 1 status)
UPDATE: docs/Work/Daily-plans/August 2026/31-08-2026/rx-lifecycle/p1-lock-integrity/plan-p1-rx-lifecycle-lock-integrity-batch.md (gate results)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Honest ticks only. A gate item that did not pass is recorded as not passing; the phase does not close on a partial.
- Do not fix production defects discovered here. Record them, park them per the capture-inbox rule, and let them be scoped.
- Do not blanket-update failing assertions. A suite that fails because the bug is fixed needs its expectation corrected; a suite that fails because the fix broke something is a stop condition.
- No PHI in test fixtures beyond what existing fixtures already use.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **No.**
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [x] Every Phase 1 acceptance-gate line in the batch plan is ticked or recorded as failed with a reason.
- [x] Type-check, lint and suites **not** green — residuals recorded, not absorbed.
- [x] Product plan and program README reflect real status (Implemented, not Shipped).
- [x] Phase 2: seed-vs-edit prerequisite met; still blocked on RXL-Q1 + founder accept of residuals.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-01-lock-gate-and-wiring.md`](./task-rxl-01-lock-gate-and-wiring.md)
- [`task-rxl-02-read-only-affordance.md`](./task-rxl-02-read-only-affordance.md)
- [`task-rxl-03-seed-vs-edit.md`](./task-rxl-03-seed-vs-edit.md)
- [Next phase](../../p2-append-notes/) — unblocked by this gate

---

**Last Updated:** 2026-08-31
**Completed:** 2026-08-31

**Ship notes:** Gate file `frontend/components/cockpit/rx/__tests__/rxLifecyclePhase1Gate.test.tsx` (8/8). Phase 1 is not Shipped. Phase 2 is not a free start.
