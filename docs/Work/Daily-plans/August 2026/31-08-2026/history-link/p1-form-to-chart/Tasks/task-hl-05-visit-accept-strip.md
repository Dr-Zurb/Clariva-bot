# Task hl-05: Visit accept strip

> **Model: Opus (max thinking). Auto must not run this task.** Writes doctor-scoped chart rows.

---

## 📋 Task Overview

When the doctor opens the visit and a submission exists, show the four groups as accept-cards. Each accept calls the **existing** create-row service for that table (or seeds `cc` / `hopi`). Nothing auto-applies.

**Program / Phase:** history-link · Phase 1
**Batch:** [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md)
**Estimated Time:** ~5 hours
**Status:** ⏳ **PENDING**
**Completed:** —

**Change Type:**
- [x] **New feature** — new strip; chart writes reuse existing services

**Current State:**
- ✅ `AllergiesSection`, chronic conditions, medications — doctor add paths already exist.
- ✅ Visit-narrative accept cards — trust model to **mirror**, not import.
- ❌ No "patient sent this before the visit" surface.

**Scope Guard:** ≤ 8 files. No bulk accept. No ALTER of chart tables. No change to visit-narrative extract/apply. Do not pre-fill the public form from this data.

**Reference:** HL-DL-1, 3, 8 · HL-Q3 · VN-DL-12 (inherited posture)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `hl-03` green; row shape locked.
- [ ] 1.2 Find the existing create-row services for allergies, conditions, medications. Accept **calls them**. Do not open a second insert path.

### 2. Read + render
- [ ] 2.1 Authenticated GET for the acting doctor: submission for this appointment, or 404.
- [ ] 2.2 Strip on the visit / Subjective host: why-today, allergies, medicines, conditions. "None" shown as a dismissed-looking note, not an accept card.
- [ ] 2.3 No "Add all".

### 3. Accept
- [ ] 3.1 Allergy item → existing create; `severity='unknown'`; skip if case-insensitive name match on a non-archived row.
- [ ] 3.1.1 Allergy **"none"** → set `patient_allergies_section_notes.no_known_allergies` (`222`). Do not insert a dummy allergen.
- [ ] 3.2 Medicine → existing create; `status='active'`; **`source='self'`** (enum already on the table). Same dedup on `drug_name`. "None" inserts nothing.
- [ ] 3.3 Condition → existing create (`condition` only); same dedup. "None" inserts nothing.
- [ ] 3.4 Why-today → seed `cc` / `hopi` per HL-Q3. Append, do not wipe a doctor-typed value. Do **not** write `appointments.reason_for_visit`.
- [ ] 3.5 Record accept (who / when / which item) without storing a second copy of the clinical text if the sidecar already has it — item id + target row id is enough.

### 4. Tests
- [ ] 4.1 Accept calls the existing service (mock). Duplicate name does not insert.
- [ ] 4.2 "None" has no accept control.
- [ ] 4.3 Strip hidden when no submission.
- [ ] 4.4 No PHI in logs.

---

## 📁 Files

```
CREATE: backend accept service (thin orchestrator over existing creates)
CREATE: frontend accept-strip component on the visit / Subjective host
CREATE: tests
```

## 🧠 Design Constraints (NO IMPLEMENTATION)

- A row created here is indistinguishable from a doctor-typed row **on the chart table** — that is why the sidecar + accept record exist. Do not add `source` columns to `087`/`128` in this task (that is a later migration if an auditor needs it).
- Do not import `VisitNarrativeAmendment` and "just change the source". Different data, different host.

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — writes existing PHI tables via existing services.
- [ ] RLS? Unchanged on those tables; endpoint is doctor-scoped.
- [ ] PHI in logs? No.
- [ ] AI? No.

---

**Last Updated:** 2026-08-31
**Completed:** —
