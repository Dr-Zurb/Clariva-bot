# Task subj-05: Linked patient-background sections (PMH / allergies / current meds)

> **Filename:** `task-subj-05-linked-chart-sections.md` in `subjective-tab/p1-complaint-cards/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Surface the patient-level histories that already have shipped homes — **PMH / chronic
conditions**, **allergies**, **current medications / problem list** — as a **linked
"Patient background" zone** inside the Subjective tab (read + quick-add), so the doctor
confirms/updates them in place instead of re-typing them into the note (ST-D3). No new
writes to the prescription; the sections keep writing to their own patient-level tables.

**Program / Phase:** subjective-tab · Phase 1 (complaint-cards)  
**Batch:** [`plan-p1-subjective-tab-complaint-cards-batch.md`](../plan-p1-subjective-tab-complaint-cards-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md`](./EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md)  
**Estimated Time:** ~2 hours  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **Update existing** — mount shipped sections in a new location; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** the shipped, doctor-scoped patient-level sections [`ChronicConditionsSection.tsx`](../../../../../../../../frontend/components/ehr/sections/ChronicConditionsSection.tsx), [`AllergiesSection.tsx`](../../../../../../../../frontend/components/ehr/sections/AllergiesSection.tsx), [`ProblemListSection.tsx`](../../../../../../../../frontend/components/ehr/sections/ProblemListSection.tsx) (backed by migration 087 tables); the host [`SubjectivePane.tsx`](../../../../../../../../frontend/components/patient-profile/panes/SubjectivePane.tsx) (has `patientId`/`token` available via the cockpit context).
- ✅ **What's missing:** ~~a "Patient background" zone in the Subjective tab mounting these sections; the current-meds/problem strip selection.~~ **Done** — `PatientBackgroundZone` mounted below visit histories in `SubjectiveSection`.
- ⚠️ **Notes:** allergies already feed the cockpit **safety strip** — embedding the section must not double-fetch in a way that breaks/contradicts it. Read-only mounts (review) must hide add affordances.

**Scope Guard:**
- Expected files touched: ≤ 3 (the pane/section wiring + a small "background zone" wrapper + a test). **Do not** modify the chart sections' internals or their data layer.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) (reusing shipped components in a new mount — audit their required props) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) (PHI; doctor-scoped RLS) · [FRONTEND_ARCHITECTURE.md](../../../../../../../Reference/engineering/architecture/ARCHITECTURE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Background zone
- [x] ✅ 1.1 Add a collapsible "Patient background" zone below the owned fields in the Subjective tab. - **Completed: 2026-06-03**
- [x] ✅ 1.2 Mount `ChronicConditionsSection` (PMH), `AllergiesSection`, and a current-meds/problem strip, passing the required `patientId` / `token` / layout / mode props from the cockpit context. - **Completed: 2026-06-03**

### 2. Safety + read-only correctness
- [x] ✅ 2.1 Verify allergies continue to feed the safety strip (no regression / no contradictory state); avoid duplicate-write paths. - **Completed: 2026-06-03** (sections write patient-level tables only; safety strip uses separate `useRxSafetySurface` fetch — no prescription writes from zone)
- [x] ✅ 2.2 In read-only (review/ended) mounts, hide add/edit affordances. - **Completed: 2026-06-03** (`canEditPrescriptionDraft` → `mode="readonly"` + `hideAdd`)

### 3. Verification & Testing
- [x] ✅ 3.1 Test: sections render with data; add/archive still work; no write to `prescriptions` from this zone. - **Completed: 2026-06-03**
- [x] ✅ 3.2 Collapsible; a11y; `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/patient-profile/panes/SubjectivePane.tsx (mount background zone)
CREATE: frontend/components/cockpit/rx/subjective/PatientBackgroundZone.tsx (thin wrapper)
CREATE/UPDATE: a test asserting sections render + no prescription write
DO NOT TOUCH: ChronicConditionsSection / AllergiesSection / ProblemListSection internals or their services
```

**When updating existing code:**
- [x] Audit the sections' required props + their data hooks before mounting — [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).
- [x] Confirm no second source of truth for allergies vs the safety strip.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Link, never re-key (ST-D3).** This zone reads/writes the patient-level tables via the shipped sections; it must not copy that data into the `prescriptions` note.
- **No double-write / no safety-strip regression** — allergies remain the single source the safety strip reads.
- **Read-only correctness** — hide mutation affordances in review mounts.
- **Don't fork the sections** — reuse them as-is; doctor-scoped RLS already governs their data.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (via shipped sections only)** — patient-level PHI tables (migration 087).
  - [x] **RLS verified?** **Yes** — the sections are doctor-scoped (migration 087 RLS); this task adds no new query/table.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (no new storage; existing tables' retention applies).

---

## ✅ Acceptance & Verification Criteria

- [x] PMH / allergies / current-meds render as a linked, collapsible background zone (read + quick-add); add/archive work; allergies still feed the safety strip; **no** write to `prescriptions`; read-only hides mutations; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The "link" half of ST-D3 — reuses three shipped sections so the note never double-keys
longitudinal patient data.

---

## 🔗 Related Tasks

- [`task-subj-04-owned-history-fields.md`](./task-subj-04-owned-history-fields.md) — the "own" half (FH/SH/PSH).
- [`task-subj-02-complaint-card-and-list-ui.md`](./task-subj-02-complaint-card-and-list-ui.md) — the tab host this zone sits below.

---

**Last Updated:** 2026-06-03  
**Pattern:** reuse shipped patient-level chart sections as a linked background zone (no re-key).  
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/TASK_MANAGEMENT_GUIDE.md`
