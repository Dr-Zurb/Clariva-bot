# Task subj-42: cascade/archival wiring, tolerant reconciliation & verification

> **Filename:** `task-subj-42-integration-and-verification.md` in `subjective-tab/p12-custom-section-templates/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight.

---

## 📋 Task Overview

Close Phase 12: execute the **opt-in archive cascade** the subj-41 dialog flags, prove **tolerant reconciliation** (applying a template whose embedded custom-section id no longer exists is safe), re-assert **view-only output parity** for templated/deleted custom sections, and run the **verification gate**. Mostly tests + a thin archival loop — no new schema, no new UI.

**Program / Phase:** subjective-tab · Phase 12 (custom-section templates)
**Batch:** [`plan-p12-custom-section-templates-batch.md`](../plan-p12-custom-section-templates-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-custom-section-templates.md`](./EXECUTION-ORDER-p12-custom-section-templates.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **DONE** — 2026-06-18

**Change Type:**
- [ ] **Update existing** + tests. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists (subj-41):** the delete dialog flags linked `custom_block` template ids for archival behind the opt-in; full-template merge-by-id.
- ✅ **What exists (Phase 6):** [`archiveRxTemplate`](../../../../../../../../backend/src/services/rx-template-service.ts) (soft-delete via `archived_at`) + its API client.
- ⛳ **What's missing:** the loop that actually archives the flagged ids; the tolerant-reconciliation + output-parity proofs.

**Scope Guard:**
- Expected files touched: ≤ 6 (archive loop in `SubjectiveSection.tsx`/helper; tests across apply + service + output-parity; plan/exec status).
- **DO NOT TOUCH:** the migration (subj-39); the dialog UI (subj-41); `buildRxPayload`/PDF/SMS source.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Archive cascade (opt-in)
- [x] ✅ 1.1 `archiveCustomBlockTemplates` helper loops flagged ids through `archiveRxTemplate`; partial failure keeps successes and surfaces a non-blocking notice in `SubjectiveSection`. - **Completed: 2026-06-18**
- [x] ✅ 1.2 Confirm-without-opt-in archives nothing; only `custom_block` ids are passed — `subjective_full` never archived. - **Completed: 2026-06-18**

### 2. Tolerant reconciliation (proof)
- [x] ✅ 2.1 Test: `subjective_full` + `custom_block` apply re-creates absent sections via reducer; re-apply does not duplicate (P12-D5). - **Completed: 2026-06-18**
- [x] ✅ 2.2 Test: malformed `customSubsections` entries dropped during merge apply without failing the whole apply. - **Completed: 2026-06-18**

### 3. Output parity (proof)
- [x] ✅ 3.1 Extended `visibility-output-parity.test.ts`: same-fields payload parity, delete clears custom subsections only via form state, structural guard that `buildRxPayload` never references template/delete wiring (P12-D6). - **Completed: 2026-06-18**

### 4. Round-trip + count regressions
- [x] ✅ 4.1 Backend: `rx-template-service` re-asserts `subjective_full` multi-section `customSubsections` round-trip. - **Completed: 2026-06-18**
- [x] ✅ 4.2 FE: `custom-section-linked-templates.test.ts` + delete-dialog tests cover linked/embed counts. - **Completed: 2026-06-18**

### 5. Verification gate + status
- [x] ✅ 5.1 Targeted backend + frontend vitest green (44 FE + 10 BE in scoped suites); lint clean on edited files. Pre-existing unrelated full-suite noise unchanged. - **Completed: 2026-06-18**
- [x] ✅ 5.2 Phase-12 plan + EXECUTION-ORDER + task statuses flipped to ✅ Done. - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (archive loop on opt-in)
UPDATE: frontend/lib/cockpit/__tests__/apply-subjective-template*.test.ts (tolerant reconciliation)
UPDATE: frontend/lib/cockpit/__tests__/visibility-output-parity.test.ts (template/delete parity)
UPDATE: backend/tests/unit/services/rx-template-service.test.ts (customSubsections round-trip)
UPDATE: the Phase-12 plan + EXECUTION-ORDER + task statuses
DO NOT TOUCH: the migration (subj-39); dialog UI (subj-41); buildRxPayload/PDF/SMS source
```

**When updating existing code:**
- [ ] Reuse `archiveRxTemplate` — no new delete endpoint; the cascade is a client loop over flagged ids.
- [ ] Output-parity tests must assert the **payload**, not the view — the whole phase is config-only.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Archive only (P12-D4).** The cascade is soft (`archived_at`); never hard-delete templates.
- **Tolerant reconciliation (P12-D3 / P11-D5).** Stale ids re-create or drop; never crash.
- **View-only (P12-D6).** `buildRxPayload`/PDF/SMS byte-identical throughout.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No new schema** — mutates `archived_at` on the doctor's own templates, behind the opt-in.
  - [ ] **RLS verified?** **Yes** — doctor-scoped, unchanged.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **Yes (intentional, reversible)** — soft archival only; the guard dialog (subj-41) precedes it.

---

## ✅ Acceptance & Verification Criteria

- [ ] Opt-in archives exactly the flagged `custom_block` templates via `archiveRxTemplate`; partial failure is non-blocking; no-opt-in archives nothing; `subjective_full` never archived by a delete.
- [ ] Applying a template with a stale/absent custom-section id re-creates or safely drops it — no crash, no duplicate.
- [ ] `buildRxPayload` byte-identical for templated/hidden/deleted custom sections.
- [ ] Backend + frontend gate green; plan/exec/task statuses flipped to ✅ Done.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The cheap closer — it spends its budget on proofs (tolerant reconciliation, output parity, round-trip) rather than new surface area, and runs the archival cascade through the already-shipped `archiveRxTemplate`.

---

## 🔗 Related Tasks

- [`task-subj-38-integration-and-verification.md`](../../p11-custom-section-visibility/Tasks/task-subj-38-integration-and-verification.md) — the Phase-11 verification slice this mirrors.
- [`task-subj-41-full-template-and-delete-warning.md`](./task-subj-41-full-template-and-delete-warning.md) — flags the ids this archives.

---

**Last Updated:** 2026-06-18.
**Pattern:** thin archival loop over the shipped `archiveRxTemplate` + proof-heavy verification (tolerant reconciliation, output parity, round-trip) closing the phase.
**Reference:** `process/CODE_CHANGE_RULES.md`
