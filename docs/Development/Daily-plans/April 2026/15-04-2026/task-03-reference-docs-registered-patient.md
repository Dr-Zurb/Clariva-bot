# Task 03: Reference docs — registered patient vs intake (doctor roster)
## 2026-04-15 — Phase C

---

## Task Overview

Add concise **reference documentation** explaining: **early intake** (data collection, reminders, consent) vs **registered patient** (MRN, visible in doctor **Patients** list). Link to daily plan and tasks. Optional: one paragraph for **internal runbook** (what ops/support sees vs doctor dashboard).

**Estimated Time:** 1 hour  
**Status:** DONE  
**Completed:** 2026-04-15

**Change Type:**
- [x] **New feature** — Docs only (no production code)

**Current State:**
- **What exists:** [15-04-2026 README](./README.md) problem statement; migration 046 comments; `Patient` type docs in `database.ts`
- **What's missing:** A **Reference** doc discoverable from ARCHITECTURE/ONBOARDING or PATIENT-adjacent docs
- **Notes:** Keep short; avoid duplicating full booking flow ([APPOINTMENT_BOOKING_FLOW.md](../../../../Reference/APPOINTMENT_BOOKING_FLOW.md))

**Scope Guard:**
- Expected files touched: 1–2 markdown files + optional README link
- No scope creep into full philosophy rewrite

**Reference Documentation:**
- [15-04-2026 README](./README.md)
- [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)

---

## Task Breakdown

### 1. Choose location
- [x] 1.1 Add `docs/Reference/PATIENT_REGISTRATION_AND_ROSTER.md` **or** a section under existing [APPOINTMENT_REASON_AND_NOTES.md](../../../../Reference/APPOINTMENT_REASON_AND_NOTES.md) — pick one place and stick to it
- [x] 1.2 Add a “See also” link from [ARCHITECTURE.md](../../../../Reference/ARCHITECTURE.md) or [ONBOARDING.md](../../../../Reference/ONBOARDING.md) if a natural anchor exists (no `docs/Reference/README.md` index in repo)

### 2. Content
- [x] 2.1 Define **intake** vs **registered** (MRN, doctor list)
- [x] 2.2 Mention paid path vs zero-fee path (pointer to task-02)
- [x] 2.3 Link [deferred doctor add patient](../../../deferred/deferred-doctor-ui-add-patient-2026-04.md)

### 3. Verification
- [x] 3.1 Links resolve (relative paths)
- [x] 3.2 No stale claim that “all patients in conversations show in UI”

---

## Files to Create/Update

```
docs/Reference/{NEW_OR_UPDATED}.md
docs/Development/Daily-plans/April 2026/15-04-2026/README.md — optional “Docs” bullet under Phase C
```

---

## Design Constraints

- Accurate for implementers; no PHI examples
- Align wording with product decisions in [README](./README.md)

---

## Global Safety Gate

- [x] **Data touched?** No
- [x] **Any PHI in logs?** N/A
- [x] **External API or AI call?** No
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Single canonical Reference note exists for “who appears in Patients”
- [x] Deferred manual patient doc cross-linked
- [x] Daily plan README can point to this doc from Phase C

---

## Related Tasks

- [Task 01](./task-01-patients-list-mrn-filter.md)
- [Task 02](./task-02-mrn-zero-fee-booking-complete.md)

---

**Last Updated:** 2026-04-15  
**Reference:** [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)
