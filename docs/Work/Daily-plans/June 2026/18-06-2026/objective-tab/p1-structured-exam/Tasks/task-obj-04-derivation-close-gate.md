# Task obj-04: Derivation byte-parity close-gate + a11y + verification

> **Filename:** `task-obj-04-derivation-close-gate.md` in `objective-tab/p1-structured-exam/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Prove the binding contract obj-01 established (OBJ-D2 / P1-D2): a **legacy** prescription
row (empty `examination_json`, existing General/Systemic free-text) derives
`examination_findings` **byte-identical** to today, so the PDF / SMS / snapshot are
unchanged; and a **structured** row derives a deterministic, registry-ordered string. Add the
fixtures, run the a11y sweep over the tri-state cards, and close the Phase-1 verification gate.
This mirrors the subjective close-gate (`subj-10`) and is the phase's acceptance owner.

**Program / Phase:** objective-tab · Phase 1 (structured exam)  
**Batch:** [`plan-p1-objective-tab-structured-exam-batch.md`](../plan-p1-objective-tab-structured-exam-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-objective-tab-structured-exam.md`](./EXECUTION-ORDER-p1-objective-tab-structured-exam.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19

**Change Type:**
- [x] **New feature** — add tests + fixtures (no behaviour change; if a parity miss surfaces, fix lands in obj-01).

**Current State:**
- ✅ **What exists:** obj-01's derivation in `buildRxPayload`; the PDF mapper (`PrescriptionDocument.tsx` / composer), the SMS/notification summary, and the snapshot path that read `examination_findings`; any subjective `subj-10` parity-fixture pattern to mirror.
- ❌ **What's missing:** parity fixtures + a11y assertions for the exam path.

**Scope Guard:**
- Expected files touched: ≤ 4 (parity test(s), a11y test, any shared fixture; a one-line derivation fix in obj-01's file only if a miss is found).
- **No** new feature surface; **no** structured-PDF rendering (PDF reads derived text in P1).

**Reference Documentation:**
- [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Byte-parity fixtures (the gate)
- [x] ✅ 1.1 Legacy fixture: empty `examFindings` + General/Systemic delimiter text ⇒ `buildRxPayload().examinationFindings` byte-identical to input (`examDerivationParity.test.tsx`). - **Completed: 2026-06-19**
- [x] ✅ 1.2 PDF/SMS/snapshot parity: PDF body carries no exam field (structural); SMS `buildPrescriptionTextSummary` byte-identical with/without exam fields (backend `notification-prescription-summary.test.ts`); snapshot (`VisitDetailSideSheet`) reads `examination_findings` verbatim ⇒ column byte-parity == render parity. - **Completed: 2026-06-19**
- [x] ✅ 1.3 Structured fixture: scrambled-input multi-system row ⇒ deterministic, registry-ordered + registry-labelled string; insertion-order independent + reproducible. - **Completed: 2026-06-19**
- [x] ✅ 1.4 Mixed/edge: empty findings, notes-only abnormal, unknown systemId (humanized fallback, sorted after core) — deterministic, never throws. - **Completed: 2026-06-19**

### 2. a11y + integration
- [x] ✅ 2.1 Tri-state cards: keyboard operable (Arrow keys), `aria-checked` per state, `disabled` read-only (no edits commit). - **Completed: 2026-06-19**
- [x] ✅ 2.2 Round-trip: load structured prescription → cards reflect stored state (WNL line, selected chips) → edit (toggle chip) → re-derives deterministically; save → reload → re-save fixed point. - **Completed: 2026-06-19**

### 3. Verification gate
- [x] ✅ 3.1 Backend exam tests green (33); frontend exam suite green (58: parity 13 + obj-01 14 + ccHopi + ExamSystemList + ObjectiveSection + exam-schema); lint clean on touched files. Pre-existing repo-wide `tsc` debt routed (unrelated files). - **Completed: 2026-06-19**
- [x] ✅ 3.2 No PHI in logs across the exam path — derivation is pure client-side; synthetic fixtures only. - **Completed: 2026-06-19**
- [x] ✅ 3.3 Marked the phase cross-cutting acceptance gate in the [batch plan](../plan-p1-objective-tab-structured-exam-batch.md#cross-cutting-acceptance-gate-whole-phase). - **Completed: 2026-06-19**

**Parity-miss fix found + applied (in scope):** obj-01's derivation used a placeholder `EXAM_CORE_SYSTEM_ORDER` (`cardiovascular`/`respiratory`/…) + `humanizeExamSystemId`, but obj-03's UI writes obj-02 registry ids (`cvs`/`resp`/`abd`/`cns`). Single-sourced the order + labels from `exam-schema.ts` (`resolveExamSystem().label`) so structured rows derive registry-ordered/labelled text. Minimal fix in obj-01's file (`RxFormContext.tsx`) per the scope guard; obj-01's existing 14 tests stay green.

---

## 📁 Files to Create/Update

```
CREATE: backend/frontend parity + a11y tests (match repo test layout; mirror subj-10 fixtures)
UPDATE (only if a parity miss is found): frontend/components/cockpit/rx/RxFormContext.tsx (derivation fix — obj-01's file)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The gate is **assertion-first**: prefer proving obj-01 correct over re-implementing. Any code change is a minimal derivation fix in obj-01's file, not new surface.
- Parity is **byte-level** for legacy rows — the whole point of OBJ-D2. A diff fails the gate.
- Determinism: fixtures must be reproducible (registry order, no timestamps/locale in the derived string).
- No PHI in test logs or snapshots committed with real patient data — use synthetic fixtures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **N** (tests; any fix is in obj-01's existing surface).
- [ ] **Any PHI in logs?** **No** (synthetic fixtures only).
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N**.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Legacy rows: `examination_findings` byte-identical; PDF/SMS/snapshot unchanged.
- [x] ✅ Structured rows: deterministic registry-ordered derivation.
- [x] ✅ a11y + round-trip pass; full verification gate green.
- [x] ✅ Phase-1 cross-cutting gate checklist complete.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-01-…`](./task-obj-01-data-model-and-derived-contract.md) — the derivation this gate proves.
- [`task-obj-03-…`](./task-obj-03-exam-card-and-host.md) — the UI whose round-trip this verifies.
- **Precedent:** subjective `subj-10` close-gate ([`../../../../03-06-2026/subjective-tab/p3-polish/`](../../../../03-06-2026/subjective-tab/p3-polish/)).

---

**Last Updated:** 2026-06-18  
**Pattern:** Subjective `subj-10` `cc`/`hopi` byte-parity close-gate ported to `examination_findings`.
