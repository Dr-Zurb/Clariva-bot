# Task rxl-18: Phase 3 suites + docs + gate

---

## 📋 Task Overview

Close Phase 3 and the program. Two tests carry the weight: minute 16 refused with a client whose clock disagrees, and continuous typing producing `Rev 2` rather than `Rev 47`. Then walk the program acceptance gate end to end and record what shipped.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~3 hours
**Status:** ⏳ **PENDING** (blocked on `rxl-11..17`)
**Completed:** —

**Change Type:**
- [x] **Update existing** — tests and docs only

**Current State:**
- ✅ `rxl-11..17` merged (precondition).
- ❌ No end-to-end suite walks attest → in-window edit → snapshot → expiry → reprint-with-marker.
- ❌ No suite proves an issued artifact survives a later revision.

**Scope Guard:** ≤ 7 files, tests and docs only. No production behaviour change. If a gate item fails, **record it and stop**.

**Reference:** product plan program acceptance gate · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) · [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 All seven prior tasks merged and both migrations deployed. Else **STOP**.
- [ ] 1.2 Re-run the Phase 1 and Phase 2 gate suites. Phase 3 relaxes a guard those phases established; a regression there is the likeliest failure.

### 2. End-to-end suites
- [ ] 2.1 **The lifecycle walk:** attest → edit at minute 5 → snapshot written → reprint shows the marker → minute 16 refused → supersede with a reason. One test, one narrative.
- [ ] 2.2 **The boundary test:** minute 16 refused with a client clock claiming minute 2.
- [ ] 2.3 **The revision-counting test:** type repeatedly for two minutes, finalize, assert `Rev 2`. A single-keystroke assertion would pass under a per-save counter and prove nothing.
- [ ] 2.4 **The artifact-survival test:** revision N's bytes retrievable after N+1 exists.
- [ ] 2.5 **The no-loss test:** a keystroke at 14:59 is persisted across the expiry flip.
- [ ] 2.6 **The marker-integrity test:** present with a custom footer, a footer banner, and hide-credit set.
- [ ] 2.7 **The unchanged-reprint test:** reprinting an untouched attested note is byte-identical and creates no revision.

### 3. Docs
- [ ] 3.1 Program README and product plan — Phase 3 status; product plan to `Shipped` if the program gate is fully green, otherwise record the residue.
- [ ] 3.2 `DB_SCHEMA.md` and `RLS_POLICIES.md` reflect both deployed migrations.
- [ ] 3.3 Confirm the PDF service header no longer states a lock that has been reversed.
- [ ] 3.4 Record the storage-volume consequence for the retention owner (RXL-Q4).
- [ ] 3.5 Remove the "no correction window" interim note that Phases 1 and 2 added — it is no longer true.

### 4. Verification gate
- [ ] 4.1 `npm run type-check` clean.
- [ ] 4.2 `npm run lint` clean.
- [ ] 4.3 Full backend + frontend suites. Pre-existing unrelated failures recorded separately, not absorbed.
- [ ] 4.4 Walk [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md), including Database Schema Change and New Service Function criteria.
- [ ] 4.5 Walk the **program** acceptance gate in the product plan, not just this phase's.
- [ ] 4.6 Confirm the Scope Guard held across all three phases — queue, OPD, pipeline, `visit_payments` and letterhead design untouched.

---

## 📁 Files

```
CREATE: backend integration suite — lifecycle walk, boundary, revision counting, artifact survival
CREATE: frontend integration suite — expiry flip with no keystroke loss
UPDATE: existing PDF snapshot suites affected by rxl-16
UPDATE: docs/Work/Daily-plans/August 2026/31-08-2026/rx-lifecycle/README.md
UPDATE: docs/Work/Product plans/plan-rx-lifecycle.md (Phase 3 + program status)
UPDATE: docs/Work/Daily-plans/August 2026/31-08-2026/rx-lifecycle/p3-revise-window/plan-p3-rx-lifecycle-revise-window-batch.md (gate results)
UPDATE: docs/Reference/engineering/architecture/DB_SCHEMA.md · compliance/RLS_POLICIES.md (verify, not rewrite)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Honest ticks only. The revision-counting and artifact-survival tests are the two most tempting to write in a form that passes vacuously — 2.3 and 2.4 specify how to avoid that.
- Do not fix production defects found here. Record them, park per the capture-inbox rule, and let them be scoped.
- Use fake timers for anything time-dependent. Real wall-clock waits will flake in CI and a flaky window test will be muted, which loses the guarantee.
- Do not regenerate PDF snapshots wholesale to make them pass. A wholesale regeneration hides layout regressions from `rxl-16`.
- No PHI in fixtures beyond what existing fixtures use, and no snapshot payload in test logs.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **No** — tests and docs.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? Documented in 3.4, not changed.

---

## ✅ Acceptance & Verification Criteria

- [ ] Every Phase 3 acceptance-gate line in the batch plan is ticked or recorded as failed with a reason.
- [ ] Every **program** acceptance-gate line in the product plan is walked.
- [ ] Phase 1 and Phase 2 gate suites still green.
- [ ] Type-check, lint and suites green apart from separately-recorded pre-existing failures.
- [ ] Product plan reflects real status; stale interim notes removed.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-11-revisions-migration.md`](./task-rxl-11-revisions-migration.md)
- [`task-rxl-12-snapshot-and-revision-bump.md`](./task-rxl-12-snapshot-and-revision-bump.md)
- [`task-rxl-13-window-guard.md`](./task-rxl-13-window-guard.md)
- [`task-rxl-14-window-ui.md`](./task-rxl-14-window-ui.md)
- [`task-rxl-15-pdf-freeze-and-retention.md`](./task-rxl-15-pdf-freeze-and-retention.md)
- [`task-rxl-16-slip-edit-marker.md`](./task-rxl-16-slip-edit-marker.md)
- [`task-rxl-17-supersede-correction.md`](./task-rxl-17-supersede-correction.md)
- [Prior phases](../../p1-lock-integrity/) · [`../../p2-append-notes/`](../../p2-append-notes/)

---

**Last Updated:** 2026-08-31
**Completed:** —
