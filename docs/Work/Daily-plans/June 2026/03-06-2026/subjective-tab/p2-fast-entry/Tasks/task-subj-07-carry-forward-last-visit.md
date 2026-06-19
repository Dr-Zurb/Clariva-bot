# Task subj-07: Carry-forward subjective from last visit (one tap)

> **Filename:** `task-subj-07-carry-forward-last-visit.md` in `subjective-tab/p2-fast-entry/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

For follow-ups, let the doctor pull the **subjective from the patient's last visit** into the
current note in one tap — complaint cards + owned histories — then edit the delta (ST.7).
Scoped to subjective fields only; reuses the prior-Rx surface pattern.

**Program / Phase:** subjective-tab · Phase 2 (fast-entry)  
**Batch:** [`plan-p2-subjective-tab-fast-entry-batch.md`](../plan-p2-subjective-tab-fast-entry-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-subjective-tab-fast-entry.md`](./EXECUTION-ORDER-p2-subjective-tab-fast-entry.md)  
**Estimated Time:** ~1.5 hours  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **New feature** — a read query + a carry-forward action/CTA.

**Current State:**
- ✅ **What exists:** `complaints` + history fields + reducer (Phase 1); the prior-Rx surface [`PreviousRxPopover.tsx`](../../../../../../../../frontend/components/consultation/cockpit/PreviousRxPopover.tsx); the prescription read service `backend/src/services/prescription-service.ts`.
- ✅ **What's missing:** ~~a "last subjective for patient" read; the carry-forward CTA + copy-all / pick-fields apply.~~ **Done.**

**Scope Guard:**
- Expected files touched: ≤ 4 (service read, CTA component, wiring in the tab, a test).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md) (doctor-scoped reads; PHI) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Read the last subjective
- [x] ✅ 1.1 Add `getLastSubjectiveForPatient(patientId, beforeAppointmentId)` returning `complaints` + the 3 history fields from the most recent prior prescription (doctor-scoped RLS). - **Completed: 2026-06-03**

### 2. Carry-forward UX
- [x] ✅ 2.1 A CTA that appears only when a prior subjective exists; "copy all" hydrates everything; "pick fields" selects which groups to copy. - **Completed: 2026-06-03**
- [x] ✅ 2.2 Apply via the Phase-1 reducer actions (so autosave fires) and re-resolve the card schemas (subj-03). - **Completed: 2026-06-03** (`SET_COMPLAINTS` + `SET_FIELD`; category preserved on cloned cards)

### 3. Verification & Testing
- [x] ✅ 3.1 Test: CTA hidden when no prior; copy-all + pick-fields hydrate correctly; autosaves; RLS keeps it doctor-scoped. - **Completed: 2026-06-03**
- [x] ✅ 3.2 `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/prescription-service.ts (getLastSubjectiveForPatient + route if needed)
CREATE: frontend/components/cockpit/rx/subjective/CarryForwardButton.tsx
UPDATE: the Subjective tab to mount the CTA
CREATE/UPDATE: a test for the read + apply
DO NOT TOUCH: the prescriptions schema; medicines/plan carry-forward (separate)
```

**When updating existing code:**
- [x] Doctor-scoped read with patient access gate (mirrors `listPrescriptionsByPatient`).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Subjective-only** — copies `complaints` + FH/SH/PSH; does not touch Dx/meds/plan.
- **Fills the array (ST-D1)** — hydrates structured state, not raw `cc`/`hopi`.
- **Doctor-scoped read** — RLS on `prescriptions` (migration 026) governs; no cross-patient leakage.
- **Appears only when useful** — hide the CTA when there's no prior subjective.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — reads prior `prescriptions` (PHI).
  - [x] **RLS verified?** **Yes** — doctor-scoped (migration 026); the read filters by doctor + patient.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (read-only of existing data).

---

## ✅ Acceptance & Verification Criteria

- [x] CTA appears only on follow-ups with a prior subjective; copy-all + pick-fields hydrate the cards + histories; autosaves; doctor-scoped; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The biggest single friction killer for chronic/follow-up patients — pull-and-edit beats re-type.

---

## 🔗 Related Tasks

- [`task-subj-06-complaint-master-and-favorites.md`](./task-subj-06-complaint-master-and-favorites.md) — the substrate.
- [`task-subj-08-subjective-presets.md`](./task-subj-08-subjective-presets.md) — the template counterpart.

---

**Last Updated:** 2026-06-03  
**Pattern:** prior-Rx surface reused for a subjective-only copy-forward.  
**Reference:** `process/CODE_CHANGE_RULES.md`
